import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getUtcRangeForMonthInTimezone,
    getYearMonthInTimezone,
    normalizeTimezone,
    parseSummaryPeriodQuery,
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
