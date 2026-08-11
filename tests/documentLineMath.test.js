import test from 'node:test';
import assert from 'node:assert/strict';
import {
    computeDocumentDiscountRatio,
    computeMarginPercent,
    roundMoney,
} from '../utils/documentLineMath.js';
import { scaleByPaidRatio } from '../utils/realizedSales.js';

test('computeDocumentDiscountRatio allocates fixed discount proportionally', () => {
    const doc = {
        discount: 100,
        items: [{ quantity: 1, rate: 1000 }],
    };
    assert.equal(computeDocumentDiscountRatio(doc, doc.items), 0.1);
});

test('scaleByPaidRatio with discount-adjusted line total matches profit math', () => {
    const lineTotal = 1000;
    const discountRatio = 0.1;
    const adjustedLineTotal = roundMoney(lineTotal * (1 - discountRatio));
    const lineCogs = 400;
    const adjustedLineProfit = roundMoney(adjustedLineTotal - lineCogs);
    const paidRatio = 0.5;

    const sale = scaleByPaidRatio(1, adjustedLineTotal, adjustedLineProfit, paidRatio);
    assert.equal(sale.lineTotal, 450);
    assert.equal(sale.lineProfit, 250);
});

test('computeMarginPercent uses one decimal place', () => {
    assert.equal(computeMarginPercent(300, 100), 33.3);
});
