import Invoice from '../models/Invoice.js';
import Client from '../models/Client.js';
import { RECEIPT_ONLY_FILTER } from './invoiceDocumentFilter.js';
import { getListPeriodMongoFilter } from './listMonthFilter.js';
import { buildSearchFilter, escapeRegex } from './pagination.js';
import {
    buildReceiptPartialFilter,
    buildReceiptFullFilter,
    isPartialReceiptDoc,
} from './receiptValidation.js';
import { attachClientNamesToDocuments } from './attachClientNames.js';
import {
    LIST_EXPORT_MAX,
    rowsToCsv,
    sendListCsvResponse,
    resolveListExportFilename,
    assertExportWithinLimit,
    formatListExportDate,
} from './listExport.js';

const PAID = 'paid';

const RECEIPT_SORT = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    amountHigh: { total: -1 },
    amountLow: { total: 1 },
};

const RECEIPT_LIST_BASE = { status: PAID, ...RECEIPT_ONLY_FILTER };

const PAYMENT_METHOD_LABELS = {
    cash: 'Cash',
    bank_transfer: 'Bank transfer',
    pos: 'POS',
    card: 'Card',
    online_gateway: 'Online payment',
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

async function mergeReceiptSearchFilter(filter, userId, search) {
    const q = String(search || '').trim();
    if (!q) return filter;

    const clientIds = await resolveSearchClientIds(userId, q);
    const textFilter = buildSearchFilter(q, ['receiptNumber']);
    const or = [...(textFilter?.$or || [])];
    if (clientIds.length > 0) {
        or.push({ clientId: { $in: clientIds } });
    }
    if (or.length > 0) {
        return { ...filter, $or: or };
    }
    return filter;
}

export async function buildReceiptListFilter(userId, query = {}) {
    const paymentStatus = String(query.status || 'all').trim().toLowerCase();
    const search = String(query.search || '').trim();
    const dateFilter = await getListPeriodMongoFilter(query, userId);

    let filter = { userId, ...RECEIPT_LIST_BASE };
    if (dateFilter) {
        Object.assign(filter, dateFilter);
    }
    if (paymentStatus === 'partial') {
        Object.assign(filter, buildReceiptPartialFilter());
    } else if (paymentStatus === 'full') {
        Object.assign(filter, buildReceiptFullFilter());
    }
    filter = await mergeReceiptSearchFilter(filter, userId, search);
    return filter;
}

function receiptStatusLabel(doc) {
    if (isPartialReceiptDoc(doc)) return 'Part received';
    return 'Fully received';
}

function formatPaymentMethod(method) {
    return PAYMENT_METHOD_LABELS[method] || method || '';
}

function receiptsToCsv(rows) {
    const headers = [
        'Receipt',
        'Client',
        'Issue date',
        'Payment date',
        'Amount',
        'Payment method',
        'Status',
    ];
    const body = rows.map((row) => [
        row.receiptNumber || '',
        row.clientName || '',
        formatListExportDate(row.date),
        formatListExportDate(row.datePaid),
        row.total ?? 0,
        formatPaymentMethod(row.paymentMethod),
        receiptStatusLabel(row),
    ]);
    return rowsToCsv(headers, body);
}

export async function exportReceiptsCsv(userId, query = {}) {
    const filter = await buildReceiptListFilter(userId, query);
    const sortKey = String(query.sort || 'newest').trim();
    const sort = RECEIPT_SORT[sortKey] || RECEIPT_SORT.newest;
    const total = await Invoice.countDocuments(filter);
    assertExportWithinLimit(total);

    const data = await Invoice.find(filter)
        .sort(sort)
        .select('-items -notes')
        .limit(LIST_EXPORT_MAX)
        .lean();
    const withClients = await attachClientNamesToDocuments(data, userId);
    return {
        csv: receiptsToCsv(withClients),
        filename: await resolveListExportFilename(userId, 'receipts', query),
    };
}

export async function sendReceiptListExport(req, res) {
    const { csv, filename } = await exportReceiptsCsv(req.user.userId, req.query);
    sendListCsvResponse(res, filename, csv);
}
