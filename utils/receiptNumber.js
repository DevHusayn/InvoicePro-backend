import { getNextInvoiceNumber, receiptFromInvoiceNumber } from './invoiceNumber.js';

/** @deprecated Receipt numbers are derived from invoice numbers — kept for API compatibility. */
export async function getNextReceiptNumber(userId) {
    const nextInv = await getNextInvoiceNumber(userId);
    return receiptFromInvoiceNumber(nextInv);
}
