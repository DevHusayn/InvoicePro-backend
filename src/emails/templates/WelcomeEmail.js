import React from 'react';
import { Button, Img, Link, Section, Text } from '@react-email/components';
import EmailLayout, { emailStyles } from '../layouts/EmailLayout.js';
import { BRAND, getSupportEmail } from '../config.js';

const TWEMOJI_CDN = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72';

const WELCOME_STEPS = [
    {
        emojiCode: '1f3e2',
        emojiLabel: 'Business',
        title: 'Set up your business',
        text: 'Add your profile, bank details, and brand color in Settings. This is what makes every PDF and client email feel like your business, not a generic template.',
    },
    {
        emojiCode: '1f4e6',
        emojiLabel: 'Product catalog',
        title: 'Build your product catalog & track inventory',
        text: 'Add the products and services you sell. Turn on inventory tracking to see what’s on hand, set low-stock thresholds, and get email alerts before you run out, so sales and stock stay in sync.',
    },
    {
        emojiCode: '1f465',
        emojiLabel: 'Clients',
        title: 'Save clients once, reuse forever',
        text: 'Store your clients in one place. Their details flow straight into quotations, invoices, and receipts. No retyping, no scattered contact lists.',
    },
    {
        emojiCode: '1f4c4',
        emojiLabel: 'Sales documents',
        title: 'Run sales from quote to payment',
        text: 'Send a professional quotation, convert it to an invoice when the work is agreed, then issue a receipt when payment comes in, including partial payments and instalments.',
    },
    {
        emojiCode: '1f4ca',
        emojiLabel: 'Dashboard',
        title: 'Send, track, and stay on top of your business',
        text: 'Email documents to clients, follow up on outstanding balances, and use your dashboard to see what’s paid, pending, or overdue, on your phone or laptop.',
    },
];

function StepEmoji({ code, label }) {
    return React.createElement(Img, {
        src: `${TWEMOJI_CDN}/${code}.png`,
        alt: label,
        width: 20,
        height: 20,
        style: {
            display: 'block',
            border: 0,
            outline: 'none',
        },
    });
}

function StepTitle({ index, step }) {
    return React.createElement(
        'table',
        {
            role: 'presentation',
            cellPadding: 0,
            cellSpacing: 0,
            style: styles.stepTitleTable,
        },
        React.createElement(
            'tbody',
            null,
            React.createElement(
                'tr',
                null,
                React.createElement(
                    'td',
                    { style: styles.stepEmojiCell },
                    React.createElement(StepEmoji, { code: step.emojiCode, label: step.emojiLabel }),
                ),
                React.createElement(
                    'td',
                    { style: styles.stepTitleCell },
                    React.createElement(
                        Text,
                        { style: styles.stepTitle },
                        `${index + 1}. ${step.title}`,
                    ),
                ),
            ),
        ),
    );
}

const styles = {
    greeting: {
        margin: '0 0 20px',
        fontSize: '17px',
        lineHeight: '1.5',
        color: BRAND.text,
    },
    paragraph: {
        margin: '0 0 16px',
        fontSize: '15px',
        lineHeight: '1.65',
        color: BRAND.textMuted,
    },
    paragraphLast: {
        margin: '0 0 24px',
        fontSize: '15px',
        lineHeight: '1.65',
        color: BRAND.textMuted,
    },
    stepsHeading: {
        margin: '8px 0 16px',
        fontSize: '16px',
        fontWeight: 600,
        lineHeight: '1.4',
        color: BRAND.text,
    },
    stepsSection: {
        margin: '0 0 24px',
    },
    stepCard: {
        backgroundColor: BRAND.background,
        border: `1px solid ${BRAND.border}`,
        borderRadius: '12px',
        margin: '0 0 10px',
        padding: '16px 18px',
    },
    stepTitleTable: {
        borderCollapse: 'collapse',
        margin: '0 0 6px',
    },
    stepEmojiCell: {
        verticalAlign: 'middle',
        padding: '0 10px 0 0',
        width: '30px',
    },
    stepTitleCell: {
        verticalAlign: 'middle',
        padding: 0,
    },
    stepTitle: {
        margin: 0,
        fontSize: '15px',
        fontWeight: 600,
        lineHeight: '1.4',
        color: BRAND.text,
    },
    stepText: {
        margin: 0,
        fontSize: '14px',
        lineHeight: '1.55',
        color: BRAND.textMuted,
    },
    highlight: {
        margin: '0 0 20px',
        fontSize: '15px',
        lineHeight: '1.65',
        color: BRAND.textMuted,
    },
    highlightStrong: {
        color: BRAND.text,
        fontWeight: 600,
    },
    ctaLead: {
        margin: '0 0 20px',
        fontSize: '15px',
        lineHeight: '1.65',
        color: BRAND.textMuted,
    },
    closing: {
        margin: '24px 0 0',
        fontSize: '15px',
        lineHeight: '1.65',
        color: BRAND.textMuted,
    },
    supportLine: {
        margin: '0 0 8px',
        fontSize: '14px',
        lineHeight: '1.6',
        color: BRAND.textLight,
    },
    signOff: {
        margin: '0 0 24px',
        fontSize: '15px',
        lineHeight: '1.65',
        color: BRAND.textMuted,
    },
    signatureBlock: {
        marginTop: '4px',
        paddingTop: '24px',
        borderTop: `1px solid ${BRAND.border}`,
    },
    signatureWarm: {
        margin: '0 0 16px',
        fontSize: '15px',
        lineHeight: '1.5',
        color: BRAND.textMuted,
    },
    signatureName: {
        margin: '0 0 4px',
        fontSize: '16px',
        fontWeight: 600,
        lineHeight: '1.4',
        color: BRAND.text,
    },
    signatureTitle: {
        margin: 0,
        fontSize: '14px',
        lineHeight: '1.5',
        color: BRAND.textLight,
    },
};

/**
 * Personalized founder welcome email for new signups.
 *
 * @param {object} props
 * @param {string} props.userName - Recipient display name
 * @param {string} props.dashboardUrl - Link to the Waraqah dashboard
 */
export default function WelcomeEmail({ userName, dashboardUrl }) {
    const greetingName = userName?.trim() || 'there';
    const supportEmail = getSupportEmail();

    return React.createElement(
        EmailLayout,
        {
            preview: `Hi ${greetingName}, a note from the founder of ${BRAND.name}`,
        },
        React.createElement(
            Text,
            { style: styles.greeting },
            `Hi ${greetingName},`,
        ),
        React.createElement(
            Text,
            { style: styles.paragraph },
            'I\'m ',
            React.createElement('strong', null, 'Husayn Mubarak'),
            `, founder and CEO of ${BRAND.name}, and I wanted to personally welcome you.`,
        ),
        React.createElement(
            Text,
            { style: styles.paragraph },
            'Thank you for signing up. That means a lot to us.',
        ),
        React.createElement(
            Text,
            { style: styles.paragraph },
            'I built Waraqah because running a business shouldn’t mean juggling invoices in one app, stock counts in another, and client details in your head. You deserve one workspace for sales, clients, inventory, and payments, without the chaos.',
        ),
        React.createElement(
            Text,
            { style: styles.paragraphLast },
            `That’s what ${BRAND.name} is: a business management workspace for sales, clients, products, and payments, not just another regular app.`,
        ),
        React.createElement(
            Text,
            { style: styles.stepsHeading },
            `Here’s how to get value from ${BRAND.name} right away:`,
        ),
        React.createElement(
            Section,
            { style: styles.stepsSection },
            WELCOME_STEPS.map((step, index) =>
                React.createElement(
                    Section,
                    { key: step.title, style: styles.stepCard },
                    React.createElement(StepTitle, { index, step }),
                    React.createElement(Text, { style: styles.stepText }, step.text),
                ),
            ),
        ),
        React.createElement(
            Text,
            { style: styles.highlight },
            `That’s the system we built ${BRAND.name} around: `,
            React.createElement(
                'span',
                { style: styles.highlightStrong },
                'one place to manage how you sell, who you sell to, what you have in stock, and what’s been paid.',
            ),
        ),
        React.createElement(
            Text,
            { style: styles.ctaLead },
            'Your workspace is ready. Open your dashboard today, add your first product, and send your first quotation or invoice. Most people are up and running in just a few minutes.',
        ),
        React.createElement(
            Section,
            { style: emailStyles.buttonSection },
            React.createElement(Button, { href: dashboardUrl, style: emailStyles.button }, 'Go to your dashboard'),
        ),
        React.createElement(
            Text,
            { style: styles.supportLine },
            'If anything feels unclear, reply to this email or reach out to our team at ',
            React.createElement(Link, { href: `mailto:${supportEmail}`, style: emailStyles.link }, supportEmail),
            '. We read every message.',
        ),
        React.createElement(Text, { style: styles.signOff }, 'Glad you’re here.'),
        React.createElement(
            Section,
            { style: styles.signatureBlock },
            React.createElement(Text, { style: styles.signatureWarm }, 'Warm regards,'),
            React.createElement(Text, { style: styles.signatureName }, 'Husayn Mubarak A.'),
            React.createElement(Text, { style: styles.signatureTitle }, `Founder & CEO, ${BRAND.name}`),
        ),
    );
}
