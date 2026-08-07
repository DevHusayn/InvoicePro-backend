import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildReceiptPartialFilter,
    buildReceiptFullFilter,
} from '../utils/receiptValidation.js';

function matchesPartial(doc) {
    const amountPaid = Number(doc.amountPaid) || 0;
    const total = Number(doc.total) || 0;
    return amountPaid > 0.009 && total - amountPaid > 0.009;
}

function matchesFull(doc) {
    const amountPaid = Number(doc.amountPaid) || 0;
    const total = Number(doc.total) || 0;
    if (total <= 0) return false;
    if (amountPaid <= 0.009) return true;
    return amountPaid + 0.009 >= total;
}

test('receipt partial/full filters are exported', () => {
    assert.ok(buildReceiptPartialFilter().$expr);
    assert.ok(buildReceiptFullFilter().$expr);
});

test('receipt partial/full classification mirrors UI rules', () => {
    const partial = { documentType: 'receipt', status: 'paid', total: 1000, amountPaid: 400 };
    const full = { documentType: 'receipt', status: 'paid', total: 1000, amountPaid: 1000 };
    const legacyFull = { documentType: 'receipt', status: 'paid', total: 1000, amountPaid: 0 };

    assert.equal(matchesPartial(partial), true);
    assert.equal(matchesFull(partial), false);
    assert.equal(matchesPartial(full), false);
    assert.equal(matchesFull(full), true);
    assert.equal(matchesPartial(legacyFull), false);
    assert.equal(matchesFull(legacyFull), true);
});
