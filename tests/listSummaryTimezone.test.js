import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getUtcRangeForMonthInTimezone,
    getUtcRangeForDayInTimezone,
    getYearMonthInTimezone,
    normalizeTimezone,
    parseSummaryPeriodQuery,
    parsePeriodQuery,
    resolveAnalyticsPeriod,
    previousAnalyticsPeriod,
    periodCacheKey,
} from '../utils/timezone.js';

test('normalizeTimezone falls back for invalid values', () => {
    assert.equal(normalizeTimezone(''), 'Africa/Lagos');
    assert.equal(normalizeTimezone('Not/AZone'), 'Africa/Lagos');
    assert.equal(normalizeTimezone('Europe/London'), 'Europe/London');
});

test('getUtcRangeForMonthInTimezone covers August 2026 in Lagos', () => {
    const { start, end } = getUtcRangeForMonthInTimezone(2026, 8, 'Africa/Lagos');
    assert.equal(start.toISOString(), '2026-07-31T23:00:00.000Z');
    assert.equal(end.toISOString(), '2026-08-31T23:00:00.000Z');
});

test('getUtcRangeForDayInTimezone covers 14 Aug 2026 in Lagos', () => {
    const { start, end } = getUtcRangeForDayInTimezone(2026, 8, 14, 'Africa/Lagos');
    assert.equal(start.toISOString(), '2026-08-13T23:00:00.000Z');
    assert.equal(end.toISOString(), '2026-08-14T23:00:00.000Z');
});

test('parseSummaryPeriodQuery defaults to business timezone month', () => {
    const period = parseSummaryPeriodQuery({}, 'Africa/Lagos');
    const current = getYearMonthInTimezone('Africa/Lagos');
    assert.deepEqual(period, current);
});

test('parseSummaryPeriodQuery accepts explicit summary month', () => {
    assert.deepEqual(parseSummaryPeriodQuery({ summaryYear: '2025', summaryMonth: '3' }, 'Africa/Lagos'), {
        year: 2025,
        month: 3,
    });
});

test('parsePeriodQuery returns all / today / month and null default', () => {
    assert.deepEqual(parsePeriodQuery({ period: 'all' }, 'Africa/Lagos'), { kind: 'all' });
    const today = parsePeriodQuery(
        { period: 'today' },
        'Africa/Lagos',
        new Date('2026-08-14T12:00:00.000Z')
    );
    assert.deepEqual(today, { kind: 'day', year: 2026, month: 8, day: 14 });
    assert.deepEqual(
        parsePeriodQuery({ period: 'month', summaryYear: '2026', summaryMonth: '3' }, 'Africa/Lagos'),
        { kind: 'month', year: 2026, month: 3 }
    );
    assert.equal(parsePeriodQuery({}, 'Africa/Lagos'), null);
});

test('resolveAnalyticsPeriod keeps omit-params as current month', () => {
    const resolved = resolveAnalyticsPeriod({}, 'Africa/Lagos');
    const current = getYearMonthInTimezone('Africa/Lagos');
    assert.equal(resolved.kind, 'month');
    assert.equal(resolved.year, current.year);
    assert.equal(resolved.month, current.month);
});

test('previousAnalyticsPeriod and cache keys', () => {
    assert.equal(previousAnalyticsPeriod({ kind: 'all' }), null);
    assert.deepEqual(previousAnalyticsPeriod({ kind: 'day', year: 2026, month: 8, day: 1 }), {
        kind: 'day',
        year: 2026,
        month: 7,
        day: 31,
    });
    assert.equal(periodCacheKey({ kind: 'all' }), 'all');
    assert.equal(periodCacheKey({ kind: 'day', year: 2026, month: 8, day: 14 }), 'today:2026-08-14');
    assert.equal(periodCacheKey({ kind: 'month', year: 2026, month: 8 }), 'month:2026-08');
});
