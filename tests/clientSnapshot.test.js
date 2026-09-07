import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeClientDisplayFields } from '../utils/clientSnapshot.js';
import { attachClientNamesToDocuments } from '../utils/attachClientNames.js';
import { sanitizeInvoicePayload } from '../utils/invoiceValidation.js';
import { buildRecurringInvoiceChildPayload } from '../utils/recurringInvoices.js';

test('mergeClientDisplayFields prefers the live client name', () => {
    const merged = mergeClientDisplayFields(
        { clientName: 'Old name', clientCompany: 'Old Co' },
        { name: 'New name', company: 'New Co' }
    );
    assert.equal(merged.clientName, 'New name');
    assert.equal(merged.clientCompany, 'New Co');
});

test('mergeClientDisplayFields keeps the document snapshot when the client is gone', () => {
    const merged = mergeClientDisplayFields(
        { clientName: 'Cally', clientCompany: 'Cally Ltd' },
        null
    );
    assert.equal(merged.clientName, 'Cally');
    assert.equal(merged.clientCompany, 'Cally Ltd');
});

test('attachClientNamesToDocuments keeps snapshots when no client ids are present', async () => {
    const [row] = await attachClientNamesToDocuments(
        [{ invoiceNumber: 'INV-1', clientName: 'Adelokun', clientCompany: null }],
        '507f1f77bcf86cd799439011'
    );
    assert.equal(row.clientName, 'Adelokun');
    assert.equal(row.clientCompany, null);
});

test('sanitizeInvoicePayload accepts client snapshot fields', () => {
    const payload = sanitizeInvoicePayload({
        status: 'pending',
        clientName: '  Mubarak Adelokun 1  ',
        clientCompany: 'Ada Ventures',
        items: [{ description: 'Consulting', quantity: 1, rate: 50000 }],
    });
    assert.equal(payload.clientName, 'Mubarak Adelokun 1');
    assert.equal(payload.clientCompany, 'Ada Ventures');
});

test('buildRecurringInvoiceChildPayload copies the client snapshot', () => {
    const child = buildRecurringInvoiceChildPayload({
        _id: 'tmpl1',
        userId: 'user1',
        clientId: 'client1',
        clientName: 'Cally',
        clientCompany: 'Cally Ltd',
        date: '2026-08-26',
        dueDate: '2026-09-09',
        recurringNextDate: '2026-09-26',
        items: [{ description: 'Retainer', quantity: 1, rate: 50000, unit: 'Qty' }],
        notes: 'Thanks',
        currency: 'NGN',
        taxRate: 0,
        subtotal: 50000,
        tax: 0,
        total: 50000,
    });

    assert.equal(child.clientId, 'client1');
    assert.equal(child.clientName, 'Cally');
    assert.equal(child.clientCompany, 'Cally Ltd');
});
