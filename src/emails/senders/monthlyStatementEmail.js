import React from 'react';
import { sendEmail } from '../sendEmail.js';
import MonthlyStatementEmail from '../templates/MonthlyStatementEmail.js';
import { formatCurrency } from '../formatters.js';

export async function sendMonthlyStatementEmail({
    to,
    ownerName,
    periodLabel,
    totals,
    statementsUrl,
    pdfBuffer,
    pdfFilename,
}) {
    return sendEmail({
        to,
        subject: `Your ${periodLabel} billing statement`,
        type: 'monthly-statement',
        react: React.createElement(MonthlyStatementEmail, {
            ownerName,
            periodLabel,
            totals,
            statementsUrl,
        }),
        text: [
            `Your ${periodLabel} billing statement is attached.`,
            '',
            `Total billed: ${formatCurrency(totals.total, 'NGN')}`,
            `Documents in period: ${totals.documentCount}`,
            '',
            `View in Waraqah: ${statementsUrl}`,
            '',
            'You receive this email because monthly statement delivery is enabled in Settings → Notifications.',
        ].join('\n'),
        attachments: [
            {
                filename: pdfFilename,
                content: pdfBuffer,
            },
        ],
    });
}
