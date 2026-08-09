import test from 'node:test';
import assert from 'node:assert/strict';
import {
    escapeCsvField,
    excelTextCsvField,
    formatListExportDate,
    rowsToCsv,
    buildListExportFilename,
    assertExportWithinLimit,
    LIST_EXPORT_MAX,
} from '../utils/listExport.js';

test('escapeCsvField quotes fields with commas', () => {
    assert.equal(escapeCsvField('Acme, Inc.'), '"Acme, Inc."');
});

test('rowsToCsv builds header and body', () => {
    const csv = rowsToCsv(['A', 'B'], [['1', '2']]);
    assert.equal(csv, 'A,B\r\n1,2');
});

test('excelTextCsvField wraps values for Excel text display', () => {
    assert.equal(excelTextCsvField('2026-07-01'), '"=""2026-07-01"""');
});

test('formatListExportDate exports Excel-safe date text', () => {
    assert.equal(formatListExportDate('2026-07-01'), '"=""2026-07-01"""');
    assert.equal(formatListExportDate(''), '');
    assert.equal(formatListExportDate(null), '');
});

test('rowsToCsv preserves preformatted Excel text cells', () => {
    const csv = rowsToCsv(['Date'], [[formatListExportDate('2026-08-09')]]);
    assert.equal(csv, 'Date\r\n"=""2026-08-09"""');
});

test('buildListExportFilename includes company, resource, filters, and filtered slug', () => {
    const name = buildListExportFilename('Acme Corp', 'invoices', {
        year: 2026,
        month: 8,
        status: 'pending',
    });
    assert.match(name, /^acme-corp-invoices-2026-08-pending-filtered-\d{4}-\d{2}-\d{2}\.csv$/);
});

test('buildListExportFilename falls back when company name is missing', () => {
    const name = buildListExportFilename('', 'clients', {});
    assert.match(name, /^business-clients-filtered-\d{4}-\d{2}-\d{2}\.csv$/);
});

test('assertExportWithinLimit throws when over cap', () => {
    assert.throws(
        () => assertExportWithinLimit(LIST_EXPORT_MAX + 1),
        (err) => err.status === 400 && /Export limited/.test(err.message)
    );
});

test('assertExportWithinLimit allows rows at cap', () => {
    assert.doesNotThrow(() => assertExportWithinLimit(LIST_EXPORT_MAX));
});
