import { getNextInvoiceNumber, peekNextInvoiceNumber, receiptFromInvoiceNumber } from './invoiceNumber.js';

/** @deprecated Receipt numbers are derived from invoice numbers — kept for API compatibility. */
export async function getNextReceiptNumber(userId) {
    const nextInv = await getNextInvoiceNumber(userId);
    return receiptFromInvoiceNumber(nextInv);
}

/** Preview next receipt number without allocating it. */
export async function peekNextReceiptNumber(userId) {
    const nextInv = await peekNextInvoiceNumber(userId);
    return receiptFromInvoiceNumber(nextInv);
}
