import mongoose from 'mongoose';
import Invoice from '../models/Invoice.js';
import Quotation from '../models/Quotation.js';
import Client from '../models/Client.js';
import BusinessInfo from '../models/CompanyInfo.js';
import { getDraftCountForUser } from './documentDrafts.js';
import { getInvoiceUsageForUser } from './invoiceLimits.js';
import { toBusinessInfoResponse } from './businessInfoHelpers.js';
import { getCache, setCache, invalidateCache } from './cache.js';
import { INVOICE_ONLY_FILTER, RECEIPT_ONLY_FILTER } from './invoiceDocumentFilter.js';
import { MONEY_EPS } from './invoicePayments.js';

const DASHBOARD_CACHE_TTL_MS = 30_000;
const OVERDUE_LIMIT = 20;

const INVOICE_SUMMARY_FIELDS =
    'invoiceNumber receiptNumber clientId date dueDate status total amountPaid currency createdAt updatedAt';
const QUOTATION_SUMMARY_FIELDS =
    'quotationNumber clientId date validUntil status total currency createdAt updatedAt convertedInvoiceId';

function toUserObjectId(userId) {
    if (userId instanceof mongoose.Types.ObjectId) return userId;
    return new mongoose.Types.ObjectId(String(userId));
}

function mapSummary(doc) {
    return {
        ...doc,
        id: doc._id?.toString?.() || doc._id || doc.id,
    };
}

function roundMoney(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
}

function amountPaidOf(inv) {
    const recorded = roundMoney(inv.amountPaid);
    if (recorded > 0) return recorded;
    if (inv.status === 'paid') return roundMoney(inv.total);
    return 0;
}

function balanceDueOf(inv) {
    return Math.max(0, roundMoney(inv.total) - amountPaidOf(inv));
}

/** Pending balance for one non-draft document (mirrors aggregation rules). */
export function computePendingBalance(doc) {
    if (!doc || doc.status === 'draft' || doc.status === 'cancelled') return 0;

    const balance = balanceDueOf(doc);

    if (['pending', 'partial', 'overdue'].includes(doc.status)) {
        return balance;
    }

    if (
        doc.documentType === 'receipt' &&
        doc.status === 'paid' &&
        roundMoney(doc.amountPaid) > MONEY_EPS &&
        balance > MONEY_EPS
    ) {
        return balance;
    }

    return 0;
}

/** Revenue totals via aggregation — avoids loading every invoice into memory. */
async function getInvoiceRevenueStats(userId) {
    const uid = toUserObjectId(userId);
    const rows = await Invoice.aggregate([
        { $match: { userId: uid, status: { $ne: 'draft' } } },
        {
            $group: {
                _id: null,
                totalInvoices: {
                    $sum: {
                        $cond: [
                            {
                                $or: [
                                    { $eq: ['$documentType', 'invoice'] },
                                    { $not: ['$documentType'] },
                                ],
                            },
                            1,
                            0,
                        ],
                    },
                },
                paidRevenue: {
                    $sum: {
                        $cond: [
                            { $in: ['$status', ['cancelled', 'draft']] },
                            0,
                            {
                                $let: {
                                    vars: {
                                        paid: { $ifNull: ['$amountPaid', 0] },
                                        total: { $ifNull: ['$total', 0] },
                                    },
                                    in: {
                                        $cond: [
                                            { $gt: ['$$paid', 0] },
                                            '$$paid',
                                            {
                                                $cond: [
                                                    { $eq: ['$status', 'paid'] },
                                                    '$$total',
                                                    0,
                                                ],
                                            },
                                        ],
                                    },
                                },
                            },
                        ],
                    },
                },
                pendingRevenue: {
                    $sum: {
                        $let: {
                            vars: {
                                total: { $ifNull: ['$total', 0] },
                                paid: { $ifNull: ['$amountPaid', 0] },
                                effectivePaid: {
                                    $cond: [
                                        { $gt: ['$$paid', 0] },
                                        '$$paid',
                                        {
                                            $cond: [
                                                { $eq: ['$status', 'paid'] },
                                                '$$total',
                                                0,
                                            ],
                                        },
                                    ],
                                },
                            },
                            in: {
                                $let: {
                                    vars: {
                                        balance: {
                                            $max: [
                                                0,
                                                { $subtract: ['$$total', '$$effectivePaid'] },
                                            ],
                                        },
                                    },
                                    in: {
                                        $cond: [
                                            {
                                                $or: [
                                                    {
                                                        $in: [
                                                            '$status',
                                                            ['pending', 'partial', 'overdue'],
                                                        ],
                                                    },
                                                    {
                                                        $and: [
                                                            { $eq: ['$documentType', 'receipt'] },
                                                            { $eq: ['$status', 'paid'] },
                                                            { $gt: ['$$paid', MONEY_EPS] },
                                                            { $gt: ['$$balance', MONEY_EPS] },
                                                        ],
                                                    },
                                                ],
                                            },
                                            '$$balance',
                                            0,
                                        ],
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    ]);

    const row = rows[0] || { totalInvoices: 0, paidRevenue: 0, pendingRevenue: 0 };
    return {
        totalInvoices: row.totalInvoices || 0,
        paidRevenue: roundMoney(row.paidRevenue),
        pendingRevenue: roundMoney(row.pendingRevenue),
    };
}

async function attachClientNames(docs) {
    if (!docs.length) return [];

    const clientIds = [
        ...new Set(docs.map((d) => d.clientId?.toString?.() || d.clientId).filter(Boolean)),
    ];
    const clients = clientIds.length
        ? await Client.find({ _id: { $in: clientIds } }).select('name').lean()
        : [];
    const nameById = Object.fromEntries(
        clients.map((client) => [client._id.toString(), client.name || ''])
    );

    return docs.map((doc) => {
        const mapped = mapSummary(doc);
        const clientId = doc.clientId?.toString?.() || doc.clientId || null;
        return {
            ...mapped,
            clientName: clientId ? nameById[clientId] || 'Unknown Client' : 'Unknown Client',
        };
    });
}

/** Core dashboard payload — stats, recent documents, overdue alerts. */
export async function getDashboardForUser(userId) {
    const uid = toUserObjectId(userId);
    const nonDraftFilter = { userId: uid, status: { $ne: 'draft' } };

    const [
        revenueStats,
        recentInvoicesRaw,
        recentReceiptsRaw,
        recentQuotationsRaw,
        overdueRaw,
        draftCount,
        totalClients,
        totalQuotations,
        totalReceipts,
    ] = await Promise.all([
        getInvoiceRevenueStats(userId),
        Invoice.find({ ...nonDraftFilter, ...INVOICE_ONLY_FILTER })
            .select(INVOICE_SUMMARY_FIELDS)
            .sort({ createdAt: -1 })
            .limit(5)
            .lean(),
        Invoice.find({ ...nonDraftFilter, ...RECEIPT_ONLY_FILTER })
            .select(INVOICE_SUMMARY_FIELDS)
            .sort({ createdAt: -1 })
            .limit(5)
            .lean(),
        Quotation.find(nonDraftFilter)
            .select(QUOTATION_SUMMARY_FIELDS)
            .sort({ createdAt: -1 })
            .limit(5)
            .lean(),
        Invoice.find({ userId: uid, status: 'overdue', ...INVOICE_ONLY_FILTER })
            .select(INVOICE_SUMMARY_FIELDS)
            .sort({ dueDate: 1 })
            .limit(OVERDUE_LIMIT)
            .lean(),
        getDraftCountForUser(userId),
        Client.countDocuments({ userId: uid }),
        Quotation.countDocuments(nonDraftFilter),
        Invoice.countDocuments({ userId: uid, status: 'paid', ...RECEIPT_ONLY_FILTER }),
    ]);

    const invoiceDocs = recentInvoicesRaw.map((inv) => ({
        ...inv,
        documentType: 'invoice',
        displayNumber: inv.invoiceNumber || '',
    }));
    const receiptDocs = recentReceiptsRaw.map((rec) => ({
        ...rec,
        documentType: 'receipt',
        displayNumber: rec.receiptNumber || '',
    }));
    const quotationDocs = recentQuotationsRaw.map((q) => ({
        ...q,
        documentType: 'quotation',
        displayNumber: q.quotationNumber || '',
    }));

    const mergedRecent = [...invoiceDocs, ...receiptDocs, ...quotationDocs]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 5);

    const [recentDocuments, overdueInvoices] = await Promise.all([
        attachClientNames(mergedRecent),
        attachClientNames(overdueRaw),
    ]);

    const recentInvoices = recentDocuments.filter((d) => d.documentType === 'invoice');

    return {
        stats: {
            totalInvoices: revenueStats.totalInvoices,
            totalQuotations,
            totalReceipts,
            totalClients,
            paidRevenue: revenueStats.paidRevenue,
            pendingRevenue: revenueStats.pendingRevenue,
            draftCount,
        },
        recentDocuments,
        recentInvoices,
        overdueInvoices,
    };
}

/** Full aggregated dashboard with subscription and business info. */
export async function getFullDashboardForUser(userId) {
    const cacheKey = String(userId);
    const cached = getCache('dashboard', cacheKey);
    if (cached) return cached;

    const uid = toUserObjectId(userId);

    const [dashboard, invoiceUsage, businessDoc] = await Promise.all([
        getDashboardForUser(userId),
        getInvoiceUsageForUser(userId),
        BusinessInfo.findOne({ userId: uid }).lean(),
    ]);

    const businessInfo = toBusinessInfoResponse(businessDoc, { includeAssets: false });

    const result = {
        ...dashboard,
        invoiceUsage,
        businessInfo,
        subscription: {
            plan: businessInfo?.plan || 'free',
            premiumUntil: businessInfo?.premiumUntil || null,
            subscriptionStatus: businessInfo?.subscriptionStatus || null,
            subscriptionRenews: businessInfo?.subscriptionRenews || null,
        },
    };

    setCache('dashboard', cacheKey, result, DASHBOARD_CACHE_TTL_MS);
    return result;
}

export function invalidateDashboardCache(userId) {
    invalidateCache('dashboard', String(userId));
}

/** Lightweight counts for app shell (sidebar draft badge). */
export async function getInvoiceMetaForUser(userId) {
    const draftCount = await getDraftCountForUser(userId);
    return { draftCount };
}
