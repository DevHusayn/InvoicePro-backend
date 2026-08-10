import React from 'react';
import {
    Body,
    Container,
    Head,
    Hr,
    Html,
    Img,
    Link,
    Preview,
    Section,
    Text,
} from '@react-email/components';
import { BRAND, getCopyrightYear, getLogoIconUrl, getSupportEmail, getWebsiteUrl } from '../config.js';
import { EMAIL_LAYOUT_CLASSES, ResponsiveEmailStyles } from './responsiveEmailStyles.js';

const BODONI_MODA_STYLESHEET =
    'https://fonts.googleapis.com/css2?family=Bodoni+Moda:opsz,wght@6..96,600&display=swap';

/**
 * Shared layout for all Waraqah transactional emails.
 *
 * @param {object} props
 * @param {string} props.preview - Inbox preview text
 * @param {React.ReactNode} props.children - Email body content
 */
export default function EmailLayout({ preview, children }) {
    const websiteUrl = getWebsiteUrl();
    const supportEmail = getSupportEmail();
    const year = getCopyrightYear();
    const logoIconUrl = getLogoIconUrl();

    return React.createElement(
        Html,
        null,
        React.createElement(
            Head,
            null,
            React.createElement('link', {
                rel: 'stylesheet',
                href: BODONI_MODA_STYLESHEET,
            }),
            React.createElement(ResponsiveEmailStyles),
        ),
        preview ? React.createElement(Preview, null, preview) : null,
        React.createElement(
            Body,
            { style: styles.body, className: EMAIL_LAYOUT_CLASSES.body },
            React.createElement(
                Container,
                { style: styles.container, className: EMAIL_LAYOUT_CLASSES.container },
                React.createElement(
                    Section,
                    { style: styles.header, className: EMAIL_LAYOUT_CLASSES.header },
                    React.createElement(
                        Link,
                        { href: websiteUrl, style: styles.logoLink },
                        React.createElement(
                            'table',
                            {
                                role: 'presentation',
                                cellPadding: 0,
                                cellSpacing: 0,
                                style: styles.logoTable,
                            },
                            React.createElement(
                                'tbody',
                                null,
                                React.createElement(
                                    'tr',
                                    null,
                                    React.createElement(
                                        'td',
                                        { style: styles.logoIconCell },
                                        React.createElement(Img, {
                                            src: logoIconUrl,
                                            alt: '',
                                            width: 36,
                                            height: 36,
                                            style: styles.logoIcon,
                                        }),
                                    ),
                                    React.createElement(
                                        'td',
                                        { style: styles.logoTextCell },
                                        React.createElement(Text, { style: styles.logoText }, BRAND.name),
                                    ),
                                ),
                            ),
                        ),
                    ),
                ),
                React.createElement(
                    Section,
                    { style: styles.content, className: EMAIL_LAYOUT_CLASSES.content },
                    children,
                ),
                React.createElement(Hr, { style: styles.divider }),
                React.createElement(
                    Section,
                    { style: styles.footer, className: EMAIL_LAYOUT_CLASSES.footer },
                    React.createElement(
                        Text,
                        { style: styles.footerText },
                        `© ${year} ${BRAND.name}. All rights reserved.`,
                    ),
                    React.createElement(
                        Text,
                        { style: styles.footerText },
                        React.createElement(Link, { href: websiteUrl, style: styles.footerLink }, websiteUrl.replace(/^https?:\/\//, '')),
                        ' · ',
                        'Need help? ',
                        React.createElement(
                            Link,
                            { href: `mailto:${supportEmail}`, style: styles.footerLink },
                            supportEmail,
                        ),
                    ),
                    React.createElement(
                        Text,
                        { style: styles.footerMuted },
                        'You received this email because of activity on your Waraqah account.',
                    ),
                ),
            ),
        ),
    );
}

export const emailStyles = {
    heading: {
        margin: '0 0 12px',
        fontSize: '24px',
        fontWeight: 700,
        color: BRAND.text,
        lineHeight: '1.3',
    },
    paragraph: {
        margin: '0 0 16px',
        fontSize: '15px',
        lineHeight: '1.6',
        color: BRAND.textMuted,
    },
    muted: {
        margin: '0 0 16px',
        fontSize: '13px',
        lineHeight: '1.5',
        color: BRAND.textLight,
    },
    button: {
        backgroundColor: BRAND.accent,
        borderRadius: '10px',
        color: BRAND.surface,
        display: 'inline-block',
        fontSize: '15px',
        fontWeight: 600,
        lineHeight: '1',
        padding: '14px 28px',
        textDecoration: 'none',
        textAlign: 'center',
    },
    buttonSection: {
        margin: '24px 0',
        textAlign: 'center',
    },
    detailBox: {
        backgroundColor: BRAND.background,
        border: `1px solid ${BRAND.border}`,
        borderRadius: '12px',
        margin: '24px 0',
        padding: '20px 24px',
    },
    detailLabel: {
        margin: '0 0 4px',
        fontSize: '12px',
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: BRAND.textLight,
    },
    detailValue: {
        margin: '0 0 16px',
        fontSize: '16px',
        fontWeight: 600,
        color: BRAND.text,
    },
    detailValueLast: {
        margin: 0,
        fontSize: '16px',
        fontWeight: 600,
        color: BRAND.text,
    },
    link: {
        color: BRAND.accentDark,
        textDecoration: 'underline',
        wordBreak: 'break-all',
    },
};

const styles = {
    body: {
        backgroundColor: BRAND.background,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        margin: 0,
        padding: '32px 16px',
    },
    container: {
        backgroundColor: BRAND.surface,
        border: `1px solid ${BRAND.border}`,
        borderRadius: '16px',
        margin: '0 auto',
        maxWidth: '560px',
        overflow: 'hidden',
    },
    header: {
        backgroundColor: BRAND.accentLight,
        borderBottom: `3px solid ${BRAND.accent}`,
        padding: '24px 32px',
        textAlign: 'center',
    },
    logoLink: {
        display: 'inline-block',
        textDecoration: 'none',
    },
    logoTable: {
        margin: '0 auto',
        borderCollapse: 'collapse',
    },
    logoIconCell: {
        verticalAlign: 'middle',
        padding: 0,
    },
    logoTextCell: {
        verticalAlign: 'middle',
        padding: '0 0 0 4px',
    },
    logoIcon: {
        display: 'block',
        border: 0,
        outline: 'none',
    },
    /** Matches in-app WaraqahWordmark: Bodoni Moda, semibold, brand-hover, no italic. */
    logoText: {
        margin: 0,
        fontFamily: '"Bodoni Moda", Georgia, serif',
        fontSize: '22px',
        fontWeight: 600,
        fontStyle: 'normal',
        letterSpacing: '-0.025em',
        lineHeight: 1,
        color: BRAND.accentDark,
    },
    content: {
        padding: '32px',
    },
    divider: {
        borderColor: BRAND.border,
        margin: 0,
    },
    footer: {
        padding: '24px 32px',
    },
    footerText: {
        margin: '0 0 8px',
        fontSize: '13px',
        lineHeight: '1.5',
        color: BRAND.textMuted,
        textAlign: 'center',
    },
    footerMuted: {
        margin: '12px 0 0',
        fontSize: '12px',
        lineHeight: '1.5',
        color: BRAND.textLight,
        textAlign: 'center',
    },
    footerLink: {
        color: BRAND.accentDark,
        textDecoration: 'none',
    },
};
