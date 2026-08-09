import test from 'node:test';
import assert from 'node:assert/strict';
import {
    aggregateProductQuantities,
    computeStockDeltas,
    isInventoryCommitted,
} from '../utils/inventory.js';
import { sanitizeInvoicePayload } from '../utils/invoiceValidation.js';
import { sanitizeQuotationPayload } from '../utils/quotationValidation.js';

test('isInventoryCommitted treats draft and cancelled as inactive', () => {
    assert.equal(isInventoryCommitted('draft'), false);
    assert.equal(isInventoryCommitted('cancelled'), false);
    assert.equal(isInventoryCommitted('pending'), true);
    assert.equal(isInventoryCommitted('paid'), true);
});

test('aggregateProductQuantities sums quantities by productId', () => {
    const map = aggregateProductQuantities([
        { productId: '64a1', quantity: 2 },
        { productId: '64a1', quantity: 3 },
        { productId: '64b2', quantity: 1 },
        { description: 'Manual line', quantity: 5 },
    ]);

    assert.equal(map.get('64a1'), 5);
    assert.equal(map.get('64b2'), 1);
    assert.equal(map.size, 2);
});

test('computeStockDeltas deducts on issue and restores on cancel', () => {
    const prev = new Map();
    const next = new Map([['64a1', 4]]);

    const issueDeltas = computeStockDeltas(prev, next);
    assert.equal(issueDeltas.get('64a1'), -4);

    const cancelDeltas = computeStockDeltas(next, prev);
    assert.equal(cancelDeltas.get('64a1'), 4);
});

test('computeStockDeltas applies quantity delta on issued update', () => {
    const prev = new Map([['64a1', 2]]);
    const next = new Map([['64a1', 5]]);

    const deltas = computeStockDeltas(prev, next);
    assert.equal(deltas.get('64a1'), -3);
});

test('sanitizeInvoicePayload preserves optional productId on line items', () => {
    const productId = '507f1f77bcf86cd799439011';
    const payload = sanitizeInvoicePayload({
        status: 'draft',
        items: [{ description: 'Widget', quantity: 2, rate: 100, productId }],
    });

    assert.equal(payload.items[0].productId, productId);
});

test('sanitizeInvoicePayload rejects invalid productId on line items', () => {
    assert.throws(
        () =>
            sanitizeInvoicePayload({
                status: 'draft',
                items: [{ description: 'Widget', quantity: 1, rate: 100, productId: 'bad-id' }],
            }),
        (err) => err.message.includes('Invalid product ID')
    );
});

test('sanitizeQuotationPayload preserves optional productId without stock impact', () => {
    const productId = '507f1f77bcf86cd799439011';
    const payload = sanitizeQuotationPayload({
        status: 'sent',
        items: [{ description: 'Widget', quantity: 2, rate: 100, productId }],
    });

    assert.equal(payload.items[0].productId, productId);
});

test('issued update with lower quantity restores stock delta', () => {
    const prev = new Map([['64a1', 5]]);
    const next = new Map([['64a1', 2]]);

    const deltas = computeStockDeltas(prev, next);
    assert.equal(deltas.get('64a1'), 3);
});

test('untracked manual lines produce no aggregated quantities', () => {
    const map = aggregateProductQuantities([
        { description: 'Consulting', quantity: 10, rate: 5000 },
    ]);
    assert.equal(map.size, 0);
});
