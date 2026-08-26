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
import { buildSellingPricePrompts } from './purchaseOrderSellingPrice.js';

function roundMoney(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
}

async function snapshotLinkedProductsBeforeReceive(userId, items, receiveLines, session = null) {
    const productIds = [
        ...new Set(
            receiveLines
                .map((line) => items[line.lineIndex]?.productId)
                .filter(Boolean)
                .map(String)
        ),
    ];

    if (productIds.length === 0) return new Map();

    let query = Product.find({
        userId,
        _id: { $in: productIds },
    }).select('name unitCost unitPrice');

    if (session) {
        query = query.session(session);
    }

    const products = await query.lean();
    const snapshots = new Map();

    for (const product of products) {
        snapshots.set(String(product._id), {
            name: product.name,
            previousUnitCost: roundMoney(product.unitCost),
            previousUnitPrice: roundMoney(product.unitPrice),
        });
    }

    return snapshots;
}

async function shouldAutoUpdateCostFromPO(userId) {
    const info = await BusinessInfo.findOne({ userId }).select('autoUpdateCostFromPO').lean();
    return Boolean(info?.autoUpdateCostFromPO);
}

async function updateProductCostFromReceive(userId, productId, receivedQty, poRate, session = null) {
    let query = Product.findOne({ _id: productId, userId });
    if (session) {
        query = query.session(session);
    }
    const product = await query;
    if (!product) return;

    const newQty = Number(product.quantityOnHand) || 0;
    const oldQty = Math.max(0, newQty - (Number(receivedQty) || 0));
    product.unitCost = computeWeightedAverageCost(oldQty, product.unitCost, receivedQty, poRate);
    await product.save(session ? { session } : undefined);
}

function validationError(message, status = 400) {
    const err = new Error(message);
    err.status = status;
    throw err;
}

export function buildCatalogProductFromPoLine(userId, item) {
    const name = String(item?.description || '').trim();
    if (!name) {
        validationError('Each line item needs a description to add stock to your catalog.');
    }

    const unitCost = Number(item?.rate) || 0;

    return {
        userId,
        name,
        description: '',
        unitPrice: 0,
        unitCost,
        trackInventory: true,
        quantityOnHand: 0,
    };
}

async function findProductById(userId, productId, session = null) {
    let query = Product.findOne({ _id: productId, userId });
    if (session) {
        query = query.session(session);
    }
    return query;
}

async function createCatalogProduct(userId, item, session = null) {
    const payload = buildCatalogProductFromPoLine(userId, item);

    if (session) {
        const [product] = await Product.create([payload], { session });
        return product;
    }

    return Product.create(payload);
}

async function ensureProductForReceiveLine(userId, item, lineIndex, session = null) {
    if (item.productId) {
        const product = await findProductById(userId, item.productId, session);
        if (!product) {
            validationError(`Line ${lineIndex + 1} links to a product that no longer exists.`);
        }

        if (!product.trackInventory) {
            product.trackInventory = true;
            await product.save(session ? { session } : undefined);
        }

        return product._id;
    }

    const product = await createCatalogProduct(userId, item, session);
    return product._id;
}

async function ensureReceiveProductLinks(userId, items, receiveLines, session = null) {
    for (const line of receiveLines) {
        const item = items[line.lineIndex];
        item.productId = await ensureProductForReceiveLine(userId, item, line.lineIndex, session);
    }
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
    }

    const poMeta = {
        documentId: purchaseOrder._id,
        documentNumber: purchaseOrder.purchaseOrderNumber || null,
        note: '',
    };
    const autoUpdateCost = await shouldAutoUpdateCostFromPO(userId);
    let sellingPricePrompts = [];

    const runReceive = async (session) => {
        const snapshots = await snapshotLinkedProductsBeforeReceive(
            userId,
            items,
            receiveLines,
            session
        );

        await ensureReceiveProductLinks(userId, items, receiveLines, session);

        const stockUpdates = receiveLines.map((line) => {
            const item = items[line.lineIndex];
            return {
                productId: item.productId,
                delta: line.quantity,
                poRate: Number(item.rate) || 0,
            };
        });

        const receiveResults = [];

        for (const update of stockUpdates) {
            const product = await applyReceiveDelta(
                userId,
                update.productId,
                update.delta,
                session,
                poMeta
            );
            if (!product) {
                validationError('Could not update stock for one or more linked products.');
            }

            const snapshot = snapshots.get(String(update.productId));
            let newUnitCost = snapshot?.previousUnitCost ?? roundMoney(product.unitCost);

            if (autoUpdateCost) {
                await updateProductCostFromReceive(
                    userId,
                    update.productId,
                    update.delta,
                    update.poRate,
                    session
                );
                const refreshed = await findProductById(userId, update.productId, session);
                newUnitCost = roundMoney(refreshed?.unitCost ?? newUnitCost);
            }

            receiveResults.push({
                productId: update.productId,
                delta: update.delta,
                poRate: update.poRate,
                newUnitCost,
            });
        }

        sellingPricePrompts = buildSellingPricePrompts(snapshots, receiveResults);

        purchaseOrder.items = items;
        purchaseOrder.status = computePurchaseOrderStatus(items);
        purchaseOrder.markModified('items');
        await purchaseOrder.save(session ? { session } : undefined);
    };

    if (mongoose.connection.readyState === 1 && receiveLines.length > 1) {
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                await runReceive(session);
            });
        } finally {
            await session.endSession();
        }
    } else {
        await runReceive(null);
    }

    return { purchaseOrder, sellingPricePrompts };
}
