import StockMovement from '../models/StockMovement.js';

function toPlainDoc(doc) {
    if (!doc) return null;
    return typeof doc.toObject === 'function' ? doc.toObject() : doc;
}

function isInventoryCommitted(status) {
    return Boolean(status && status !== 'draft' && status !== 'cancelled');
}

export function inferLedgerAction(prevDoc, nextDoc) {
    if (!prevDoc && nextDoc) return 'issue';
    if (prevDoc && !nextDoc) return 'delete';
    const prev = toPlainDoc(prevDoc);
    const next = toPlainDoc(nextDoc);
    if (next?.status === 'cancelled' && prev?.status !== 'cancelled') return 'cancel';
    if (!isInventoryCommitted(prev?.status) && isInventoryCommitted(next?.status)) return 'issue';
    return 'update';
}

export function resolveLedgerDocument(prevDoc, nextDoc) {
    const doc = toPlainDoc(nextDoc) || toPlainDoc(prevDoc);
    if (!doc) {
        return { source: null, documentId: null, documentNumber: null };
    }

    const documentType = doc.documentType === 'receipt' ? 'receipt' : 'invoice';
    const documentNumber = documentType === 'receipt'
        ? (doc.receiptNumber || doc.invoiceNumber || null)
        : (doc.invoiceNumber || null);

    return {
        source: documentType,
        documentId: doc._id || null,
        documentNumber,
    };
}

export async function recordStockMovement({
    userId,
    productId,
    delta,
    balanceAfter,
    source,
    action,
    documentId = null,
    documentNumber = null,
    note = '',
    session = null,
}) {
    const parsedDelta = Number(delta);
    if (!parsedDelta) return null;

    const payload = {
        userId,
        productId,
        delta: parsedDelta,
        balanceAfter: Number(balanceAfter),
        source,
        action,
        documentId: documentId || null,
        documentNumber: documentNumber || null,
        note: String(note || '').trim(),
    };

    if (session) {
        const [entry] = await StockMovement.create([payload], { session });
        return entry;
    }

    return StockMovement.create(payload);
}

export async function recordStockMovements(entries, session = null) {
    const rows = entries.filter((entry) => Number(entry?.delta));
    if (!rows.length) return [];

    if (session) {
        return StockMovement.insertMany(rows, { session });
    }

    return StockMovement.insertMany(rows);
}

export async function recordInventoryTransitionMovements({
    userId,
    prevDoc = null,
    nextDoc = null,
    deltas,
    session = null,
}) {
    if (!deltas?.size) return [];

    const action = inferLedgerAction(prevDoc, nextDoc);
    const { source, documentId, documentNumber } = resolveLedgerDocument(prevDoc, nextDoc);
    if (!source) return [];

    const Product = (await import('../models/Product.js')).default;
    const entries = [];

    for (const [productId, delta] of deltas) {
        if (!delta) continue;

        let query = Product.findOne({ _id: productId, userId, trackInventory: true })
            .select('quantityOnHand');
        if (session) {
            query = query.session(session);
        }
        const product = await query.lean();

        if (!product) continue;

        entries.push({
            userId,
            productId,
            delta: Number(delta),
            balanceAfter: Number(product.quantityOnHand ?? 0),
            source,
            action,
            documentId,
            documentNumber,
            note: '',
        });
    }

    return recordStockMovements(entries, session);
}

export async function getStockHistory(userId, productId, { limit = 50 } = {}) {
    const rows = await StockMovement.find({ userId, productId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

    const mapped = rows.map((row) => ({
        id: String(row._id),
        delta: row.delta,
        balanceAfter: row.balanceAfter,
        source: row.source,
        action: row.action,
        documentId: row.documentId ? String(row.documentId) : null,
        documentNumber: row.documentNumber || null,
        note: row.note || '',
        date: row.createdAt?.toISOString?.() || null,
    }));

    if (mapped.length === 0) return mapped;

    const chronological = [...mapped].reverse();
    let running = Number(chronological[0].balanceAfter ?? 0) - Number(chronological[0].delta ?? 0);

    for (const row of chronological) {
        running += Number(row.delta ?? 0);
        row.balanceAfter = running;
    }

    return chronological.reverse();
}
