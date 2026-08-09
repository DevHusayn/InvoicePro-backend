import {
    getBusinessTimezone,
    getUtcRangeForMonthInTimezone,
    getYearMonthInTimezone,
    parseSummaryPeriodQuery,
} from './timezone.js';

export async function resolveListSummaryOptions(req, userId) {
    const timeZone = await getBusinessTimezone(userId);
    const { year, month } = parseSummaryPeriodQuery(req.query, timeZone);
    return { year, month, timeZone };
}

export function isSummaryOnlyRequest(query = {}) {
    const raw = String(query.summaryOnly ?? '').trim().toLowerCase();
    return raw === '1' || raw === 'true';
}

export function hasExplicitSummaryPeriodQuery(query = {}) {
    const year = Number.parseInt(String(query.summaryYear ?? ''), 10);
    const month = Number.parseInt(String(query.summaryMonth ?? ''), 10);
    return (
        Number.isFinite(year) &&
        Number.isFinite(month) &&
        month >= 1 &&
        month <= 12 &&
        year >= 1970 &&
        year <= 2100
    );
}

export function shouldFetchListSummary(query = {}) {
    return isSummaryOnlyRequest(query) || hasExplicitSummaryPeriodQuery(query);
}

export async function countListSummary(Model, baseFilter, { year, month, timeZone } = {}) {
    const tz = timeZone;
    const resolved =
        Number.isFinite(year) && Number.isFinite(month)
            ? { year, month }
            : getYearMonthInTimezone(tz);
    const { start, end } = getUtcRangeForMonthInTimezone(resolved.year, resolved.month, tz);

    const [total, newInPeriod] = await Promise.all([
        Model.countDocuments(baseFilter),
        Model.countDocuments({
            ...baseFilter,
            createdAt: { $gte: start, $lt: end },
        }),
    ]);

    return {
        total,
        newInPeriod,
        period: {
            year: resolved.year,
            month: resolved.month,
            timezone: tz,
        },
    };
}

export function buildSummaryResponse(totalKey, total, summaryCounts) {
    return {
        [totalKey]: total,
        newInPeriod: summaryCounts.newInPeriod,
        newThisMonth: summaryCounts.newInPeriod,
        period: summaryCounts.period,
    };
}
