import mongoose from 'mongoose';
import Expense from '../models/Expense.js';
import {
    buildRevenueTrendBuckets,
    computeMoneyPercentChange,
} from './dashboardAnalytics.js';
import {
    dateMatchesPeriod,
    formatAnalyticsPeriodLabel,
    getYearMonthInTimezone,
    normalizeTimezone,
    previousAnalyticsPeriod,
} from './timezone.js';
import { computeMarginPercent, roundMoney } from './documentLineMath.js';
import { EXPENSE_CATEGORIES, getExpenseCategoryLabel } from './expenseCategories.js';

const DEFAULT_TREND_MONTHS = 12;

function toUserObjectId(userId) {
    if (userId instanceof mongoose.Types.ObjectId) return userId;
    return new mongoose.Types.ObjectId(String(userId));
}

function bucketKey(year, month) {
    return `${year}-${month}`;
}

function resolvePeriodArg(yearOrPeriod, month, timeZone) {
    if (yearOrPeriod && typeof yearOrPeriod === 'object') return yearOrPeriod;
    if (Number.isFinite(yearOrPeriod) && Number.isFinite(month)) {
        return { kind: 'month', year: yearOrPeriod, month };
    }
    return { kind: 'month', ...getYearMonthInTimezone(timeZone) };
}

function recordIsInPeriod(record, year, month, timeZone) {
    return dateMatchesPeriod(record?.date, resolvePeriodArg(year, month, timeZone), timeZone);
}

/** Aggregate expenses for one calendar month. */
export function computePeriodExpensesFromRecords(expenses, year, month, timeZone) {
    const tz = normalizeTimezone(timeZone);
    const byCategoryMap = new Map();

    for (const category of EXPENSE_CATEGORIES) {
        byCategoryMap.set(category.id, {
            category: category.id,
            label: category.label,
            amount: 0,
        });
    }

    let totalExpenses = 0;

    for (const record of expenses || []) {
        if (!recordIsInPeriod(record, year, month, tz)) continue;

        const amount = roundMoney(Number(record.amount) || 0);
        if (amount <= 0) continue;

        totalExpenses += amount;
        const category = record.category || 'other';
        const existing = byCategoryMap.get(category) || {
            category,
            label: getExpenseCategoryLabel(category),
            amount: 0,
        };
        existing.amount += amount;
        byCategoryMap.set(category, existing);
    }

    totalExpenses = roundMoney(totalExpenses);

    const byCategory = [...byCategoryMap.values()]
        .map((row) => ({
            ...row,
            amount: roundMoney(row.amount),
            sharePercent:
                totalExpenses > 0 ? Math.round((row.amount / totalExpenses) * 1000) / 10 : 0,
        }))
        .filter((row) => row.amount > 0)
        .sort((a, b) => b.amount - a.amount);

    return { totalExpenses, byCategory };
}

export function buildExpenseTrendFromRecords(
    expenses,
    { months = DEFAULT_TREND_MONTHS, timeZone, now = new Date() } = {}
) {
    const tz = normalizeTimezone(timeZone);
    const buckets = buildRevenueTrendBuckets({ months, timeZone: tz, now });
    const bucketMap = new Map(buckets.map((bucket) => [bucketKey(bucket.year, bucket.month), bucket]));

    for (const record of expenses || []) {
        if (!record?.date) continue;

        const expenseDate = new Date(record.date);
        if (Number.isNaN(expenseDate.getTime())) continue;

        const amount = roundMoney(Number(record.amount) || 0);
        if (amount <= 0) continue;

        const { year, month } = getYearMonthInTimezone(tz, expenseDate);
        const bucket = bucketMap.get(bucketKey(year, month));
        if (!bucket) continue;

        bucket.totalExpenses = (bucket.totalExpenses || 0) + amount;
    }

    return buckets.map((bucket) => ({
        year: bucket.year,
        month: bucket.month,
        label: bucket.label,
        totalExpenses: roundMoney(bucket.totalExpenses || 0),
    }));
}

export function buildExpenseComparison(currentTotal, previousTotal) {
    return {
        totalExpenses: computeMoneyPercentChange(currentTotal, previousTotal),
    };
}

export function buildExpenseSummaryFromRecords(
    expenses,
    { year, month, timeZone, months = DEFAULT_TREND_MONTHS, now = new Date(), period } = {}
) {
    const tz = normalizeTimezone(timeZone);
    const resolvedPeriod =
        period ||
        (Number.isFinite(year) && Number.isFinite(month)
            ? { kind: 'month', year, month }
            : { kind: 'month', ...getYearMonthInTimezone(tz, now) });

    const current = computePeriodExpensesFromRecords(expenses, resolvedPeriod, null, tz);
    const trend = buildExpenseTrendFromRecords(expenses, { months, timeZone: tz, now });

    if (resolvedPeriod.kind === 'all') {
        return {
            period: {
                kind: 'all',
                label: formatAnalyticsPeriodLabel(resolvedPeriod),
                timezone: tz,
            },
            totals: {
                totalExpenses: current.totalExpenses,
            },
            byCategory: current.byCategory,
            trend,
            comparison: null,
        };
    }

    const previousPeriod = previousAnalyticsPeriod(resolvedPeriod);
    const previous = computePeriodExpensesFromRecords(expenses, previousPeriod, null, tz);

    return {
        period: {
            kind: resolvedPeriod.kind,
            year: resolvedPeriod.year,
            month: resolvedPeriod.month,
            day: resolvedPeriod.day,
            label: formatAnalyticsPeriodLabel(resolvedPeriod),
            timezone: tz,
        },
        totals: {
            totalExpenses: current.totalExpenses,
        },
        byCategory: current.byCategory,
        trend,
        comparison: buildExpenseComparison(current.totalExpenses, previous.totalExpenses),
    };
}

export async function getExpenseRecordsForUser(userId) {
    const uid = toUserObjectId(userId);
    return Expense.find({ userId: uid })
        .select('date amount category description vendor')
        .sort({ date: -1, createdAt: -1 })
        .lean();
}

export async function getExpenseSummaryForUser(userId, { year, month, timeZone, months, period } = {}) {
    const expenses = await getExpenseRecordsForUser(userId);
    return buildExpenseSummaryFromRecords(expenses, { year, month, timeZone, months, period });
}

/** Merge expense totals into an existing profit summary payload. */
export function mergeExpensesIntoProfitSummary(
    profitSummary,
    {
        currentExpenseTotals,
        previousExpenseTotals,
        expenseTrend = [],
        byCategory = [],
    }
) {
    if (!profitSummary?.totals) return profitSummary;

    const totalExpenses = roundMoney(currentExpenseTotals?.totalExpenses ?? 0);
    const previousExpenseAmount = roundMoney(previousExpenseTotals?.totalExpenses ?? 0);
    const grossProfit = roundMoney(profitSummary.totals.grossProfit ?? 0);
    const revenue = roundMoney(profitSummary.totals.revenue ?? 0);
    const netProfit = roundMoney(grossProfit - totalExpenses);
    const previousGrossProfit = roundMoney(previousExpenseTotals?.grossProfit ?? grossProfit);
    const previousRevenue = roundMoney(previousExpenseTotals?.revenue ?? revenue);
    const previousNetProfit = roundMoney(previousGrossProfit - previousExpenseAmount);
    const previousNetMarginPercent = computeMarginPercent(previousRevenue, previousNetProfit);

    profitSummary.totals.totalExpenses = totalExpenses;
    profitSummary.totals.netProfit = netProfit;
    profitSummary.totals.netMarginPercent = computeMarginPercent(revenue, netProfit);
    profitSummary.byExpenseCategory = byCategory;

    const expenseTrendMap = new Map(
        expenseTrend.map((point) => [bucketKey(point.year, point.month), point])
    );

    profitSummary.trend = (profitSummary.trend ?? []).map((point) => {
        const expensePoint = expenseTrendMap.get(bucketKey(point.year, point.month));
        const pointExpenses = roundMoney(expensePoint?.totalExpenses ?? 0);
        const pointGross = roundMoney(point.grossProfit ?? 0);
        return {
            ...point,
            totalExpenses: pointExpenses,
            netProfit: roundMoney(pointGross - pointExpenses),
        };
    });

    if (profitSummary.comparison) {
        profitSummary.comparison = {
            ...profitSummary.comparison,
            totalExpenses: computeMoneyPercentChange(totalExpenses, previousExpenseAmount),
            netProfit: computeMoneyPercentChange(netProfit, previousNetProfit),
            netMarginPercent: computeMoneyPercentChange(
                profitSummary.totals.netMarginPercent,
                previousNetMarginPercent
            ),
        };
    }

    return profitSummary;
}
