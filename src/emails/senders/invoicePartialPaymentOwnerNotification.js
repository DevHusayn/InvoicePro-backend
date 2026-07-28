import React from 'react';
import { sendEmail } from '../sendEmail.js';
import InvoicePartialPaymentOwnerNotification from '../templates/InvoicePartialPaymentOwnerNotification.js';
import { formatCurrency, formatDate } from '../formatters.js';

export async function sendInvoicePartialPaymentOwnerNotification({
    to,
    ownerName,
    customerName,
    invoiceNumber,
    paymentAmount,
    amountPaid,
    balanceDue,
    currency = 'NGN',
    paymentDate,
    paymentMethod,
    invoiceDashboardUrl,
}) {
    return sendEmail({
        to,
        subject: `Partial payment received — Invoice ${invoiceNumber}`,
        type: 'owner-partial-payment',
        react: React.createElement(InvoicePartialPaymentOwnerNotification, {
            ownerName,
            customerName,
            invoiceNumber,
            paymentAmount,
            amountPaid,
            balanceDue,
            currency,
            paymentDate,
            paymentMethod,
            invoiceDashboardUrl,
        }),
        text: [
            `Partial payment received for invoice ${invoiceNumber}`,
            '',
            `Client: ${customerName || 'Client'}`,
            `Payment received: ${formatCurrency(paymentAmount, currency)}`,
            `Total paid so far: ${formatCurrency(amountPaid, currency)}`,
            `Balance due: ${formatCurrency(balanceDue, currency)}`,
            `Payment date: ${formatDate(paymentDate)}`,
            paymentMethod ? `Payment method: ${paymentMethod}` : null,
            `\nView invoice: ${invoiceDashboardUrl}`,
        ].filter(Boolean).join('\n'),
    });
}
