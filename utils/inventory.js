import mongoose from 'mongoose';
import Product from '../models/Product.js';

const DRAFT = 'draft';
const CANCELLED = 'cancelled';

/** Document statuses that commit inventory (deduct stock). */
export function isInventoryCommitted(status) {
    return Boolean(status && status !== DRAFT && status !== CANCELLED);
}

/** Sum line-item quantities by productId. */
export function aggregateProductQuantities(items) {
    const map = new Map();
    if (!Array.isArray(items)) return map;

    for (const item of items) {
        if (!item?.productId) continue;
        const id = String(item.productId);
        const qty = Number(item.quantity) || 0;
        if (qty <= 0) continue;
        map.set(id, (map.get(id) || 0) + qty);
    }

    return map;
}

/** Stock delta per product: negative deducts, positive restores. */
export function computeStockDeltas(prevCommitted, nextCommitted) {
    const allIds = new Set([...prevCommitted.keys(), ...nextCommitted.keys()]);
    const deltas = new Map();

    for (const id of allIds) {
        const prev = prevCommitted.get(id) || 0;
        const next = nextCommitted.get(id) || 0;
        const change = next - prev;
        if (change !== 0) {
            deltas.set(id, -change);
        }
    }

    return deltas;
}

function getCommittedQuantities(doc) {
    if (!doc || !isInventoryCommitted(doc.status)) {
        return new Map();
    }
    return aggregateProductQuantities(doc.items);
}

export async function adjustProductStock(userId, productId, delta, session = null) {
    if (!delta) return null;

    const opts = session ? { session } : {};
    return Product.findOneAndUpdate(
        { _id: productId, userId, trackInventory: true },
        { $inc: { quantityOnHand: delta } },
        { new: true, ...opts }
    );
}

async function applyStockDeltas(userId, deltas, session = null) {
    if (!deltas.size) return;

    const opts = session ? { session } : {};
    for (const [productId, delta] of deltas) {
        if (!delta) continue;
        await Product.updateOne(
            { _id: productId, userId, trackInventory: true },
            { $inc: { quantityOnHand: delta } },
            opts
        );
    }
}

/**
 * Apply inventory changes when a document is created, updated, or deleted.
 * prevDoc may be null on create; nextDoc may be null on delete.
 */
export async function applyInventoryTransition({ userId, prevDoc = null, nextDoc = null, session = null }) {
    const prevCommitted = getCommittedQuantities(prevDoc);
    const nextCommitted = getCommittedQuantities(nextDoc);
    const deltas = computeStockDeltas(prevCommitted, nextCommitted);

    if (!deltas.size) return;

    if (session) {
        await applyStockDeltas(userId, deltas, session);
        return;
    }

    if (deltas.size === 1) {
        const [[productId, delta]] = deltas;
        await adjustProductStock(userId, productId, delta);
        return;
    }

    const runWithSession = async (activeSession) => {
        await applyStockDeltas(userId, deltas, activeSession);
    };

    if (mongoose.connection.readyState !== 1) {
        await runWithSession(null);
        return;
    }

    const activeSession = await mongoose.startSession();
    try {
        await activeSession.withTransaction(async () => {
            await runWithSession(activeSession);
        });
    } catch {
        await runWithSession(null);
    } finally {
        await activeSession.endSession();
    }
}

/**
 * Read-only check for overselling before/after a save.
 * Returns warnings without blocking the operation.
 */
export async function checkStockWarnings(userId, { prevDoc = null, nextDoc = null } = {}) {
    if (!nextDoc || !isInventoryCommitted(nextDoc.status)) {
        return [];
    }

    const prevCommitted = getCommittedQuantities(prevDoc);
    const nextCommitted = aggregateProductQuantities(nextDoc.items);
    const warnings = [];

    for (const [productId, nextQty] of nextCommitted) {
        const product = await Product.findOne({
            _id: productId,
            userId,
            trackInventory: true,
        })
            .select('name quantityOnHand')
            .lean();

        if (!product) continue;

        const prevQty = prevCommitted.get(productId) || 0;
        const additionalDeduction = nextQty - prevQty;
        if (additionalDeduction <= 0) continue;

        const available = Number(product.quantityOnHand) || 0;
        const shortfall = additionalDeduction - available;
        if (shortfall > 0) {
            warnings.push({
                productId,
                name: product.name,
                requested: nextQty,
                available,
                shortfall,
            });
        }
    }

    return warnings;
}

/** Attach stockWarnings to a plain document response when present. */
export function withStockWarnings(doc, stockWarnings) {
    const payload = doc?.toObject ? doc.toObject() : { ...doc };
    if (stockWarnings?.length) {
        payload.stockWarnings = stockWarnings;
    }
    return payload;
}
