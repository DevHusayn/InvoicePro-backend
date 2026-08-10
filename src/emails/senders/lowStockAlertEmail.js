import React from 'react';
import { sendEmail } from '../sendEmail.js';
import LowStockAlertEmail from '../templates/LowStockAlertEmail.js';

export async function sendLowStockAlertEmail({
    to,
    ownerName,
    products,
    productsUrl,
}) {
    const count = products.length;
    const subject =
        count === 1
            ? `Low stock: ${products[0].name}`
            : `Low stock alert — ${count} products need attention`;

    const productLines = products.map(
        (product) =>
            `- ${product.name}: ${product.quantityOnHand ?? 0} on hand (alert at ${product.lowStockThreshold ?? 0} or below)`,
    );

    return sendEmail({
        to,
        subject,
        type: 'owner-low-stock',
        react: React.createElement(LowStockAlertEmail, {
            ownerName,
            products,
            productsUrl,
        }),
        text: [
            count === 1
                ? `${products[0].name} is low on stock.`
                : `${count} products are low on stock.`,
            '',
            ...productLines,
            '',
            `View products: ${productsUrl}`,
            '',
            'You receive this digest because low-stock email alerts are enabled in Settings → Notifications.',
        ].join('\n'),
    });
}
