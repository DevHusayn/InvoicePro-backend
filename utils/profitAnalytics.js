import mongoose from 'mongoose';
import Invoice from '../models/Invoice.js';
import Product from '../models/Product.js';
import {
    buildRevenueTrendBuckets,
    computeMoneyPercentChange,
    formatTrendMonthLabel,
    shiftSummaryPeriod,
} from './dashboardAnalytics.js';
import { getYearMonthInTimezone, normalizeTimezone } from './timezone.js';
import { loadProductCostMap, resolveLineUnitCost, lineHasCostData } from './productCostResolver.js';
import {
    computeDocumentDiscountRatio,
    computeLineSubtotal,
    computeMarginPercent,
    roundMoney,
} from './documentLineMath.js';
import {
    computePaidRatio,
    docCountsAsRealizedSale,
} from './realizedSales.js';

export { loadProductCostMap };

const DEFAULT_TREND_MONTHS = 12;

function toUserObjectId(userId) {
    if (userId instanceof mongoose.Types.ObjectId) return userId;
    return new mongoose.Types.ObjectId(String(userId));
}

function bucketKey(year, month) {
    return `${year}-${month}`;
}

function docIsInPeriod(doc, year, month, timeZone) {
    if (!doc?.date) return false;
    const issueDate = new Date(doc.date);
    if (Number.isNaN(issueDate.getTime())) return false;
    const { year: docYear, month: docMonth } = getYearMonthInTimezone(timeZone, issueDate);
    return docYear === year && docMonth === month;
}

/**
 * Compute gross profit metrics for one document, scaled by paid ratio for partial payments.
 */
export function computeDocumentProfit(doc, productCostById = null) {
    if (!doc || doc.status === 'draft' || doc.status === 'cancelled') {
        return {
            revenue: 0,
            cogs: 0,
            grossProfit: 0,
            linesWithCost: 0,
            linesMissingCost: 0,
        };
    }

    if (!docCountsAsRealizedSale(doc)) {
        return {
            revenue: 0,
            cogs: 0,
            grossProfit: 0,
            linesWithCost: 0,
            linesMissingCost: 0,
        };
    }

    const paidRatio = computePaidRatio(doc);
    if (paidRatio <= 0) {
        return {
            revenue: 0,
            cogs: 0,
            grossProfit: 0,
            linesWithCost: 0,
            linesMissingCost: 0,
        };
    }

    const items = Array.isArray(doc.items) ? doc.items : [];
    const discountRatio = computeDocumentDiscountRatio(doc, items);

    let revenue = 0;
    let cogs = 0;
    let linesWithCost = 0;
    let linesMissingCost = 0;

    for (const item of items) {
        const qty = Number(item.quantity) || 0;
        const rate = Number(item.rate) || 0;
        const lineRevenue = qty * rate;
        const adjustedRevenue = lineRevenue * (1 - discountRatio);
        const unitCost = resolveLineUnitCost(item, productCostById);
        const hasCost = lineHasCostData(item, productCostById);

        revenue += adjustedRevenue;
        if (item.productId) {
            if (hasCost) {
                cogs += qty * unitCost;
                linesWithCost += 1;
            } else {
                linesMissingCost += 1;
            }
        }
    }

    revenue = roundMoney(revenue * paidRatio);
    cogs = roundMoney(cogs * paidRatio);
    const grossProfit = roundMoney(revenue - cogs);

    return {
        revenue,
        cogs,
        grossProfit,
        linesWithCost,
        linesMissingCost,
    };
}

function emptyTotals() {
    return {
        revenue: 0,
        cogs: 0,
        grossProfit: 0,
        marginPercent: 0,
        linesWithCost: 0,
        linesMissingCost: 0,
    };
}

/** Aggregate profit for docs issued in a calendar month. */
export function computePeriodProfitFromDocs(docs, year, month, timeZone, productCostById = null) {
    const tz = normalizeTimezone(timeZone);
    const totals = emptyTotals();
    const byProduct = new Map();

    for (const doc of docs) {
        if (!docIsInPeriod(doc, year, month, tz)) continue;

        if (!docCountsAsRealizedSale(doc)) continue;

        const docProfit = computeDocumentProfit(doc, productCostById);
        totals.revenue += docProfit.revenue;
        totals.cogs += docProfit.cogs;
        totals.grossProfit += docProfit.grossProfit;
        totals.linesWithCost += docProfit.linesWithCost;
        totals.linesMissingCost += docProfit.linesMissingCost;

        if (!Array.isArray(doc.items)) continue;

        const paidRatio = computePaidRatio(doc);
        if (paidRatio <= 0) continue;

        const lineSubtotal = computeLineSubtotal(doc.items);
        const discountRatio = computeDocumentDiscountRatio(doc, doc.items);

        for (const item of doc.items) {
            if (!item?.productId) continue;

            const productId = String(item.productId);
            const qty = Number(item.quantity) || 0;
            const rate = Number(item.rate) || 0;
            const unitCost = resolveLineUnitCost(item, productCostById);
            const lineRevenue = roundMoney(qty * rate * (1 - discountRatio) * paidRatio);
            const lineCogs = unitCost > 0 ? roundMoney(qty * unitCost * paidRatio) : 0;
            const lineProfit = roundMoney(lineRevenue - lineCogs);

            const existing = byProduct.get(productId) || {
                productId,
                name: item.description || 'Product',
                revenue: 0,
                cogs: 0,
                grossProfit: 0,
                qtySold: 0,
            };

            existing.revenue += lineRevenue;
            existing.cogs += lineCogs;
            existing.grossProfit += lineProfit;
            existing.qtySold += qty * paidRatio;
            if (item.description) existing.name = item.description;

            byProduct.set(productId, existing);
        }
    }

    totals.revenue = roundMoney(totals.revenue);
    totals.cogs = roundMoney(totals.cogs);
    totals.grossProfit = roundMoney(totals.grossProfit);
    totals.marginPercent = computeMarginPercent(totals.revenue, totals.grossProfit);

    const byProductRows = [...byProduct.values()]
        .map((row) => ({
            ...row,
            revenue: roundMoney(row.revenue),
            cogs: roundMoney(row.cogs),
            grossProfit: roundMoney(row.grossProfit),
            qtySold: roundMoney(row.qtySold),
            marginPercent: computeMarginPercent(row.revenue, row.grossProfit),
        }))
        .sort((a, b) => b.grossProfit - a.grossProfit);

    return { totals, byProduct: byProductRows };
}

export function buildProfitTrendFromDocs(
    docs,
    { months = DEFAULT_TREND_MONTHS, timeZone, now = new Date(), productCostById = null } = {}
) {
    const tz = normalizeTimezone(timeZone);
    const buckets = buildRevenueTrendBuckets({ months, timeZone: tz, now });
    const bucketMap = new Map(buckets.map((bucket) => [bucketKey(bucket.year, bucket.month), bucket]));

    for (const doc of docs) {
        if (!doc?.date || doc.status === 'draft' || doc.status === 'cancelled') continue;
        if (!docCountsAsRealizedSale(doc)) continue;

        const issueDate = new Date(doc.date);
        if (Number.isNaN(issueDate.getTime())) continue;

        const { year, month } = getYearMonthInTimezone(tz, issueDate);
        const bucket = bucketMap.get(bucketKey(year, month));
        if (!bucket) continue;

        const docProfit = computeDocumentProfit(doc, productCostById);
        bucket.grossProfit = (bucket.grossProfit || 0) + docProfit.grossProfit;
        bucket.revenue = (bucket.revenue || 0) + docProfit.revenue;
    }

    return buckets.map((bucket) => {
        const grossProfit = roundMoney(bucket.grossProfit || 0);
        const revenue = roundMoney(bucket.revenue || 0);
        return {
            year: bucket.year,
            month: bucket.month,
            label: bucket.label,
            grossProfit,
            revenue,
            marginPercent: computeMarginPercent(revenue, grossProfit),
        };
    });
}

export function buildProfitComparison(currentTotals, previousTotals) {
    return {
        grossProfit: computeMoneyPercentChange(
            currentTotals.grossProfit,
            previousTotals.grossProfit
        ),
        marginPercent: computeMoneyPercentChange(
            currentTotals.marginPercent,
            previousTotals.marginPercent
        ),
        revenue: computeMoneyPercentChange(currentTotals.revenue, previousTotals.revenue),
    };
}

export function buildProfitSummaryFromDocs(
    docs,
    { year, month, timeZone, months = DEFAULT_TREND_MONTHS, now = new Date(), productCostById = null } = {}
) {
    const tz = normalizeTimezone(timeZone);
    const resolvedPeriod =
        Number.isFinite(year) && Number.isFinite(month)
            ? { year, month }
            : getYearMonthInTimezone(tz, now);
    const previousPeriod = shiftSummaryPeriod(resolvedPeriod.year, resolvedPeriod.month, -1);

    const current = computePeriodProfitFromDocs(
        docs,
        resolvedPeriod.year,
        resolvedPeriod.month,
        tz,
        productCostById
    );
    const previous = computePeriodProfitFromDocs(
        docs,
        previousPeriod.year,
        previousPeriod.month,
        tz,
        productCostById
    );

    return {
        period: {
            year: resolvedPeriod.year,
            month: resolvedPeriod.month,
            label: formatTrendMonthLabel(resolvedPeriod.year, resolvedPeriod.month),
            timezone: tz,
        },
        totals: current.totals,
        byProduct: current.byProduct,
        trend: buildProfitTrendFromDocs(docs, { months, timeZone: tz, now, productCostById }),
        comparison: buildProfitComparison(current.totals, previous.totals),
    };
}

export async function getProfitSummaryForUser(userId, { year, month, timeZone, months = DEFAULT_TREND_MONTHS } = {}) {
    const uid = toUserObjectId(userId);
    const docs = await Invoice.find({ userId: uid, status: { $ne: 'draft' } })
        .select('date status total amountPaid documentType items discount discountType discountValue')
        .lean();

    const [productCostById, products] = await Promise.all([
        loadProductCostMap(userId, docs),
        (async () => {
            const productIds = new Set();
            for (const doc of docs) {
                for (const item of doc.items || []) {
                    if (item?.productId) productIds.add(String(item.productId));
                }
            }
            if (!productIds.size) return [];
            return Product.find({
                userId: uid,
                _id: { $in: [...productIds].map((id) => new mongoose.Types.ObjectId(id)) },
            })
                .select('name')
                .lean();
        })(),
    ]);

    const nameById = new Map(products.map((product) => [String(product._id), product.name || 'Product']));

    const summary = buildProfitSummaryFromDocs(docs, { year, month, timeZone, months, productCostById });
    summary.byProduct = summary.byProduct.map((row) => ({
        ...row,
        name: nameById.get(row.productId) || row.name,
    }));

    return summary;
}

/** Lightweight period profit totals for dashboard stat cards. */
export function computePeriodGrossProfitFromDocs(docs, year, month, timeZone, productCostById = null) {
    return computePeriodProfitFromDocs(docs, year, month, timeZone, productCostById).totals;
}
