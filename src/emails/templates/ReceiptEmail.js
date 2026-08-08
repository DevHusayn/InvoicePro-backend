import React from 'react';
import { Button, Section, Text } from '@react-email/components';
import ClientEmailLayout, { createClientEmailStyles } from '../layouts/ClientEmailLayout.js';
import { buildClientEmailBranding } from '../helpers/clientEmailBranding.js';
import { formatCurrency, formatDate } from '../formatters.js';

const MONEY_EPS = 0.009;

/**
 * @param {object} props
 * @param {string} props.customerName - Receipt recipient name
 * @param {string} [props.invoiceNumber] - Related invoice number
 * @param {string} props.receiptNumber - Receipt reference number
 * @param {number|string} props.amountPaid - Amount paid so far
 * @param {number|string} [props.totalAmount] - Receipt total
 * @param {number|string} [props.balanceDue] - Remaining balance
 * @param {string} [props.currency='NGN'] - ISO currency code
 * @param {string|Date} props.paymentDate - Date payment was received
 * @param {string} [props.paymentMethod] - Optional payment method label
 * @param {string} props.businessName - Sender business name
 * @param {string} [props.receiptUrl] - Optional link to view receipt online
 * @param {object} [props.branding] - Business branding tokens
 */
export default function ReceiptEmail({
    customerName,
    invoiceNumber,
    receiptNumber,
    amountPaid,
    totalAmount,
    balanceDue,
    currency = 'NGN',
    paymentDate,
    paymentMethod,
    businessName,
    receiptUrl,
    branding,
}) {
    const brand = branding || buildClientEmailBranding(null, businessName);
    const emailStyles = createClientEmailStyles(brand);
    const greetingName = customerName?.trim() || 'there';
    const resolvedBalance =
        balanceDue != null
            ? Number(balanceDue)
            : Math.max(0, Number(totalAmount || 0) - Number(amountPaid || 0));
    const isPartial = resolvedBalance > MONEY_EPS;

    return React.createElement(
        ClientEmailLayout,
        {
            preview: isPartial
                ? `Receipt ${receiptNumber} from ${brand.businessName} — ${formatCurrency(amountPaid, currency)} received, ${formatCurrency(resolvedBalance, currency)} remaining.`
                : `Receipt ${receiptNumber} from ${brand.businessName} — ${formatCurrency(amountPaid, currency)} paid on ${formatDate(paymentDate)}.`,
            branding: brand,
        },
        React.createElement(Text, { style: emailStyles.heading }, 'Payment receipt'),
        React.createElement(
            Text,
            { style: emailStyles.paragraph },
            isPartial
                ? `Hi ${greetingName}, thank you for your payment to ${brand.businessName}. This receipt confirms the amount received so far. A balance of ${formatCurrency(resolvedBalance, currency)} remains.`
                : `Hi ${greetingName}, thank you for your payment to ${brand.businessName}. Here is your receipt for your records.`,
        ),
        React.createElement(
            Section,
            { style: emailStyles.detailBox },
            invoiceNumber
                ? React.createElement(
                    React.Fragment,
                    null,
                    React.createElement(Text, { style: emailStyles.detailLabel }, 'Invoice number'),
                    React.createElement(Text, { style: emailStyles.detailValue }, invoiceNumber),
                )
                : null,
            React.createElement(Text, { style: emailStyles.detailLabel }, 'Receipt number'),
            React.createElement(Text, { style: emailStyles.detailValue }, receiptNumber),
            isPartial && totalAmount != null
                ? React.createElement(
                    React.Fragment,
                    null,
                    React.createElement(Text, { style: emailStyles.detailLabel }, 'Receipt total'),
                    React.createElement(Text, { style: emailStyles.detailValue }, formatCurrency(totalAmount, currency)),
                )
                : null,
            React.createElement(Text, { style: emailStyles.detailLabel }, isPartial ? 'Amount received' : 'Amount paid'),
            React.createElement(Text, { style: emailStyles.detailValue }, formatCurrency(amountPaid, currency)),
            isPartial
                ? React.createElement(
                    React.Fragment,
                    null,
                    React.createElement(Text, { style: emailStyles.detailLabel }, 'Balance remaining'),
                    React.createElement(Text, { style: emailStyles.detailValue }, formatCurrency(resolvedBalance, currency)),
                )
                : null,
            React.createElement(Text, { style: emailStyles.detailLabel }, 'Payment date'),
            React.createElement(
                Text,
                { style: paymentMethod ? emailStyles.detailValue : emailStyles.detailValueLast },
                formatDate(paymentDate),
            ),
            paymentMethod
                ? React.createElement(
                    React.Fragment,
                    null,
                    React.createElement(Text, { style: { ...emailStyles.detailLabel, marginTop: '16px' } }, 'Payment method'),
                    React.createElement(Text, { style: emailStyles.detailValueLast }, paymentMethod),
                )
                : null,
        ),
        receiptUrl
            ? React.createElement(
                Section,
                { style: emailStyles.buttonSection },
                React.createElement(Button, { href: receiptUrl, style: emailStyles.button }, 'View receipt'),
            )
            : null,
        React.createElement(
            Text,
            { style: emailStyles.muted },
            isPartial
                ? 'Please keep this email for your records. Contact the business directly if you have questions about the remaining balance.'
                : 'Please keep this email for your records. If you have any questions about this payment, contact the business directly.',
        ),
    );
}
