import test from 'node:test';
import assert from 'node:assert/strict';
import {
    docCountsAsRealizedSale,
    computePaidRatio,
} from '../utils/realizedSales.js';
import { computeDocumentProfit } from '../utils/profitAnalytics.js';

test('docCountsAsRealizedSale excludes pending invoices', () => {
    assert.equal(
        docCountsAsRealizedSale({
            documentType: 'invoice',
            status: 'pending',
            total: 5000,
            amountPaid: 0,
        }),
        false
    );
});

test('docCountsAsRealizedSale includes partial invoices with payment', () => {
    assert.equal(
        docCountsAsRealizedSale({
            documentType: 'invoice',
            status: 'partial',
            total: 5000,
            amountPaid: 2000,
        }),
        true
    );
    assert.equal(computePaidRatio({ status: 'partial', total: 5000, amountPaid: 2000 }), 0.4);
});

test('docCountsAsRealizedSale includes paid receipts', () => {
    assert.equal(
        docCountsAsRealizedSale({
            documentType: 'receipt',
            status: 'paid',
            total: 1000,
            amountPaid: 1000,
        }),
        true
    );
});

test('computeDocumentProfit ignores pending invoices', () => {
    const doc = {
        status: 'pending',
        total: 5000,
        amountPaid: 0,
        discount: 0,
        items: [{ productId: 'p1', quantity: 1, rate: 5000, unitCost: 1000 }],
    };

    const profit = computeDocumentProfit(doc);
    assert.equal(profit.revenue, 0);
    assert.equal(profit.grossProfit, 0);
});
