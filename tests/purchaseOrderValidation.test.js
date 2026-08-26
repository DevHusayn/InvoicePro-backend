import test from 'node:test';
import assert from 'node:assert/strict';
import {
    assertPurchaseOrderUpdateAllowed,
    computePurchaseOrderStatus,
    PO_PARTIAL,
    PO_RECEIVED,
    PO_SENT,
    sanitizeReceivePayload,
} from '../utils/purchaseOrderValidation.js';

test('computePurchaseOrderStatus reflects receive progress', () => {
    assert.equal(
        computePurchaseOrderStatus([{ quantity: 10, quantityReceived: 0 }]),
        PO_SENT
    );
    assert.equal(
        computePurchaseOrderStatus([{ quantity: 10, quantityReceived: 4 }]),
        PO_PARTIAL
    );
    assert.equal(
        computePurchaseOrderStatus([
            { quantity: 10, quantityReceived: 10 },
            { quantity: 5, quantityReceived: 5 },
        ]),
        PO_RECEIVED
    );
});

test('sanitizeReceivePayload validates line indexes and quantities', () => {
    const lines = sanitizeReceivePayload({
        lines: [{ lineIndex: 0, quantity: 3 }],
    });
    assert.deepEqual(lines, [{ lineIndex: 0, quantity: 3 }]);
});

test('sanitizeReceivePayload rejects empty payload', () => {
    assert.throws(
        () => sanitizeReceivePayload({ lines: [] }),
        (err) => err.message.includes('At least one receive line')
    );
});

test('assertPurchaseOrderUpdateAllowed blocks marking received via PUT', () => {
    assert.throws(
        () =>
            assertPurchaseOrderUpdateAllowed(
                { status: PO_SENT },
                { status: PO_RECEIVED }
            ),
        (err) => err.message.includes('Receive stock')
    );
});

test('assertPurchaseOrderUpdateAllowed blocks marking partial via PUT', () => {
    assert.throws(
        () =>
            assertPurchaseOrderUpdateAllowed(
                { status: PO_SENT },
                { status: PO_PARTIAL }
            ),
        (err) => err.message.includes('Receive stock')
    );
});
