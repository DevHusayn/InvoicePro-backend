import test from 'node:test';
import assert from 'node:assert/strict';
import { inferLedgerAction, resolveLedgerDocument } from '../utils/stockLedger.js';

test('inferLedgerAction detects issue, delete, cancel, and update', () => {
    assert.equal(inferLedgerAction(null, { status: 'pending' }), 'issue');
    assert.equal(inferLedgerAction({ status: 'pending' }, null), 'delete');
    assert.equal(
        inferLedgerAction({ status: 'pending' }, { status: 'cancelled' }),
        'cancel',
    );
    assert.equal(
        inferLedgerAction({ status: 'pending' }, { status: 'pending' }),
        'update',
    );
    assert.equal(
        inferLedgerAction({ status: 'draft' }, { status: 'pending' }),
        'issue',
    );
    assert.equal(
        inferLedgerAction({ status: 'draft' }, { status: 'paid' }),
        'issue',
    );
});

test('resolveLedgerDocument prefers next doc and maps receipt numbers', () => {
    const resolved = resolveLedgerDocument(null, {
        _id: '64a1',
        documentType: 'receipt',
        receiptNumber: 'RCT-001',
    });

    assert.equal(resolved.source, 'receipt');
    assert.equal(String(resolved.documentId), '64a1');
    assert.equal(resolved.documentNumber, 'RCT-001');
});

test('resolveLedgerDocument falls back to previous doc on delete', () => {
    const resolved = resolveLedgerDocument({
        _id: '64b2',
        documentType: 'invoice',
        invoiceNumber: 'INV-0042',
    }, null);

    assert.equal(resolved.source, 'invoice');
    assert.equal(resolved.documentNumber, 'INV-0042');
});
