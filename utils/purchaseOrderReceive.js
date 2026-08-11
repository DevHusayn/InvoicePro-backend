import mongoose from 'mongoose';
import Product from '../models/Product.js';
import BusinessInfo from '../models/CompanyInfo.js';
import {
    PO_CANCELLED,
    PO_DRAFT,
    PO_PARTIAL,
    PO_RECEIVED,
    PO_RECEIVABLE,
    PO_SENT,
    computePurchaseOrderStatus,
} from './purchaseOrderValidation.js';
import { recordStockMovement } from './stockLedger.js';
import { computeWeightedAverageCost } from './itemCostSnapshot.js';

async function shouldAutoUpdateCostFromPO(userId) {
    const info = await BusinessInfo.findOne({ userId }).select('autoUpdateCostFromPO').lean();
    return Boolean(info?.autoUpdateCostFromPO);
}

async function updateProductCostFromReceive(userId, productId, receivedQty, poRate) {
    const product = await Product.findOne({ _id: productId, userId });
    if (!product) return;

    const newQty = Number(product.quantityOnHand) || 0;
    const oldQty = Math.max(0, newQty - (Number(receivedQty) || 0));
    product.unitCost = computeWeightedAverageCost(oldQty, product.unitCost, receivedQty, poRate);
    await product.save();
}

function validationError(message, status = 400) {
    const err = new Error(message);
    err.status = status;
    throw err;
}

async function applyReceiveDelta(userId, productId, delta, session, poMeta) {
    if (!delta || !productId) return null;

    const opts = session ? { session, new: true } : { new: true };
    const product = await Product.findOneAndUpdate(
        { _id: productId, userId, trackInventory: true },
        { $inc: { quantityOnHand: delta } },
        opts
    );

    if (!product) return null;

    await recordStockMovement({
        userId,
        productId,
        delta,
        balanceAfter: product.quantityOnHand ?? 0,
        source: 'purchase_order',
        action: 'receive',
        documentId: poMeta.documentId,
        documentNumber: poMeta.documentNumber,
        note: poMeta.note || '',
        session,
    });

    return product;
}

/**
 * Receive stock against a purchase order line.
 * @param {object} purchaseOrder - mongoose doc
 * @param {Array<{ lineIndex: number, quantity: number }>} receiveLines
 */
export async function receivePurchaseOrderLines(userId, purchaseOrder, receiveLines) {
    const status = purchaseOrder.status || PO_DRAFT;
    if (status === PO_DRAFT) {
        validationError('Place the purchase order before receiving stock.');
    }
    if (status === PO_CANCELLED) {
        validationError('Cancelled purchase orders cannot receive stock.');
    }
    if (status === PO_RECEIVED) {
        validationError('This purchase order is already fully received.');
    }
    if (!PO_RECEIVABLE.includes(status) && status !== PO_SENT) {
        validationError('This purchase order cannot receive stock in its current status.');
    }

    const items = purchaseOrder.items.map((item) =>
        typeof item.toObject === 'function' ? item.toObject() : { ...item }
    );

    const stockUpdates = [];

    for (const line of receiveLines) {
        const item = items[line.lineIndex];
        if (!item) {
            validationError(`Line ${line.lineIndex + 1} does not exist on this purchase order.`);
        }

        const ordered = Number(item.quantity) || 0;
        const alreadyReceived = Number(item.quantityReceived) || 0;
        const remaining = ordered - alreadyReceived;

        if (remaining <= 0) {
            validationError(`Line ${line.lineIndex + 1} is already fully received.`);
        }

        if (line.quantity > remaining) {
            validationError(
                `Cannot receive ${line.quantity} on line ${line.lineIndex + 1}. Only ${remaining} remaining.`
            );
        }

        item.quantityReceived = alreadyReceived + line.quantity;

        if (item.productId) {
            stockUpdates.push({
                productId: item.productId,
                delta: line.quantity,
                poRate: Number(item.rate) || 0,
            });
        }
    }

    purchaseOrder.items = items;
    purchaseOrder.status = computePurchaseOrderStatus(items);
    purchaseOrder.markModified('items');

    const poMeta = {
        documentId: purchaseOrder._id,
        documentNumber: purchaseOrder.purchaseOrderNumber || null,
        note: '',
    };
    const autoUpdateCost = await shouldAutoUpdateCostFromPO(userId);

    if (mongoose.connection.readyState === 1 && stockUpdates.length > 1) {
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                for (const update of stockUpdates) {
                    await applyReceiveDelta(userId, update.productId, update.delta, session, poMeta);
                    if (autoUpdateCost) {
                        await updateProductCostFromReceive(
                            userId,
                            update.productId,
                            update.delta,
                            update.poRate
                        );
                    }
                }
                await purchaseOrder.save({ session });
            });
        } finally {
            await session.endSession();
        }
    } else {
        for (const update of stockUpdates) {
            await applyReceiveDelta(userId, update.productId, update.delta, null, poMeta);
            if (autoUpdateCost) {
                await updateProductCostFromReceive(
                    userId,
                    update.productId,
                    update.delta,
                    update.poRate
                );
            }
        }
        await purchaseOrder.save();
    }

    return purchaseOrder;
}
