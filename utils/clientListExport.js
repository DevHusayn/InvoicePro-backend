import Client from '../models/Client.js';
import { parseListMonthQuery } from './listMonthFilter.js';
import { buildSearchFilter } from './pagination.js';
import { getBusinessTimezone, getUtcRangeForMonthInTimezone } from './timezone.js';
import {
    LIST_EXPORT_MAX,
    rowsToCsv,
    sendListCsvResponse,
    resolveListExportFilename,
    assertExportWithinLimit,
    formatListExportDate,
} from './listExport.js';

export async function buildClientListFilter(userId, query = {}) {
    const filter = { userId };
    const searchFilter = buildSearchFilter(query.search, ['name', 'email', 'company', 'phone']);
    if (searchFilter) Object.assign(filter, searchFilter);

    const listMonth = parseListMonthQuery(query);
    if (listMonth) {
        const timeZone = await getBusinessTimezone(userId);
        const { start, end } = getUtcRangeForMonthInTimezone(
            listMonth.year,
            listMonth.month,
            timeZone
        );
        filter.createdAt = { $gte: start, $lt: end };
    }
    return filter;
}

function clientsToCsv(rows) {
    const headers = ['Name', 'Business', 'Email', 'Phone', 'Created date'];
    const body = rows.map((row) => [
        row.name || '',
        row.company || '',
        row.email || '',
        row.phone || '',
        formatListExportDate(row.createdAt),
    ]);
    return rowsToCsv(headers, body);
}

export async function exportClientsCsv(userId, query = {}) {
    const filter = await buildClientListFilter(userId, query);
    const total = await Client.countDocuments(filter);
    assertExportWithinLimit(total);

    const data = await Client.find(filter).sort({ name: 1 }).limit(LIST_EXPORT_MAX).lean();
    return {
        csv: clientsToCsv(data),
        filename: await resolveListExportFilename(userId, 'clients', query),
    };
}

export async function sendClientListExport(req, res) {
    const { csv, filename } = await exportClientsCsv(req.user.userId, req.query);
    sendListCsvResponse(res, filename, csv);
}
