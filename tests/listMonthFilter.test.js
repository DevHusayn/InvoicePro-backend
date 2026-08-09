import test from 'node:test';
import assert from 'node:assert/strict';
import {
    parseListMonthQuery,
    buildIssueDateMonthFilter,
} from '../utils/listMonthFilter.js';

test('parseListMonthQuery returns null for missing params', () => {
    assert.equal(parseListMonthQuery({}), null);
    assert.equal(parseListMonthQuery({ year: '2026' }), null);
});

test('parseListMonthQuery parses valid year and month', () => {
    assert.deepEqual(parseListMonthQuery({ year: '2026', month: '8' }), { year: 2026, month: 8 });
});

test('buildIssueDateMonthFilter builds date string range', () => {
    assert.deepEqual(buildIssueDateMonthFilter(2026, 8), {
        date: { $gte: '2026-08-01', $lt: '2026-09-01' },
    });
    assert.deepEqual(buildIssueDateMonthFilter(2026, 12), {
        date: { $gte: '2026-12-01', $lt: '2027-01-01' },
    });
});
