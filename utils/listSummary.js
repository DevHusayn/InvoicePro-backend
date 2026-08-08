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
