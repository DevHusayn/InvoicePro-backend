import test from 'node:test';
import assert from 'node:assert/strict';
import {
    computePeriodExpensesFromRecords,
    mergeExpensesIntoProfitSummary,
} from '../utils/expenseAnalytics.js';
import { buildProfitSummaryFromDocs } from '../utils/profitAnalytics.js';

test('computePeriodExpensesFromRecords filters by calendar month', () => {
    const expenses = [
        { date: '2026-08-05', amount: 1000, category: 'rent' },
        { date: '2026-08-20', amount: 500, category: 'transport' },
        { date: '2026-07-31', amount: 200, category: 'utilities' },
    ];

    const august = computePeriodExpensesFromRecords(expenses, 2026, 8, 'Africa/Lagos');
    assert.equal(august.totalExpenses, 1500);
    assert.equal(august.byCategory.length, 2);
    assert.equal(august.byCategory[0].category, 'rent');
    assert.equal(august.byCategory[0].amount, 1000);
});

test('mergeExpensesIntoProfitSummary computes net profit and trend', () => {
    const profitSummary = buildProfitSummaryFromDocs(
        [
            {
                status: 'paid',
                date: '2026-08-10',
                total: 1000,
                amountPaid: 1000,
                discount: 0,
                items: [
                    {
                        productId: 'p1',
                        quantity: 1,
                        rate: 1000,
                        unitCost: 400,
                    },
                ],
            },
        ],
        { year: 2026, month: 8, timeZone: 'Africa/Lagos' }
    );

    const merged = mergeExpensesIntoProfitSummary(profitSummary, {
        currentExpenseTotals: { totalExpenses: 200 },
        previousExpenseTotals: { totalExpenses: 100, grossProfit: 500 },
        expenseTrend: [{ year: 2026, month: 8, totalExpenses: 200 }],
        byCategory: [{ category: 'rent', label: 'Rent', amount: 200, sharePercent: 100 }],
    });

    assert.equal(merged.totals.grossProfit, 600);
    assert.equal(merged.totals.totalExpenses, 200);
    assert.equal(merged.totals.netProfit, 400);
    assert.equal(merged.byExpenseCategory.length, 1);
    const augustPoint = merged.trend.find((point) => point.year === 2026 && point.month === 8);
    assert.ok(augustPoint);
    assert.equal(augustPoint.netProfit, 400);
    assert.equal(augustPoint.totalExpenses, 200);
});

test('mergeExpensesIntoProfitSummary handles zero expenses', () => {
    const profitSummary = buildProfitSummaryFromDocs([], {
        year: 2026,
        month: 8,
        timeZone: 'Africa/Lagos',
    });

    const merged = mergeExpensesIntoProfitSummary(profitSummary, {
        currentExpenseTotals: { totalExpenses: 0 },
        previousExpenseTotals: { totalExpenses: 0, grossProfit: 0 },
        expenseTrend: [],
        byCategory: [],
    });

    assert.equal(merged.totals.netProfit, 0);
    assert.equal(merged.totals.totalExpenses, 0);
});
