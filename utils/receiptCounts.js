import mongoose from 'mongoose';
import Invoice from '../models/Invoice.js';
import { RECEIPT_ONLY_FILTER } from './invoiceDocumentFilter.js';
import { buildReceiptPartialFilter } from './receiptValidation.js';

const PAID = 'paid';
const RECEIPT_LIST_BASE = { status: PAID, ...RECEIPT_ONLY_FILTER };

function toUserObjectId(userId) {
    if (userId instanceof mongoose.Types.ObjectId) return userId;
    return new mongoose.Types.ObjectId(String(userId));
}

/** Issued receipt counts split by full vs part received. */
export async function getReceiptPaymentStatusCounts(userId, extraMatch = {}) {
    const uid = toUserObjectId(userId);
    const base = { userId: uid, ...RECEIPT_LIST_BASE, ...extraMatch };
    const [all, partial] = await Promise.all([
        Invoice.countDocuments(base),
        Invoice.countDocuments({ ...base, ...buildReceiptPartialFilter() }),
    ]);
    return { all, partial, full: Math.max(0, all - partial) };
}
