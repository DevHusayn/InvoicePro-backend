import test from 'node:test';
import assert from 'node:assert/strict';
import {
    classifyStockStatus,
    computeInventorySummaryFromProducts,
    buildInventoryStockStatusFilter,
} from '../utils/inventoryList.js';

test('classifyStockStatus returns in_stock when above threshold', () => {
    assert.equal(
        classifyStockStatus({
            trackInventory: true,
            quantityOnHand: 20,
            lowStockThreshold: 5,
        }),
        'in_stock'
    );
});

test('classifyStockStatus returns low_stock when at or below threshold', () => {
    assert.equal(
        classifyStockStatus({
            trackInventory: true,
            quantityOnHand: 5,
            lowStockThreshold: 5,
        }),
        'low_stock'
    );
});

test('classifyStockStatus returns out_of_stock when quantity is zero', () => {
    assert.equal(
        classifyStockStatus({
            trackInventory: true,
            quantityOnHand: 0,
            lowStockThreshold: 5,
        }),
        'out_of_stock'
    );
});

test('classifyStockStatus ignores untracked products', () => {
    assert.equal(classifyStockStatus({ trackInventory: false, quantityOnHand: 0 }), null);
});

test('computeInventorySummaryFromProducts aggregates units, value, and health counts', () => {
    const summary = computeInventorySummaryFromProducts([
        { trackInventory: true, quantityOnHand: 10, unitCost: 100, unitPrice: 150, lowStockThreshold: 2 },
        { trackInventory: true, quantityOnHand: 2, unitCost: 50, unitPrice: 80, lowStockThreshold: 5 },
        { trackInventory: true, quantityOnHand: 0, unitCost: 25, unitPrice: 40, lowStockThreshold: 1 },
        { trackInventory: false, quantityOnHand: 99, unitCost: 10, unitPrice: 20 },
    ]);

    assert.deepEqual(summary, {
        trackedProducts: 3,
        totalUnitsOnHand: 12,
        totalStockValue: 1100,
        totalPotentialSalesValue: 1660,
        lowStockCount: 1,
        outOfStockCount: 1,
    });
});

test('buildInventoryStockStatusFilter maps known status keys', () => {
    assert.deepEqual(buildInventoryStockStatusFilter('out_of_stock'), {
        quantityOnHand: { $lte: 0 },
    });
    assert.deepEqual(buildInventoryStockStatusFilter('all'), {});
    assert.ok(buildInventoryStockStatusFilter('in_stock').$expr);
    assert.ok(buildInventoryStockStatusFilter('low_stock').$expr);
});
