import test from 'node:test';
import assert from 'node:assert/strict';
import { pickMatchingPlanCode } from '../services/paystackPlan.js';

const monthlyConfig = {
    name: 'Waraqah Premium Monthly',
    interval: 'monthly',
    amountKobo: 500000,
};

test('pickMatchingPlanCode returns the oldest matching plan', () => {
    const code = pickMatchingPlanCode(
        [
            {
                plan_code: 'PLN_newer',
                name: 'Waraqah Premium Monthly',
                amount: 500000,
                interval: 'monthly',
                currency: 'NGN',
                createdAt: '2026-08-09T12:00:00.000Z',
            },
            {
                plan_code: 'PLN_older',
                name: 'Waraqah Premium Monthly',
                amount: 500000,
                interval: 'monthly',
                currency: 'NGN',
                createdAt: '2026-08-09T10:00:00.000Z',
            },
        ],
        monthlyConfig,
    );

    assert.equal(code, 'PLN_older');
});

test('pickMatchingPlanCode ignores plans with different amount or interval', () => {
    const code = pickMatchingPlanCode(
        [
            {
                plan_code: 'PLN_wrong_amount',
                name: 'Waraqah Premium Monthly',
                amount: 200000,
                interval: 'monthly',
                currency: 'NGN',
                createdAt: '2026-08-09T10:00:00.000Z',
            },
            {
                plan_code: 'PLN_wrong_interval',
                name: 'Waraqah Premium Monthly',
                amount: 500000,
                interval: 'annually',
                currency: 'NGN',
                createdAt: '2026-08-09T10:00:00.000Z',
            },
        ],
        monthlyConfig,
    );

    assert.equal(code, null);
});

test('pickMatchingPlanCode accepts paginated Paystack responses', () => {
    const code = pickMatchingPlanCode(
        {
            data: [
                {
                    plan_code: 'PLN_paged',
                    name: 'Waraqah Premium Monthly',
                    amount: 500000,
                    interval: 'monthly',
                    currency: 'NGN',
                    createdAt: '2026-08-09T10:00:00.000Z',
                },
            ],
        },
        monthlyConfig,
    );

    assert.equal(code, 'PLN_paged');
});
