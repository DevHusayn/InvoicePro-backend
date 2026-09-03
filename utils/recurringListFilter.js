export function isRecurringListQuery(value) {
    const recurring = String(value || '').trim().toLowerCase();
    return recurring === '1' || recurring === 'true';
}

/**
 * Recurring is a series view (active templates), not "dated in this period".
 * Period dates still apply to the normal list.
 */
export function applyListRecurringAndDateFilter(filter, { recurring, dateFilter } = {}) {
    if (isRecurringListQuery(recurring)) {
        filter.isRecurring = true;
        return filter;
    }
    if (dateFilter) Object.assign(filter, dateFilter);
    return filter;
}
