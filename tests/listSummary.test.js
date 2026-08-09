import test from 'node:test';
import assert from 'node:assert/strict';
import { countListSummary, buildSummaryResponse } from '../utils/listSummary.js';

test('countListSummary compares new in period with previous month', async () => {
    const ranges = [];
    const Model = {
        countDocuments(filter) {
            if (!filter.createdAt) return Promise.resolve(100);
            ranges.push({
                start: filter.createdAt.$gte.toISOString(),
                end: filter.createdAt.$lt.toISOString(),
            });
            if (ranges.length === 1) return Promise.resolve(12);
            if (ranges.length === 2) return Promise.resolve(8);
            return Promise.resolve(0);
        },
    };

    const result = await countListSummary(Model, { userId: 'user-1' }, {
        year: 2026,
        month: 8,
        timeZone: 'Africa/Lagos',
    });

    assert.equal(result.newInPeriod, 12);
    assert.equal(result.previousNewInPeriod, 8);
    assert.deepEqual(result.comparison.newInPeriod, {
        kind: 'percent',
        value: 50,
        direction: 'up',
    });
    assert.deepEqual(result.previousPeriod, { year: 2026, month: 7 });
});

test('buildSummaryResponse includes comparison fields', () => {
    const response = buildSummaryResponse('totalInvoices', 42, {
        newInPeriod: 5,
        previousNewInPeriod: 0,
        comparison: { newInPeriod: { kind: 'new', direction: 'up' } },
        period: { year: 2026, month: 8, timezone: 'Africa/Lagos' },
        previousPeriod: { year: 2026, month: 7 },
    });

    assert.equal(response.totalInvoices, 42);
    assert.equal(response.newInPeriod, 5);
    assert.equal(response.previousNewInPeriod, 0);
    assert.deepEqual(response.comparison.newInPeriod, { kind: 'new', direction: 'up' });
    assert.deepEqual(response.previousPeriod, { year: 2026, month: 7 });
});
