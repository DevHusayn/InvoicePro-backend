import mongoose from 'mongoose';
import Invoice from '../models/Invoice.js';
import { INVOICE_ONLY_FILTER, RECEIPT_ONLY_FILTER } from './invoiceDocumentFilter.js';
import { computePaidRevenue, computePendingBalance } from './dashboardStats.js';
import { getYearMonthInTimezone, normalizeTimezone } from './timezone.js';

const DEFAULT_TREND_MONTHS = 12;

function toUserObjectId(userId) {
    if (userId instanceof mongoose.Types.ObjectId) return userId;
    return new mongoose.Types.ObjectId(String(userId));
}

function roundMoney(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
}

export function shiftSummaryPeriod(year, month, deltaMonths) {
    const index = year * 12 + (month - 1) + deltaMonths;
    return {
        year: Math.floor(index / 12),
        month: (index % 12) + 1,
    };
}

export function formatTrendMonthLabel(year, month, locale = 'en-US') {
    const date = new Date(Date.UTC(year, month - 1, 1));
    return new Intl.DateTimeFormat(locale, {
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
    }).format(date);
}

function bucketKey(year, month) {
    return `${year}-${month}`;
}

/** Build empty month buckets ending at the current month in the business timezone. */
export function buildRevenueTrendBuckets({ months = DEFAULT_TREND_MONTHS, timeZone, now = new Date() }) {
    const tz = normalizeTimezone(timeZone);
    const current = getYearMonthInTimezone(tz, now);
    const buckets = [];

    for (let offset = months - 1; offset >= 0; offset -= 1) {
        const { year, month } = shiftSummaryPeriod(current.year, current.month, -offset);
        buckets.push({
            year,
            month,
            label: formatTrendMonthLabel(year, month),
            paid: 0,
            outstanding: 0,
        });
    }

    return buckets;
}

/** Pure revenue trend builder — bucketed by invoice issue date in the business timezone. */
export function buildRevenueTrendFromDocs(docs, { months = DEFAULT_TREND_MONTHS, timeZone, now = new Date() }) {
    const tz = normalizeTimezone(timeZone);
    const buckets = buildRevenueTrendBuckets({ months, timeZone: tz, now });
    const bucketMap = new Map(buckets.map((bucket) => [bucketKey(bucket.year, bucket.month), bucket]));

    for (const doc of docs) {
        if (!doc?.date) continue;
        const issueDate = new Date(doc.date);
        if (Number.isNaN(issueDate.getTime())) continue;

        const { year, month } = getYearMonthInTimezone(tz, issueDate);
        const bucket = bucketMap.get(bucketKey(year, month));
        if (!bucket) continue;

        bucket.paid += computePaidRevenue(doc);
        bucket.outstanding += computePendingBalance(doc);
    }

    return buckets.map((bucket) => ({
        ...bucket,
        paid: roundMoney(bucket.paid),
        outstanding: roundMoney(bucket.outstanding),
    }));
}

export const MONEY_COMPARISON_MIN_BASELINE = 5000;
export const MAX_COMPARISON_PERCENT = 999;

/**
 * Month-over-month comparison with sane handling for near-zero baselines.
 * Returns kind: flat | new | unavailable | percent | capped
 */
export function computePercentChange(current, previous, { minBaseline = 0 } = {}) {
    const currentValue = Number(current) || 0;
    const previousValue = Number(previous) || 0;

    if (currentValue === 0 && previousValue === 0) {
        return { kind: 'flat', direction: 'flat' };
    }

    if (previousValue === 0) {
        return { kind: 'new', direction: currentValue > 0 ? 'up' : 'flat' };
    }

    if (minBaseline > 0 && previousValue < minBaseline) {
        return { kind: 'unavailable', direction: 'flat' };
    }

    const raw = ((currentValue - previousValue) / previousValue) * 100;
    const rounded = Math.round(raw);

    if (rounded === 0) {
        return { kind: 'flat', direction: 'flat' };
    }

    const direction = rounded > 0 ? 'up' : 'down';
    const absValue = Math.abs(rounded);

    if (absValue > MAX_COMPARISON_PERCENT) {
        return { kind: 'capped', value: MAX_COMPARISON_PERCENT, direction };
    }

    return {
        kind: 'percent',
        value: absValue,
        direction,
    };
}

export function computeMoneyPercentChange(current, previous) {
    return computePercentChange(current, previous, { minBaseline: MONEY_COMPARISON_MIN_BASELINE });
}

export function computeCountPercentChange(current, previous) {
    return computePercentChange(current, previous, { minBaseline: 0 });
}

function docIsInPeriod(doc, year, month, timeZone) {
    if (!doc?.date) return false;
    const issueDate = new Date(doc.date);
    if (Number.isNaN(issueDate.getTime())) return false;
    const { year: docYear, month: docMonth } = getYearMonthInTimezone(timeZone, issueDate);
    return docYear === year && docMonth === month;
}

function isInvoiceDoc(doc) {
    return doc.documentType === 'invoice' || doc.documentType == null;
}

function isReceiptDoc(doc) {
    return doc.documentType === 'receipt';
}

/** Period metrics bucketed by invoice issue date in the business timezone. */
export function computePeriodSummaryFromDocs(docs, year, month, timeZone) {
    const tz = normalizeTimezone(timeZone);
    let totalRevenue = 0;
    let outstanding = 0;
    let paidInvoices = 0;
    let receiptsIssued = 0;

    for (const doc of docs) {
        if (!docIsInPeriod(doc, year, month, tz)) continue;
        if (doc.status === 'draft' || doc.status === 'cancelled') continue;

        totalRevenue += computePaidRevenue(doc);
        outstanding += computePendingBalance(doc);

        if (isReceiptDoc(doc) && doc.status === 'paid') {
            receiptsIssued += 1;
        } else if (isInvoiceDoc(doc) && doc.status === 'paid') {
            paidInvoices += 1;
        }
    }

    return {
        totalRevenue: roundMoney(totalRevenue),
        outstanding: roundMoney(outstanding),
        paidInvoices,
        receiptsIssued,
        paymentsReceived: paidInvoices + receiptsIssued,
    };
}

/** Status counts for invoices and receipts issued in a calendar month. */
export function computePeriodPaymentBreakdownFromDocs(docs, year, month, timeZone) {
    const tz = normalizeTimezone(timeZone);
    let paidInvoices = 0;
    let receiptsIssued = 0;
    let partial = 0;
    let pending = 0;
    let overdue = 0;

    for (const doc of docs) {
        if (!docIsInPeriod(doc, year, month, tz)) continue;
        if (doc.status === 'draft' || doc.status === 'cancelled') continue;

        if (isReceiptDoc(doc)) {
            if (doc.status === 'paid') receiptsIssued += 1;
            continue;
        }

        if (!isInvoiceDoc(doc)) continue;

        if (doc.status === 'paid') paidInvoices += 1;
        else if (doc.status === 'partial') partial += 1;
        else if (doc.status === 'pending') pending += 1;
        else if (doc.status === 'overdue') overdue += 1;
    }

    const total = paidInvoices + receiptsIssued + partial + pending + overdue;

    return {
        paidInvoices,
        receiptsIssued,
        partial,
        pending,
        overdue,
        total,
    };
}

export function buildPeriodSummaryComparison(currentSummary, previousSummary) {
    return {
        totalRevenue: computeMoneyPercentChange(
            currentSummary.totalRevenue,
            previousSummary.totalRevenue
        ),
        outstanding: computeMoneyPercentChange(
            currentSummary.outstanding,
            previousSummary.outstanding
        ),
        paymentsReceived: computeCountPercentChange(
            currentSummary.paymentsReceived,
            previousSummary.paymentsReceived
        ),
    };
}

export function computeRevenueStatsFromDocs(docs) {
    let totalInvoices = 0;
    let paidRevenue = 0;
    let pendingRevenue = 0;

    for (const doc of docs) {
        const isInvoice = doc.documentType === 'invoice' || doc.documentType == null;
        if (isInvoice) totalInvoices += 1;

        paidRevenue += computePaidRevenue(doc);
        pendingRevenue += computePendingBalance(doc);
    }

    return {
        totalInvoices,
        paidRevenue: roundMoney(paidRevenue),
        pendingRevenue: roundMoney(pendingRevenue),
    };
}

export function buildDashboardAnalyticsFromDocs(docs, { timeZone, months = DEFAULT_TREND_MONTHS } = {}) {
    const tz = normalizeTimezone(timeZone);
    return {
        revenueTrend: buildRevenueTrendFromDocs(docs, { months, timeZone: tz }),
    };
}

export function buildPeriodSummaryFromDocs(docs, { year, month, timeZone } = {}) {
    const tz = normalizeTimezone(timeZone);
    const resolvedPeriod =
        Number.isFinite(year) && Number.isFinite(month)
            ? { year, month }
            : getYearMonthInTimezone(tz);
    const previousPeriod = shiftSummaryPeriod(resolvedPeriod.year, resolvedPeriod.month, -1);

    const current = computePeriodSummaryFromDocs(
        docs,
        resolvedPeriod.year,
        resolvedPeriod.month,
        tz
    );
    const previous = computePeriodSummaryFromDocs(
        docs,
        previousPeriod.year,
        previousPeriod.month,
        tz
    );
    const paymentBreakdown = computePeriodPaymentBreakdownFromDocs(
        docs,
        resolvedPeriod.year,
        resolvedPeriod.month,
        tz
    );

    return {
        period: {
            year: resolvedPeriod.year,
            month: resolvedPeriod.month,
            label: formatTrendMonthLabel(resolvedPeriod.year, resolvedPeriod.month),
            timezone: tz,
        },
        current,
        previous,
        paymentBreakdown,
        comparison: buildPeriodSummaryComparison(current, previous),
    };
}

export async function getPeriodSummaryWithComparison(userId, { year, month, timeZone } = {}) {
    const uid = toUserObjectId(userId);
    const docs = await Invoice.find({ userId: uid, status: { $ne: 'draft' } })
        .select('date status total amountPaid documentType')
        .lean();

    return buildPeriodSummaryFromDocs(docs, { year, month, timeZone });
}

export async function getInvoiceStatusCounts(userId) {
    const uid = toUserObjectId(userId);
    const rows = await Invoice.aggregate([
        { $match: { userId: uid, status: { $ne: 'draft' }, ...INVOICE_ONLY_FILTER } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    const statusCounts = { all: 0, pending: 0, partial: 0, paid: 0, overdue: 0, cancelled: 0 };
    for (const row of rows) {
        const key = row._id;
        if (key && Object.prototype.hasOwnProperty.call(statusCounts, key)) {
            statusCounts[key] = row.count;
        }
        statusCounts.all += row.count;
    }
    return statusCounts;
}

/** Combined invoice + receipt counts for the dashboard payment breakdown. */
export function buildPaymentBreakdown(invoiceStatusCounts, receiptsIssued) {
    const paidInvoices = invoiceStatusCounts?.paid ?? 0;
    const partial = invoiceStatusCounts?.partial ?? 0;
    const pending = invoiceStatusCounts?.pending ?? 0;
    const overdue = invoiceStatusCounts?.overdue ?? 0;
    const receipts = receiptsIssued ?? 0;
    const total = paidInvoices + receipts + partial + pending + overdue;

    return {
        paidInvoices,
        receiptsIssued: receipts,
        partial,
        pending,
        overdue,
        total,
    };
}

export async function getPaymentBreakdown(userId) {
    const uid = toUserObjectId(userId);
    const [invoiceStatusCounts, receiptsIssued] = await Promise.all([
        getInvoiceStatusCounts(userId),
        Invoice.countDocuments({ userId: uid, status: 'paid', ...RECEIPT_ONLY_FILTER }),
    ]);

    return buildPaymentBreakdown(invoiceStatusCounts, receiptsIssued);
}

export async function getRevenueTrend(userId, { months = DEFAULT_TREND_MONTHS, timeZone } = {}) {
    const uid = toUserObjectId(userId);
    const tz = normalizeTimezone(timeZone);
    const docs = await Invoice.find({ userId: uid, status: { $ne: 'draft' } })
        .select('date status total amountPaid documentType')
        .lean();

    return buildRevenueTrendFromDocs(docs, { months, timeZone: tz });
}

export async function getDashboardAnalytics(userId, { timeZone, months = DEFAULT_TREND_MONTHS, docs } = {}) {
    if (docs) {
        return buildDashboardAnalyticsFromDocs(docs, { timeZone, months });
    }

    const uid = toUserObjectId(userId);
    const loadedDocs = await Invoice.find({ userId: uid, status: { $ne: 'draft' } })
        .select('date status total amountPaid documentType')
        .lean();

    return buildDashboardAnalyticsFromDocs(loadedDocs, { timeZone, months });
}
