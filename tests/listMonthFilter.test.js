import test from 'node:test';
import assert from 'node:assert/strict';
import {
    parseListMonthQuery,
    parseListPeriodQuery,
    buildIssueDateMonthFilter,
    buildIssueDateDayFilter,
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

test('parseListPeriodQuery treats omit and all as all-time', () => {
    assert.equal(parseListPeriodQuery({}), null);
    assert.deepEqual(parseListPeriodQuery({ period: 'all' }), { kind: 'all' });
    assert.deepEqual(parseListPeriodQuery({ period: 'today' }), { kind: 'today' });
    assert.deepEqual(parseListPeriodQuery({ period: 'month', year: '2026', month: '8' }), {
        kind: 'month',
        year: 2026,
        month: 8,
    });
});

test('buildIssueDateDayFilter builds exclusive day range', () => {
    assert.deepEqual(buildIssueDateDayFilter(2026, 8, 14), {
        date: { $gte: '2026-08-14', $lt: '2026-08-15' },
    });
    assert.deepEqual(buildIssueDateDayFilter(2026, 8, 31), {
        date: { $gte: '2026-08-31', $lt: '2026-09-01' },
    });
});
