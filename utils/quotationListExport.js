import Quotation from '../models/Quotation.js';
import Client from '../models/Client.js';
import { parseListMonthQuery, buildIssueDateMonthFilter } from './listMonthFilter.js';
import { buildSearchFilter, escapeRegex } from './pagination.js';
import { syncExpiredQuotationsForUser } from './quotationExpire.js';
import { attachClientNamesToDocuments } from './attachClientNames.js';
import {
    LIST_EXPORT_MAX,
    rowsToCsv,
    sendListCsvResponse,
    resolveListExportFilename,
    assertExportWithinLimit,
    formatListExportDate,
} from './listExport.js';

const QUOTATION_SORT = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    validUntil: { validUntil: 1 },
    amountHigh: { total: -1 },
    amountLow: { total: 1 },
};

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

export async function buildQuotationListFilter(userId, query = {}) {
    const status = String(query.status || 'all').trim().toLowerCase();
    const search = String(query.search || '').trim();
    const listMonth = parseListMonthQuery(query);
    const dateFilter = listMonth ? buildIssueDateMonthFilter(listMonth.year, listMonth.month) : null;

    const filter = { userId, status: { $ne: 'draft' } };
    if (status && status !== 'all') {
        filter.status = status;
    }
    if (dateFilter) {
        Object.assign(filter, dateFilter);
    }
    if (search) {
        const clientIds = await resolveSearchClientIds(userId, search);
        const textFilter = buildSearchFilter(search, ['quotationNumber']);
        const or = [...(textFilter?.$or || [])];
        if (clientIds.length > 0) {
            or.push({ clientId: { $in: clientIds } });
        }
        if (or.length > 0) {
            filter.$or = or;
        }
    }
    return filter;
}

function quotationsToCsv(rows) {
    const headers = ['Quotation', 'Client', 'Issue date', 'Valid until', 'Amount', 'Status'];
    const body = rows.map((row) => [
        row.quotationNumber || '',
        row.clientName || '',
        formatListExportDate(row.date),
        formatListExportDate(row.validUntil),
        row.total ?? 0,
        row.status || '',
    ]);
    return rowsToCsv(headers, body);
}

export async function exportQuotationsCsv(userId, query = {}) {
    await syncExpiredQuotationsForUser(userId);
    const filter = await buildQuotationListFilter(userId, query);
    const sortKey = String(query.sort || 'newest').trim();
    const sort = QUOTATION_SORT[sortKey] || QUOTATION_SORT.newest;
    const total = await Quotation.countDocuments(filter);
    assertExportWithinLimit(total);

    const data = await Quotation.find(filter)
        .sort(sort)
        .select('-items -notes -terms')
        .limit(LIST_EXPORT_MAX)
        .lean();
    const withClients = await attachClientNamesToDocuments(data, userId);
    return {
        csv: quotationsToCsv(withClients),
        filename: await resolveListExportFilename(userId, 'quotations', query),
    };
}

export async function sendQuotationListExport(req, res) {
    const { csv, filename } = await exportQuotationsCsv(req.user.userId, req.query);
    sendListCsvResponse(res, filename, csv);
}
