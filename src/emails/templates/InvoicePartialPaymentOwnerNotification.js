import React from 'react';
import { Button, Section, Text } from '@react-email/components';
import EmailLayout, { emailStyles } from '../layouts/EmailLayout.js';
import { formatCurrency, formatDate } from '../formatters.js';

/**
 * Notifies the business owner that a partial payment was recorded.
 */
export default function InvoicePartialPaymentOwnerNotification({
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
    const greetingName = ownerName?.trim() || 'there';

    return React.createElement(
        EmailLayout,
        {
            preview: `Partial payment received — ${formatCurrency(paymentAmount, currency)} for invoice ${invoiceNumber}.`,
        },
        React.createElement(Text, { style: emailStyles.heading }, 'Partial payment received'),
        React.createElement(
            Text,
            { style: emailStyles.paragraph },
            `Hi ${greetingName}, ${customerName || 'Your client'} made a partial payment on invoice ${invoiceNumber}.`,
        ),
        React.createElement(
            Section,
            { style: emailStyles.detailBox },
            React.createElement(Text, { style: emailStyles.detailLabel }, 'Invoice number'),
            React.createElement(Text, { style: emailStyles.detailValue }, invoiceNumber),
            React.createElement(Text, { style: emailStyles.detailLabel }, 'Payment received'),
            React.createElement(Text, { style: emailStyles.detailValue }, formatCurrency(paymentAmount, currency)),
            React.createElement(Text, { style: emailStyles.detailLabel }, 'Total paid so far'),
            React.createElement(Text, { style: emailStyles.detailValue }, formatCurrency(amountPaid, currency)),
            React.createElement(Text, { style: emailStyles.detailLabel }, 'Balance due'),
            React.createElement(Text, { style: emailStyles.detailValue }, formatCurrency(balanceDue, currency)),
            React.createElement(Text, { style: emailStyles.detailLabel }, 'Payment date'),
            React.createElement(Text, { style: emailStyles.detailValueLast }, formatDate(paymentDate)),
            paymentMethod
                ? React.createElement(
                    React.Fragment,
                    null,
                    React.createElement(Text, { style: { ...emailStyles.detailLabel, marginTop: '16px' } }, 'Payment method'),
                    React.createElement(Text, { style: emailStyles.detailValueLast }, paymentMethod),
                )
                : null,
        ),
        React.createElement(
            Section,
            { style: emailStyles.buttonSection },
            React.createElement(Button, { href: invoiceDashboardUrl, style: emailStyles.button }, 'View invoice'),
        ),
        React.createElement(
            Text,
            { style: emailStyles.muted },
            'Your client also received a partial payment confirmation email if their email is on file.',
        ),
    );
}
