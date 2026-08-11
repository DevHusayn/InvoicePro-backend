import mongoose from 'mongoose';
import Invoice from '../models/Invoice.js';
import Product from '../models/Product.js';

function toUserObjectId(userId) {
    if (userId instanceof mongoose.Types.ObjectId) return userId;
    return new mongoose.Types.ObjectId(String(userId));
}

function roundMoney(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
}

function collectProductIdsFromDocs(docs) {
    const productIds = new Set();
    for (const doc of docs) {
        for (const item of doc.items || []) {
            if (item?.productId) productIds.add(String(item.productId));
        }
    }
    return productIds;
}

/** Prefer saved line snapshot; fall back to current catalog cost when snapshot is missing/zero. */
export function resolveLineUnitCost(item, productCostById = null) {
    const snapshot = Number(item?.unitCost) || 0;
    if (snapshot > 0) return snapshot;

    if (!item?.productId || !productCostById) return 0;

    const catalogCost = productCostById.get(String(item.productId));
    return Number(catalogCost) > 0 ? roundMoney(catalogCost) : 0;
}

export function lineHasCostData(item, productCostById = null) {
    if (!item?.productId) return false;
    return resolveLineUnitCost(item, productCostById) > 0;
}

export async function loadProductCostMap(userId, docs) {
    const productIds = collectProductIdsFromDocs(docs);
    if (!productIds.size) return new Map();

    const uid = toUserObjectId(userId);
    const products = await Product.find({
        userId: uid,
        _id: { $in: [...productIds].map((id) => new mongoose.Types.ObjectId(id)) },
    })
        .select('unitCost')
        .lean();

    return new Map(
        products.map((product) => [String(product._id), roundMoney(product.unitCost)])
    );
}

/**
 * Backfill unitCost on invoice line items that were saved before catalog cost existed.
 * Only updates lines where the snapshot is zero/missing.
 */
export async function backfillMissingLineCostSnapshots(userId, productId, unitCost) {
    const cost = roundMoney(unitCost);
    if (cost <= 0) return { linesUpdated: 0, documentsUpdated: 0 };

    const uid = toUserObjectId(userId);
    const productObjectId = new mongoose.Types.ObjectId(String(productId));

    const invoices = await Invoice.find({
        userId: uid,
        status: { $ne: 'draft' },
        'items.productId': productObjectId,
    });

    let linesUpdated = 0;
    let documentsUpdated = 0;

    for (const invoice of invoices) {
        let changed = false;

        for (const item of invoice.items) {
            if (!item?.productId || String(item.productId) !== String(productId)) continue;

            const snapshot = Number(item.unitCost) || 0;
            if (snapshot <= 0) {
                item.unitCost = cost;
                changed = true;
                linesUpdated += 1;
            }
        }

        if (changed) {
            invoice.markModified('items');
            await invoice.save();
            documentsUpdated += 1;
        }
    }

    return { linesUpdated, documentsUpdated };
}
