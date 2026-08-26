import test from 'node:test';
import assert from 'node:assert/strict';
import {
    suggestUnitPricePreservingMargin,
    buildSellingPricePrompts,
} from '../utils/purchaseOrderSellingPrice.js';

test('suggestUnitPricePreservingMargin keeps margin percent', () => {
    const suggested = suggestUnitPricePreservingMargin(400, 200, 250);
    assert.equal(suggested, 500);
});

test('suggestUnitPricePreservingMargin uses markup when margin is unavailable', () => {
    const suggested = suggestUnitPricePreservingMargin(300, 200, 250);
    assert.equal(suggested, 375);
});

test('suggestUnitPricePreservingMargin returns null without a selling price', () => {
    assert.equal(suggestUnitPricePreservingMargin(0, 200, 250), null);
});

test('buildSellingPricePrompts when PO rate differs from saved cost', () => {
    const snapshots = new Map([
        [
            'p1',
            {
                name: 'Gaming chair',
                previousUnitCost: 250000,
                previousUnitPrice: 350000,
            },
        ],
    ]);

    const prompts = buildSellingPricePrompts(snapshots, [
        {
            productId: 'p1',
            delta: 2,
            poRate: 300000,
            newUnitCost: 250000,
        },
    ]);

    assert.equal(prompts.length, 1);
    assert.equal(prompts[0].poRateDiffersFromSavedCost, true);
    assert.equal(prompts[0].catalogCostChanged, false);
    assert.equal(prompts[0].poLineRate, 300000);
    assert.equal(prompts[0].suggestedUnitPrice, 420000);
});

test('buildSellingPricePrompts when catalog cost changed after receive', () => {
    const snapshots = new Map([
        [
            'p1',
            {
                name: 'Laptop',
                previousUnitCost: 1000000,
                previousUnitPrice: 1500000,
            },
        ],
    ]);

    const prompts = buildSellingPricePrompts(snapshots, [
        {
            productId: 'p1',
            delta: 1,
            poRate: 1000000,
            newUnitCost: 1100000,
        },
    ]);

    assert.equal(prompts.length, 1);
    assert.equal(prompts[0].catalogCostChanged, true);
    assert.equal(prompts[0].poRateDiffersFromSavedCost, false);
    assert.equal(prompts[0].newUnitCost, 1100000);
    assert.equal(prompts[0].suggestedUnitPrice, 1650000);
});

test('buildSellingPricePrompts skips unchanged costs', () => {
    const snapshots = new Map([
        [
            'p1',
            {
                name: 'Mouse',
                previousUnitCost: 20000,
                previousUnitPrice: 30000,
            },
        ],
    ]);

    const prompts = buildSellingPricePrompts(snapshots, [
        {
            productId: 'p1',
            delta: 1,
            poRate: 20000,
            newUnitCost: 20000,
        },
    ]);

    assert.equal(prompts.length, 0);
});

test('buildSellingPricePrompts ignores products not in snapshot', () => {
    const snapshots = new Map();
    const prompts = buildSellingPricePrompts(snapshots, [
        {
            productId: 'p1',
            delta: 1,
            poRate: 100,
            newUnitCost: 100,
        },
    ]);
    assert.equal(prompts.length, 0);
});
