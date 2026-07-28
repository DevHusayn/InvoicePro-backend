import React from 'react';
import { Button, Section, Text } from '@react-email/components';
import ClientEmailLayout, { createClientEmailStyles } from '../layouts/ClientEmailLayout.js';
import { buildClientEmailBranding } from '../helpers/clientEmailBranding.js';
import { formatCurrency, formatDate } from '../formatters.js';

/**
 * @param {object} props
 * @param {string} props.customerName - Customer name
 * @param {string} props.invoiceNumber - Related invoice number
 * @param {number|string} props.paymentAmount - Amount received in this installment
 * @param {number|string} props.amountPaid - Total paid so far
 * @param {number|string} props.balanceDue - Remaining balance
 * @param {string} [props.currency='NGN'] - ISO currency code
 * @param {string|Date} props.paymentDate - Date of this payment
 * @param {string} [props.paymentMethod] - Optional payment method label
 * @param {string|Date} [props.dueDate] - Invoice due date
 * @param {string} props.invoiceUrl - Link to view the invoice
 * @param {string} props.businessName - Sender business name
 * @param {object} [props.branding] - Business branding tokens
 */
export default function PartialPaymentEmail({
    customerName,
    invoiceNumber,
    paymentAmount,
    amountPaid,
    balanceDue,
    currency = 'NGN',
    paymentDate,
    paymentMethod,
    dueDate,
    invoiceUrl,
    businessName,
    branding,
}) {
    const brand = branding || buildClientEmailBranding(null, businessName);
    const emailStyles = createClientEmailStyles(brand);
    const greetingName = customerName?.trim() || 'there';

    return React.createElement(
        ClientEmailLayout,
        {
            preview: `Partial payment received for invoice ${invoiceNumber} — ${formatCurrency(paymentAmount, currency)}.`,
            branding: brand,
        },
        React.createElement(Text, { style: emailStyles.heading }, 'Partial payment received'),
        React.createElement(
            Text,
            { style: emailStyles.paragraph },
            `Hi ${greetingName}, thank you — ${brand.businessName} has received your payment.`,
        ),
        React.createElement(
            Text,
            { style: emailStyles.paragraph },
            `A balance of ${formatCurrency(balanceDue, currency)} remains on this invoice.`,
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
            dueDate
                ? React.createElement(
                    React.Fragment,
                    null,
                    React.createElement(Text, { style: { ...emailStyles.detailLabel, marginTop: '16px' } }, 'Due date'),
                    React.createElement(Text, { style: emailStyles.detailValueLast }, formatDate(dueDate)),
                )
                : null,
        ),
        React.createElement(
            Section,
            { style: emailStyles.buttonSection },
            React.createElement(Button, { href: invoiceUrl, style: emailStyles.button }, 'View invoice'),
        ),
        React.createElement(
            Text,
            { style: emailStyles.muted },
            'If you have already sent the remaining balance, please disregard the outstanding amount shown above.',
        ),
    );
}
