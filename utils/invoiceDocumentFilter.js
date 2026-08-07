/** Match invoice-type records only (excludes standalone receipts). */
export const INVOICE_ONLY_FILTER = {
    $or: [{ documentType: 'invoice' }, { documentType: { $exists: false } }],
};

/** Match standalone receipt records only. */
export const RECEIPT_ONLY_FILTER = {
    documentType: 'receipt',
};
