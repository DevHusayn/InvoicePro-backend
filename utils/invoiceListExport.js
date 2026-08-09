import Invoice from '../models/Invoice.js';
import Client from '../models/Client.js';
import { INVOICE_ONLY_FILTER } from './invoiceDocumentFilter.js';
import { parseListMonthQuery, buildIssueDateMonthFilter } from './listMonthFilter.js';
import { buildSearchFilter, escapeRegex } from './pagination.js';
import { getInvoiceAmountPaid, getInvoiceBalanceDue } from './invoicePayments.js';
import { attachClientNamesToDocuments } from './attachClientNames.js';
import {
    LIST_EXPORT_MAX,
    rowsToCsv,
    sendListCsvResponse,
    resolveListExportFilename,
    assertExportWithinLimit,
    formatListExportDate,
} from './listExport.js';

const INVOICE_SORT = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    dueDate: { dueDate: 1 },
    amountHigh: { total: -1 },
    amountLow: { total: 1 },
};

async function resolveInvoiceSearchClientIds(userId, search) {
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

export async function buildInvoiceListFilter(userId, query = {}) {
    const status = String(query.status || 'all').trim().toLowerCase();
    const search = String(query.search || '').trim();
    const listMonth = parseListMonthQuery(query);
    const dateFilter = listMonth ? buildIssueDateMonthFilter(listMonth.year, listMonth.month) : null;

    const filter = { userId, status: { $ne: 'draft' }, ...INVOICE_ONLY_FILTER };
    if (status && status !== 'all') {
        filter.status = status;
    }
    if (dateFilter) {
        Object.assign(filter, dateFilter);
    }
    if (search) {
        const clientIds = await resolveInvoiceSearchClientIds(userId, search);
        const textFilter = buildSearchFilter(search, ['invoiceNumber', 'receiptNumber']);
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

function invoicesToCsv(rows) {
    const headers = ['Invoice', 'Client', 'Issue date', 'Due date', 'Amount', 'Paid', 'Balance', 'Status'];
    const body = rows.map((row) => {
        const paid = getInvoiceAmountPaid(row);
        const balance = getInvoiceBalanceDue(row);
        return [
            row.invoiceNumber || '',
            row.clientName || '',
            formatListExportDate(row.date),
            formatListExportDate(row.dueDate),
            row.total ?? 0,
            paid,
            balance,
            row.status || '',
        ];
    });
    return rowsToCsv(headers, body);
}

export async function exportInvoicesCsv(userId, query = {}) {
    const filter = await buildInvoiceListFilter(userId, query);
    const sortKey = String(query.sort || 'newest').trim();
    const sort = INVOICE_SORT[sortKey] || INVOICE_SORT.newest;
    const total = await Invoice.countDocuments(filter);
    assertExportWithinLimit(total);

    const data = await Invoice.find(filter)
        .sort(sort)
        .select('-items -notes')
        .limit(LIST_EXPORT_MAX)
        .lean();
    const withClients = await attachClientNamesToDocuments(data, userId);
    return {
        csv: invoicesToCsv(withClients),
        filename: await resolveListExportFilename(userId, 'invoices', query),
    };
}

export async function sendInvoiceListExport(req, res) {
    const { csv, filename } = await exportInvoicesCsv(req.user.userId, req.query);
    sendListCsvResponse(res, filename, csv);
}
