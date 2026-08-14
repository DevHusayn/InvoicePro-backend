import Product from '../models/Product.js';
import { getListPeriodMongoFilter } from './listMonthFilter.js';
import { buildSearchFilter } from './pagination.js';
import {
    LIST_EXPORT_MAX,
    rowsToCsv,
    sendListCsvResponse,
    resolveListExportFilename,
    assertExportWithinLimit,
    formatListExportDate,
} from './listExport.js';

export async function buildProductListFilter(userId, query = {}) {
    const filter = { userId };
    const searchFilter = buildSearchFilter(query.search, ['name', 'description']);
    if (searchFilter) Object.assign(filter, searchFilter);

    const dateFilter = await getListPeriodMongoFilter(query, userId, { dateField: 'createdAt' });
    if (dateFilter) Object.assign(filter, dateFilter);
    return filter;
}

function formatExportPrice(value) {
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : 0;
}

function productsToCsv(rows) {
    const headers = [
        'Name',
        'Description',
        'Price',
        'Track inventory',
        'Quantity on hand',
        'Low stock threshold',
        'Created date',
    ];
    const body = rows.map((row) => [
        row.name || '',
        row.description || '',
        formatExportPrice(row.unitPrice),
        row.trackInventory ? 'Yes' : 'No',
        row.trackInventory ? (row.quantityOnHand ?? 0) : '',
        row.trackInventory && row.lowStockThreshold != null ? row.lowStockThreshold : '',
        formatListExportDate(row.createdAt),
    ]);
    return rowsToCsv(headers, body);
}

export async function exportProductsCsv(userId, query = {}) {
    const filter = await buildProductListFilter(userId, query);
    const total = await Product.countDocuments(filter);
    assertExportWithinLimit(total);

    const data = await Product.find(filter).sort({ name: 1 }).limit(LIST_EXPORT_MAX).lean();
    return {
        csv: productsToCsv(data),
        filename: await resolveListExportFilename(userId, 'products', query),
    };
}

export async function sendProductListExport(req, res) {
    const { csv, filename } = await exportProductsCsv(req.user.userId, req.query);
    sendListCsvResponse(res, filename, csv);
}
