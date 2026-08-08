import test from 'node:test';
import assert from 'node:assert/strict';
import { computePendingBalance } from '../utils/dashboardStats.js';

test('computePendingBalance includes unpaid invoice balances', () => {
    assert.equal(
        computePendingBalance({ documentType: 'invoice', status: 'pending', total: 5000, amountPaid: 0 }),
        5000
    );
    assert.equal(
        computePendingBalance({ documentType: 'invoice', status: 'partial', total: 5000, amountPaid: 2000 }),
        3000
    );
    assert.equal(
        computePendingBalance({ documentType: 'invoice', status: 'overdue', total: 2500, amountPaid: 500 }),
        2000
    );
});

test('computePendingBalance includes partial receipt remainders', () => {
    assert.equal(
        computePendingBalance({ documentType: 'receipt', status: 'paid', total: 1000, amountPaid: 400 }),
        600
    );
});

test('computePendingBalance excludes fully paid receipts', () => {
    assert.equal(
        computePendingBalance({ documentType: 'receipt', status: 'paid', total: 1000, amountPaid: 1000 }),
        0
    );
    assert.equal(
        computePendingBalance({ documentType: 'receipt', status: 'paid', total: 1000, amountPaid: 0 }),
        0
    );
});

test('computePendingBalance excludes cancelled and draft documents', () => {
    assert.equal(
        computePendingBalance({ documentType: 'invoice', status: 'cancelled', total: 1000, amountPaid: 0 }),
        0
    );
    assert.equal(
        computePendingBalance({ documentType: 'receipt', status: 'draft', total: 1000, amountPaid: 0 }),
        0
    );
});
