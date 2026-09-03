export const RECURRING_FREQUENCIES = ['weekly', 'bi-weekly', 'monthly', 'quarterly', 'yearly'];

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isRecurringFrequency(value) {
    return RECURRING_FREQUENCIES.includes(value);
}

export function parseIsoDate(value) {
    const match = String(value || '').trim().match(ISO_DATE);
    if (!match) return null;
    const year = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);
    const day = Number.parseInt(match[3], 10);
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
    const utc = new Date(Date.UTC(year, month - 1, day));
    if (
        utc.getUTCFullYear() !== year ||
        utc.getUTCMonth() !== month - 1 ||
        utc.getUTCDate() !== day
    ) {
        return null;
    }
    return { year, month, day };
}

export function formatIsoDate(year, month, day) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function addDaysToIsoDate(yyyyMmDd, deltaDays) {
    const parts = parseIsoDate(yyyyMmDd);
    if (!parts) return null;
    const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + Number(deltaDays || 0)));
    return formatIsoDate(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
}

export function daysBetweenIsoDates(start, end) {
    const from = parseIsoDate(start);
    const to = parseIsoDate(end);
    if (!from || !to) return 0;
    const startUtc = Date.UTC(from.year, from.month - 1, from.day);
    const endUtc = Date.UTC(to.year, to.month - 1, to.day);
    return Math.round((endUtc - startUtc) / 86400000);
}

function daysInMonth(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addMonthsToParts(year, month, day, months) {
    const total = year * 12 + (month - 1) + months;
    const nextYear = Math.floor(total / 12);
    const nextMonth = (total % 12) + 1;
    return {
        year: nextYear,
        month: nextMonth,
        day: Math.min(day, daysInMonth(nextYear, nextMonth)),
    };
}

export function addFrequency(yyyyMmDd, frequency) {
    const parts = parseIsoDate(yyyyMmDd);
    if (!parts || !isRecurringFrequency(frequency)) return null;

    if (frequency === 'weekly') return addDaysToIsoDate(yyyyMmDd, 7);
    if (frequency === 'bi-weekly') return addDaysToIsoDate(yyyyMmDd, 14);

    const months = frequency === 'monthly' ? 1 : frequency === 'quarterly' ? 3 : 12;
    const next = addMonthsToParts(parts.year, parts.month, parts.day, months);
    return formatIsoDate(next.year, next.month, next.day);
}

export function compareIsoDates(a, b) {
    if (a === b) return 0;
    return a < b ? -1 : 1;
}

export function shouldGenerateRecurrence({ nextDate, endDate, today }) {
    if (!parseIsoDate(nextDate) || !parseIsoDate(today)) return false;
    if (compareIsoDates(nextDate, today) > 0) return false;
    if (endDate && parseIsoDate(endDate) && compareIsoDates(nextDate, endDate) > 0) return false;
    return true;
}

export function computeRecurringDueDate(templateDate, templateDueDate, nextIssueDate) {
    if (!parseIsoDate(templateDate) || !parseIsoDate(templateDueDate) || !parseIsoDate(nextIssueDate)) {
        return null;
    }
    return addDaysToIsoDate(nextIssueDate, daysBetweenIsoDates(templateDate, templateDueDate));
}

function validationError(message, status = 400) {
    const err = new Error(message);
    err.status = status;
    return err;
}

export function sanitizeRecurringEndDate(value) {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const date = String(value).trim();
    if (!parseIsoDate(date)) {
        throw validationError('Please enter a valid recurring end date.');
    }
    return date;
}

/**
 * Normalize recurring fields on create/update.
 * Drafts may store the schedule but do not get a next run date until finalized.
 */
export function applyRecurringSchedule(data, { existing = null } = {}) {
    if (!data || typeof data !== 'object') return data;

    const isRecurring = data.isRecurring !== undefined
        ? Boolean(data.isRecurring)
        : Boolean(existing?.isRecurring);

    if (!isRecurring) {
        data.isRecurring = false;
        data.recurringFrequency = undefined;
        data.recurringEndDate = null;
        data.recurringNextDate = null;
        return data;
    }

    const frequency = data.recurringFrequency || existing?.recurringFrequency;
    if (!isRecurringFrequency(frequency)) {
        throw validationError('Choose how often this should repeat.');
    }
    data.isRecurring = true;
    data.recurringFrequency = frequency;

    const issueDate = data.date || existing?.date;
    if (!parseIsoDate(issueDate)) {
        throw validationError('Set a date before making this recurring.');
    }

    if (data.recurringEndDate === undefined && existing) {
        data.recurringEndDate = existing.recurringEndDate ?? null;
    }
    if (data.recurringEndDate && parseIsoDate(data.recurringEndDate)
        && compareIsoDates(data.recurringEndDate, issueDate) < 0) {
        throw validationError('Recurring end date must be on or after the start date.');
    }

    const status = data.status || existing?.status;
    if (status === 'draft') {
        data.recurringNextDate = null;
        return data;
    }

    const issueChanged = Boolean(data.date && existing?.date && data.date !== existing.date);
    const freqChanged = Boolean(
        data.recurringFrequency
        && existing?.recurringFrequency
        && data.recurringFrequency !== existing.recurringFrequency
    );
    const wasDraft = existing?.status === 'draft';
    const becomingRecurring = !existing?.isRecurring;

    if (existing?.recurringNextDate && !issueChanged && !freqChanged && !wasDraft && !becomingRecurring) {
        data.recurringNextDate = existing.recurringNextDate;
    } else {
        data.recurringNextDate = addFrequency(issueDate, frequency);
    }

    return data;
}

export function stoppedRecurringFields() {
    return {
        isRecurring: false,
        recurringFrequency: undefined,
        recurringEndDate: null,
        recurringNextDate: null,
    };
}
