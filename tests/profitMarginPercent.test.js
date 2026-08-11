import test from 'node:test';
import assert from 'node:assert/strict';
import { computePeriodProfitFromDocs } from '../utils/profitAnalytics.js';

test('computePeriodProfitFromDocs margin percent uses one decimal place', () => {
    const doc = {
        date: '2026-02-10T00:00:00.000Z',
        status: 'paid',
        total: 300,
        amountPaid: 300,
        discount: 0,
        items: [{ productId: 'p1', quantity: 1, rate: 300, unitCost: 200 }],
    };

    const period = computePeriodProfitFromDocs([doc], 2026, 2, 'UTC');
    assert.equal(period.totals.grossProfit, 100);
    assert.equal(period.totals.marginPercent, 33.3);
});
