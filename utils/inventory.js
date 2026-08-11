import mongoose from 'mongoose';
import Product from '../models/Product.js';
import BusinessInfo from '../models/CompanyInfo.js';
import { recordInventoryTransitionMovements, recordStockMovement } from './stockLedger.js';

const DRAFT = 'draft';
const CANCELLED = 'cancelled';

function formatInsufficientStockMessage(shortfalls) {
    if (!Array.isArray(shortfalls) || shortfalls.length === 0) return 'Insufficient stock.';

    if (shortfalls.length === 1) {
        const entry = shortfalls[0];
        return `${entry.name} exceeds available stock (${entry.available} on hand).`;
    }

    const names = shortfalls.map((entry) => entry.name).join(', ');
    return `Insufficient stock for: ${names}. Adjust quantities or add stock.`;
}

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

export async function getAllowOverselling(userId) {
    const info = await BusinessInfo.findOne({ userId }).select('allowOverselling').lean();
    return Boolean(info?.allowOverselling);
}

async function updateProductStock(userId, productId, delta, session = null, { allowOverselling = false } = {}) {
    const opts = session ? { session } : {};

    if (allowOverselling || delta >= 0) {
        return Product.updateOne(
            { _id: productId, userId, trackInventory: true },
            { $inc: { quantityOnHand: delta } },
            opts
        );
    }

    const deduction = Math.abs(delta);
    const result = await Product.updateOne(
        {
            _id: productId,
            userId,
            trackInventory: true,
            quantityOnHand: { $gte: deduction },
        },
        { $inc: { quantityOnHand: delta } },
        opts
    );

    if (result.modifiedCount === 0) {
        const product = await Product.findOne({ _id: productId, userId })
            .select('name quantityOnHand trackInventory')
            .lean();

        // Untracked (or missing) products are not subject to stock checks.
        if (!product?.trackInventory) {
            return result;
        }

        const err = new Error(
            formatInsufficientStockMessage([{
                name: product.name,
                available: Number(product.quantityOnHand ?? 0),
            }])
        );
        err.status = 400;
        throw err;
    }

    return result;
}

export async function adjustProductStock(userId, productId, delta, session = null, options = {}) {
    if (!delta) return null;

    const allowOverselling = options.allowOverselling ?? false;
    if (!allowOverselling && delta < 0) {
        const existing = await Product.findOne({
            _id: productId,
            userId,
            trackInventory: true,
        })
            .select('name quantityOnHand')
            .lean();

        if (!existing) return null;

        const nextQty = Number(existing.quantityOnHand ?? 0) + delta;
        if (nextQty < 0) {
            const err = new Error(
                formatInsufficientStockMessage([{
                    name: existing.name,
                    available: Number(existing.quantityOnHand ?? 0),
                }])
            );
            err.status = 400;
            throw err;
        }
    }

    const opts = session ? { session, new: true } : { new: true };
    const product = await Product.findOneAndUpdate(
        { _id: productId, userId, trackInventory: true },
        { $inc: { quantityOnHand: delta } },
        opts
    );

    if (product) {
        await recordStockMovement({
            userId,
            productId,
            delta,
            balanceAfter: product.quantityOnHand ?? 0,
            source: 'manual',
            action: 'adjustment',
            session,
        });
    }

    return product;
}

async function applyStockDeltas(userId, deltas, session = null, { allowOverselling = false } = {}) {
    if (!deltas.size) return;

    for (const [productId, delta] of deltas) {
        if (!delta) continue;
        await updateProductStock(userId, productId, delta, session, { allowOverselling });
    }
}

/**
 * Apply inventory changes when a document is created, updated, or deleted.
 * prevDoc may be null on create; nextDoc may be null on delete.
 */
export async function applyInventoryTransition({
    userId,
    prevDoc = null,
    nextDoc = null,
    session = null,
    allowOverselling = false,
} = {}) {
    const prevCommitted = getCommittedQuantities(prevDoc);
    const nextCommitted = getCommittedQuantities(nextDoc);
    const deltas = computeStockDeltas(prevCommitted, nextCommitted);

    if (!deltas.size) return;

    if (!allowOverselling) {
        await assertStockAvailable(userId, { prevDoc, nextDoc });
    }

    if (session) {
        await applyStockDeltas(userId, deltas, session, { allowOverselling });
        await recordInventoryTransitionMovements({
            userId,
            prevDoc,
            nextDoc,
            deltas,
            session,
        });
        return;
    }

    if (deltas.size === 1) {
        await applyStockDeltas(userId, deltas, null, { allowOverselling });
        await recordInventoryTransitionMovements({
            userId,
            prevDoc,
            nextDoc,
            deltas,
        });
        return;
    }

    const runWithSession = async (activeSession) => {
        await applyStockDeltas(userId, deltas, activeSession, { allowOverselling });
        await recordInventoryTransitionMovements({
            userId,
            prevDoc,
            nextDoc,
            deltas,
            session: activeSession,
        });
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
    } catch (err) {
        if (err.status === 400) throw err;
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

/** Throw 400 when a committed document would oversell and overselling is disabled. */
export async function assertStockAvailable(userId, { prevDoc = null, nextDoc = null } = {}) {
    const warnings = await checkStockWarnings(userId, { prevDoc, nextDoc });
    if (warnings.length > 0) {
        const err = new Error(formatInsufficientStockMessage(warnings));
        err.status = 400;
        throw err;
    }
}

/** Attach stockWarnings to a plain document response when present. */
export function withStockWarnings(doc, stockWarnings) {
    const payload = doc?.toObject ? doc.toObject() : { ...doc };
    if (stockWarnings?.length) {
        payload.stockWarnings = stockWarnings;
    }
    return payload;
}
