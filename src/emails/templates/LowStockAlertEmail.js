import React from 'react';
import { Button, Section, Text } from '@react-email/components';
import EmailLayout, { emailStyles } from '../layouts/EmailLayout.js';

/**
 * Daily digest when tracked products fall at or below their low-stock threshold.
 *
 * @param {object} props
 * @param {string} props.ownerName
 * @param {Array<{ name: string, quantityOnHand: number, lowStockThreshold: number }>} props.products
 * @param {string} props.productsUrl
 */
export default function LowStockAlertEmail({ ownerName, products = [], productsUrl }) {
    const greetingName = ownerName?.trim() || 'there';
    const count = products.length;
    const preview =
        count === 1
            ? `${products[0].name} is low on stock.`
            : `${count} products are low on stock.`;

    return React.createElement(
        EmailLayout,
        { preview },
        React.createElement(Text, { style: emailStyles.heading }, 'Low stock alert'),
        React.createElement(
            Text,
            { style: emailStyles.paragraph },
            count === 1
                ? `Hi ${greetingName}, one tracked product in your catalog is at or below its low-stock threshold.`
                : `Hi ${greetingName}, ${count} tracked products in your catalog are at or below their low-stock thresholds.`,
        ),
        React.createElement(
            Section,
            { style: emailStyles.detailBox },
            products.map((product, index) =>
                React.createElement(
                    React.Fragment,
                    { key: product.name + index },
                    React.createElement(Text, { style: emailStyles.detailLabel }, product.name),
                    React.createElement(
                        Text,
                        {
                            style:
                                index === products.length - 1
                                    ? emailStyles.detailValueLast
                                    : emailStyles.detailValue,
                        },
                        `${product.quantityOnHand ?? 0} on hand · alert at ${product.lowStockThreshold ?? 0} or below`,
                    ),
                ),
            ),
        ),
        React.createElement(
            Section,
            { style: emailStyles.buttonSection },
            React.createElement(Button, { href: productsUrl, style: emailStyles.button }, 'View products'),
        ),
        React.createElement(
            Text,
            { style: emailStyles.muted },
            'You receive this digest because low-stock email alerts are enabled in Settings → Notifications. '
            + 'We send at most one summary per day while products remain low.',
        ),
    );
}
