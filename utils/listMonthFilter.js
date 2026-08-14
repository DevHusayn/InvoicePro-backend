import {
    getBusinessTimezone,
    getDatePartsInTimezone,
    getUtcRangeForDayInTimezone,
    getUtcRangeForMonthInTimezone,
    toDateInputValue,
    shiftDateByDays,
} from './timezone.js';

/** Parse year/month list filter query params. Returns null when absent or invalid. */
export function parseListMonthQuery(query = {}) {
    const year = Number.parseInt(String(query.year ?? ''), 10);
    const month = Number.parseInt(String(query.month ?? ''), 10);
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
        return null;
    }
    return { year, month };
}

/** Parse list period. null / all = all-time (no date filter). */
export function parseListPeriodQuery(query = {}) {
    const raw = String(query.period ?? '').trim().toLowerCase();
    if (raw === 'all' || raw === 'alltime' || raw === 'all-time') {
        return { kind: 'all' };
    }
    if (raw === 'today') {
        return { kind: 'today' };
    }
    const month = parseListMonthQuery(query);
    if (month) return { kind: 'month', ...month };
    if (raw === 'month') return { kind: 'month-current' };
    return null;
}

/** Filter documents by issue date string (YYYY-MM-DD) within a calendar month. */
export function buildIssueDateMonthFilter(year, month) {
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
        return null;
    }
    const startStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const endStr = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
    return { date: { $gte: startStr, $lt: endStr } };
}

export function buildIssueDateDayFilter(year, month, day) {
    if (
        !Number.isFinite(year) ||
        !Number.isFinite(month) ||
        !Number.isFinite(day) ||
        month < 1 ||
        month > 12 ||
        day < 1 ||
        day > 31
    ) {
        return null;
    }
    const startStr = toDateInputValue(year, month, day);
    const next = shiftDateByDays(year, month, day, 1);
    const endStr = toDateInputValue(next.year, next.month, next.day);
    return { date: { $gte: startStr, $lt: endStr } };
}

/**
 * Mongo date filter for list endpoints.
 * dateField 'date' uses YYYY-MM-DD string ranges; 'createdAt' uses timezone UTC instants.
 */
export async function getListPeriodMongoFilter(query, userId, { dateField = 'date' } = {}) {
    const parsed = parseListPeriodQuery(query);
    if (!parsed || parsed.kind === 'all') return null;

    if (dateField === 'createdAt') {
        const timeZone = await getBusinessTimezone(userId);
        if (parsed.kind === 'today' || parsed.kind === 'month-current') {
            const parts = getDatePartsInTimezone(timeZone);
            if (parsed.kind === 'today') {
                const { start, end } = getUtcRangeForDayInTimezone(
                    parts.year,
                    parts.month,
                    parts.day,
                    timeZone
                );
                return { createdAt: { $gte: start, $lt: end } };
            }
            const { start, end } = getUtcRangeForMonthInTimezone(parts.year, parts.month, timeZone);
            return { createdAt: { $gte: start, $lt: end } };
        }
        const { start, end } = getUtcRangeForMonthInTimezone(parsed.year, parsed.month, timeZone);
        return { createdAt: { $gte: start, $lt: end } };
    }

    if (parsed.kind === 'today' || parsed.kind === 'month-current') {
        const timeZone = await getBusinessTimezone(userId);
        const parts = getDatePartsInTimezone(timeZone);
        if (parsed.kind === 'today') {
            return buildIssueDateDayFilter(parts.year, parts.month, parts.day);
        }
        return buildIssueDateMonthFilter(parts.year, parts.month);
    }

    return buildIssueDateMonthFilter(parsed.year, parsed.month);
}
