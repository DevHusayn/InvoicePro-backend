import { MONEY_EPS } from './invoicePayments.js';

function roundMoney(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
}

export function amountPaidOf(doc) {
    const recorded = roundMoney(doc?.amountPaid);
    if (recorded > 0) return recorded;
    if (doc?.status === 'paid') return roundMoney(doc?.total);
    return 0;
}

export function computePaidRatio(doc) {
    const total = roundMoney(doc?.total);
    if (total <= 0) return 0;
    return Math.min(1, amountPaidOf(doc) / total);
}

/**
 * Only paid/partial invoices and issued receipts with recorded payment count toward
 * profit, qty sold, and revenue totals. Pending and unpaid overdue are excluded.
 */
export function docCountsAsRealizedSale(doc) {
    if (!doc || doc.status === 'draft' || doc.status === 'cancelled') return false;

    const paid = amountPaidOf(doc);
    if (paid <= MONEY_EPS) return false;

    if (doc.documentType === 'receipt') {
        return doc.status === 'paid';
    }

    return doc.status === 'paid' || doc.status === 'partial';
}

export function scaleByPaidRatio(quantity, lineTotal, lineProfit, paidRatio) {
    const ratio = Number(paidRatio) || 0;
    if (ratio <= 0) {
        return { quantity: 0, lineTotal: 0, lineProfit: 0 };
    }

    return {
        quantity: quantity * ratio,
        lineTotal: roundMoney(lineTotal * ratio),
        lineProfit: roundMoney(lineProfit * ratio),
    };
}
