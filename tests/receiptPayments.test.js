import test from 'node:test';
import assert from 'node:assert/strict';
import {
    applyReceiptPayment,
    resolveReceiptPaymentAmount,
} from '../utils/receiptValidation.js';
import { getInvoiceBalanceDue } from '../utils/invoicePayments.js';

test('applyReceiptPayment records follow-up installment on partial receipt', () => {
    const receipt = {
        documentType: 'receipt',
        status: 'paid',
        total: 1000,
        amountPaid: 400,
        paymentMethod: 'cash',
        datePaid: '2026-07-01',
        payments: [{ amount: 400, method: 'cash', date: '2026-07-01' }],
    };

    const result = applyReceiptPayment(receipt, {
        amount: 300,
        method: 'bank_transfer',
        date: '2026-07-24',
    });

    assert.equal(result.becameFullyPaid, false);
    assert.equal(receipt.status, 'paid');
    assert.equal(receipt.amountPaid, 700);
    assert.equal(getInvoiceBalanceDue(receipt), 300);
    assert.equal(receipt.payments.length, 2);
});

test('applyReceiptPayment settles receipt when balance cleared', () => {
    const receipt = {
        documentType: 'receipt',
        status: 'paid',
        total: 1000,
        amountPaid: 600,
        paymentMethod: 'cash',
        datePaid: '2026-07-01',
        payments: [{ amount: 600, method: 'cash', date: '2026-07-01' }],
    };

    const result = applyReceiptPayment(receipt, {
        amount: 400,
        method: 'card',
        date: '2026-07-24',
    });

    assert.equal(result.becameFullyPaid, true);
    assert.equal(receipt.status, 'paid');
    assert.equal(receipt.amountPaid, 1000);
    assert.equal(getInvoiceBalanceDue(receipt), 0);
});

test('applyReceiptPayment rejects overpayment', () => {
    const receipt = {
        documentType: 'receipt',
        status: 'paid',
        total: 100,
        amountPaid: 40,
        payments: [{ amount: 40, method: 'cash', date: '2026-07-01' }],
    };

    assert.throws(
        () =>
            applyReceiptPayment(receipt, {
                amount: 70,
                method: 'cash',
                date: '2026-07-24',
            }),
        (err) => err.message.includes('exceeds')
    );
});

test('applyReceiptPayment rejects when already fully paid', () => {
    const receipt = {
        documentType: 'receipt',
        status: 'paid',
        total: 100,
        amountPaid: 100,
        payments: [{ amount: 100, method: 'cash', date: '2026-07-01' }],
    };

    assert.throws(
        () =>
            applyReceiptPayment(receipt, {
                amount: 10,
                method: 'cash',
                date: '2026-07-24',
            }),
        (err) => err.message.includes('fully paid')
    );
});

test('resolveReceiptPaymentAmount uses partial amount, including comma-formatted strings', () => {
    assert.equal(
        resolveReceiptPaymentAmount({ paidInFull: false, paymentAmount: 25000 }, 50000),
        25000
    );
    assert.equal(
        resolveReceiptPaymentAmount({ paidInFull: false, paymentAmount: '25,000' }, 50000),
        25000
    );
    assert.equal(resolveReceiptPaymentAmount({ paidInFull: true }, 50000), 50000);
});
