import mongoose from 'mongoose';
import Invoice from '../models/Invoice.js';
import Quotation from '../models/Quotation.js';
import Client from '../models/Client.js';
import { buildSearchFilter, escapeRegex } from './pagination.js';
import { INVOICE_ONLY_FILTER, RECEIPT_ONLY_FILTER } from './invoiceDocumentFilter.js';
import { DOCUMENT_CLIENT_SEARCH_FIELDS } from './clientSnapshot.js';
import { attachClientNamesToDocuments } from './attachClientNames.js';

function toUserObjectId(userId) {
    if (userId instanceof mongoose.Types.ObjectId) return userId;
    return new mongoose.Types.ObjectId(String(userId));
}

async function resolveSearchClientIds(userId, search) {
    const q = String(search || '').trim();
    if (!q) return [];
    const regex = new RegExp(escapeRegex(q), 'i');
    const clients = await Client.find({
        userId,
        $or: [{ name: regex }, { company: regex }, { email: regex }],
    })
        .select('_id')
        .lean();
    return clients.map((c) => c._id);
}

async function attachClientNames(docs, userId) {
    return attachClientNamesToDocuments(docs, userId);
}

function buildDraftFilter(userId, search, clientIds, numberFields, extra = {}) {
    const filter = { userId, status: 'draft', ...extra };
    if (!search) return filter;

    const textFilter = buildSearchFilter(search, [...numberFields, ...DOCUMENT_CLIENT_SEARCH_FIELDS]);
    const or = [...(textFilter?.$or || [])];
    if (clientIds.length > 0) {
        or.push({ clientId: { $in: clientIds } });
    }
    if (or.length > 0) {
        filter.$or = or;
    }
    return filter;
}

/** Combined draft count for sidebar badge / meta. */
export async function getDraftCountForUser(userId) {
    const uid = toUserObjectId(userId);
    const [invoiceDrafts, receiptDrafts, quotationDrafts] = await Promise.all([
        Invoice.countDocuments({ userId: uid, status: 'draft', ...INVOICE_ONLY_FILTER }),
        Invoice.countDocuments({ userId: uid, status: 'draft', ...RECEIPT_ONLY_FILTER }),
        Quotation.countDocuments({ userId: uid, status: 'draft' }),
    ]);
    return invoiceDrafts + receiptDrafts + quotationDrafts;
}

/**
 * Merged invoice + receipt + quotation drafts, newest first.
 * Drafts are typically few, so fetch-then-slice is accurate for pagination.
 */
export async function getMergedDraftsForUser(userId, { skip = 0, limit = 20, search = '' } = {}) {
    const uid = toUserObjectId(userId);
    const q = String(search || '').trim();
    const clientIds = q ? await resolveSearchClientIds(uid, q) : [];

    const invoiceFilter = buildDraftFilter(uid, q, clientIds, ['invoiceNumber', 'receiptNumber'], INVOICE_ONLY_FILTER);
    const receiptFilter = buildDraftFilter(uid, q, clientIds, ['receiptNumber'], RECEIPT_ONLY_FILTER);
    const quotationFilter = buildDraftFilter(uid, q, clientIds, ['quotationNumber']);

    const [invoiceRaw, receiptRaw, quotationRaw] = await Promise.all([
        Invoice.find(invoiceFilter)
            .select('-items -notes')
            .sort({ updatedAt: -1 })
            .lean(),
        Invoice.find(receiptFilter)
            .select('-items -notes')
            .sort({ updatedAt: -1 })
            .lean(),
        Quotation.find(quotationFilter)
            .select('-items -notes -terms')
            .sort({ updatedAt: -1 })
            .lean(),
    ]);

    const invoiceDocs = invoiceRaw.map((inv) => ({
        ...inv,
        documentType: 'invoice',
        id: inv._id?.toString?.() || inv._id,
    }));
    const receiptDocs = receiptRaw.map((rec) => ({
        ...rec,
        documentType: 'receipt',
        id: rec._id?.toString?.() || rec._id,
    }));
    const quotationDocs = quotationRaw.map((qt) => ({
        ...qt,
        documentType: 'quotation',
        id: qt._id?.toString?.() || qt._id,
    }));

    const merged = [...invoiceDocs, ...receiptDocs, ...quotationDocs].sort(
        (a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
    );

    const total = merged.length;
    const pageSlice = merged.slice(skip, skip + limit);
    const withClients = await attachClientNames(pageSlice, uid);

    return { data: withClients, total };
}
