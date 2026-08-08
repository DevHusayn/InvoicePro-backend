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

export function getYearMonthInTimezone(timeZone, date = new Date()) {
    const tz = normalizeTimezone(timeZone);
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-CA', {
            timeZone: tz,
            year: 'numeric',
            month: '2-digit',
        })
            .formatToParts(date)
            .filter((part) => part.type !== 'literal')
            .map((part) => [part.type, part.value])
    );
    return {
        year: Number.parseInt(parts.year, 10),
        month: Number.parseInt(parts.month, 10),
    };
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

export async function getBusinessTimezone(userId) {
    const doc = await BusinessInfo.findOne({ userId }).select('timezone').lean();
    return normalizeTimezone(doc?.timezone);
}
