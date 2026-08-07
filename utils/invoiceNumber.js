import Invoice from '../models/Invoice.js';
import { incrementDocumentSequence, peekDocumentSequence } from './documentCounter.js';

const INV_PREFIX = 'INV';
const RCP_PREFIX = 'RCP';

/** Extract numeric suffix from INV-0001 or RCP-0001 style strings. */
export function extractDocumentSequence(raw) {
    const match = String(raw || '').match(/^(?:INV|RCP)-(\d+)$/i);
    return match ? parseInt(match[1], 10) : 0;
}

/** Build RCP-0001 from INV-0001 (same sequence, shared numbering). */
export function receiptFromInvoiceNumber(invoiceNumber) {
    if (!invoiceNumber) return null;
    const seq = extractDocumentSequence(invoiceNumber);
    if (seq > 0) {
        return `${RCP_PREFIX}-${String(seq).padStart(4, '0')}`;
    }
    return `${RCP_PREFIX}-${String(invoiceNumber).replace(/\D/g, '') || '0001'}`.slice(0, 20);
}

async function seedInvoiceSequenceMax(userId) {
    const invoices = await Invoice.find({ userId }).select('invoiceNumber receiptNumber').lean();
    let max = 0;
    for (const inv of invoices) {
        max = Math.max(
            max,
            extractDocumentSequence(inv.invoiceNumber),
            extractDocumentSequence(inv.receiptNumber)
        );
    }
    return max;
}

/**
 * Next sequential number per user: INV-0001, INV-0002, …
 * Uses an atomic counter seeded from existing invoice/receipt numbers.
 */
export async function getNextInvoiceNumber(userId) {
    const next = await incrementDocumentSequence(userId, 'invoiceSeq', seedInvoiceSequenceMax);
    return `${INV_PREFIX}-${String(next).padStart(4, '0')}`;
}

/** Preview next invoice number without allocating it. */
export async function peekNextInvoiceNumber(userId) {
    const next = await peekDocumentSequence(userId, 'invoiceSeq', seedInvoiceSequenceMax);
    return `${INV_PREFIX}-${String(next).padStart(4, '0')}`;
}

export { RCP_PREFIX };
