/** Parse year/month list filter query params. Returns null when absent or invalid. */
export function parseListMonthQuery(query = {}) {
    const year = Number.parseInt(String(query.year ?? ''), 10);
    const month = Number.parseInt(String(query.month ?? ''), 10);
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
        return null;
    }
    return { year, month };
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
