import PurchaseOrder from '../models/PurchaseOrder.js';
import { incrementDocumentSequence } from './documentCounter.js';

const PO_PREFIX = 'PO';

export function extractPurchaseOrderSequence(raw) {
    const match = String(raw || '').match(/^PO-(\d+)$/i);
    return match ? parseInt(match[1], 10) : 0;
}

async function seedPurchaseOrderSequenceMax(userId) {
    const orders = await PurchaseOrder.find({ userId }).select('purchaseOrderNumber').lean();
    let max = 0;
    for (const order of orders) {
        max = Math.max(max, extractPurchaseOrderSequence(order.purchaseOrderNumber));
    }
    return max;
}

export async function getNextPurchaseOrderNumber(userId) {
    const next = await incrementDocumentSequence(
        userId,
        'purchaseOrderSeq',
        seedPurchaseOrderSequenceMax
    );
    return `${PO_PREFIX}-${String(next).padStart(4, '0')}`;
}

export { PO_PREFIX };
