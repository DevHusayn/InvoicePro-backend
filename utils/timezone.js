import BusinessInfo from '../models/CompanyInfo.js';

export const DEFAULT_BUSINESS_TIMEZONE = 'Africa/Lagos';

export function normalizeTimezone(value) {
    const tz = String(value || '').trim();
    if (!tz || !isValidTimezone(tz)) return DEFAULT_BUSINESS_TIMEZONE;
    return tz;
}

export function isValidTimezone(timeZone) {
    try {
        Intl.DateTimeFormat(undefined, { timeZone });
        return true;
    } catch {
        return false;
    }
}

export function getDatePartsInTimezone(timeZone, date = new Date()) {
    const tz = normalizeTimezone(timeZone);
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-CA', {
            timeZone: tz,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        })
            .formatToParts(date)
            .filter((part) => part.type !== 'literal')
            .map((part) => [part.type, part.value])
    );
    return {
        year: Number.parseInt(parts.year, 10),
        month: Number.parseInt(parts.month, 10),
        day: Number.parseInt(parts.day, 10),
    };
}

export function getYearMonthInTimezone(timeZone, date = new Date()) {
    const { year, month } = getDatePartsInTimezone(timeZone, date);
    return { year, month };
}

export function toDateInputValue(year, month, day) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function shiftDateByDays(year, month, day, deltaDays) {
    const utc = new Date(Date.UTC(year, month - 1, day + deltaDays));
    return {
        year: utc.getUTCFullYear(),
        month: utc.getUTCMonth() + 1,
        day: utc.getUTCDate(),
    };
}

function parseMonthParts(query = {}) {
    const year = Number.parseInt(String(query.summaryYear ?? query.year ?? ''), 10);
    const month = Number.parseInt(String(query.summaryMonth ?? query.month ?? ''), 10);
    if (
        Number.isFinite(year) &&
        Number.isFinite(month) &&
        month >= 1 &&
        month <= 12 &&
        year >= 1970 &&
        year <= 2100
    ) {
        return { year, month };
    }
    return null;
}

/**
 * Explicit period query. Returns null when callers should keep their existing default
 * (current month for summaries, all-time for lists).
 */
export function parsePeriodQuery(query = {}, timeZone, now = new Date()) {
    const raw = String(query.period ?? '').trim().toLowerCase();
    if (raw === 'all' || raw === 'alltime' || raw === 'all-time') {
        return { kind: 'all' };
    }
    if (raw === 'today') {
        return { kind: 'day', ...getDatePartsInTimezone(timeZone, now) };
    }

    const monthParts = parseMonthParts(query);
    if (raw === 'month') {
        if (monthParts) return { kind: 'month', ...monthParts };
        return { kind: 'month', ...getYearMonthInTimezone(timeZone, now) };
    }

    if (monthParts) return { kind: 'month', ...monthParts };
    return null;
}

export function resolveAnalyticsPeriod(query = {}, timeZone, now = new Date()) {
    const parsed = parsePeriodQuery(query, timeZone, now);
    if (parsed) return parsed;
    const { year, month } = parseSummaryPeriodQuery(query, timeZone);
    return { kind: 'month', year, month };
}

export function dateMatchesPeriod(dateValue, period, timeZone) {
    if (!period || period.kind === 'all') return true;
    if (!dateValue) return false;
    const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
    if (Number.isNaN(date.getTime())) return false;
    const parts = getDatePartsInTimezone(timeZone, date);
    if (period.kind === 'day') {
        return parts.year === period.year && parts.month === period.month && parts.day === period.day;
    }
    return parts.year === period.year && parts.month === period.month;
}

export function previousAnalyticsPeriod(period) {
    if (!period || period.kind === 'all') return null;
    if (period.kind === 'day') {
        return { kind: 'day', ...shiftDateByDays(period.year, period.month, period.day, -1) };
    }
    const index = period.year * 12 + (period.month - 1) - 1;
    return {
        kind: 'month',
        year: Math.floor(index / 12),
        month: (index % 12) + 1,
    };
}

export function formatAnalyticsPeriodLabel(period, locale = 'en-US') {
    if (!period || period.kind === 'all') return 'All time';
    if (period.kind === 'day') return 'Today';
    const date = new Date(Date.UTC(period.year, period.month - 1, 1));
    return new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
        date
    );
}

export function periodCacheKey(period) {
    if (!period || period.kind === 'all') return 'all';
    if (period.kind === 'day') {
        return `today:${toDateInputValue(period.year, period.month, period.day)}`;
    }
    return `month:${period.year}-${String(period.month).padStart(2, '0')}`;
}

export function parseSummaryPeriodQuery(query, timeZone) {
    const year = Number.parseInt(String(query.summaryYear ?? ''), 10);
    const month = Number.parseInt(String(query.summaryMonth ?? ''), 10);
    if (
        Number.isFinite(year) &&
        Number.isFinite(month) &&
        month >= 1 &&
        month <= 12 &&
        year >= 1970 &&
        year <= 2100
    ) {
        return { year, month };
    }
    return getYearMonthInTimezone(timeZone);
}

function zonedWallClockToUtc({ year, month, day, hour = 0, minute = 0, second = 0 }, timeZone) {
    const tz = normalizeTimezone(timeZone);
    let timestamp = Date.UTC(year, month - 1, day, hour, minute, second);
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });

    for (let attempt = 0; attempt < 4; attempt += 1) {
        const parts = Object.fromEntries(
            formatter
                .formatToParts(new Date(timestamp))
                .filter((part) => part.type !== 'literal')
                .map((part) => [part.type, part.value])
        );
        const asUtc = Date.UTC(
            Number.parseInt(parts.year, 10),
            Number.parseInt(parts.month, 10) - 1,
            Number.parseInt(parts.day, 10),
            Number.parseInt(parts.hour, 10),
            Number.parseInt(parts.minute, 10),
            Number.parseInt(parts.second, 10)
        );
        const desired = Date.UTC(year, month - 1, day, hour, minute, second);
        const delta = desired - asUtc;
        if (delta === 0) break;
        timestamp += delta;
    }

    return new Date(timestamp);
}

/** Inclusive start, exclusive end — UTC instants for a calendar month in a timezone. */
export function getUtcRangeForMonthInTimezone(year, month, timeZone) {
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    return {
        start: zonedWallClockToUtc({ year, month, day: 1 }, timeZone),
        end: zonedWallClockToUtc({ year: nextYear, month: nextMonth, day: 1 }, timeZone),
    };
}

/** Inclusive start, exclusive end — UTC instants for a calendar day in a timezone. */
export function getUtcRangeForDayInTimezone(year, month, day, timeZone) {
    const next = shiftDateByDays(year, month, day, 1);
    return {
        start: zonedWallClockToUtc({ year, month, day }, timeZone),
        end: zonedWallClockToUtc({ year: next.year, month: next.month, day: next.day }, timeZone),
    };
}

export async function getBusinessTimezone(userId) {
    const doc = await BusinessInfo.findOne({ userId }).select('timezone').lean();
    return normalizeTimezone(doc?.timezone);
}
