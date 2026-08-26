import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalogProductFromPoLine } from '../utils/purchaseOrderReceive.js';

const userId = '507f1f77bcf86cd799439011';

test('buildCatalogProductFromPoLine creates a tracked product from a PO line', () => {
    const product = buildCatalogProductFromPoLine(userId, {
        description: 'Watch',
        rate: 2000,
    });

    assert.equal(product.userId, userId);
    assert.equal(product.name, 'Watch');
    assert.equal(product.unitCost, 2000);
    assert.equal(product.unitPrice, 0);
    assert.equal(product.trackInventory, true);
    assert.equal(product.quantityOnHand, 0);
});

test('buildCatalogProductFromPoLine rejects blank descriptions', () => {
    assert.throws(
        () => buildCatalogProductFromPoLine(userId, { description: '   ', rate: 100 }),
        (err) => err.message.includes('description')
    );
});
