import React from 'react';

/** Standard breakpoint for mobile email layouts (matches common 600px email width). */
export const EMAIL_MOBILE_BREAKPOINT = '600px';

/** Shared class names for responsive overrides in both email layouts. */
export const EMAIL_LAYOUT_CLASSES = {
    body: 'waraqah-email-body',
    container: 'waraqah-email-container',
    header: 'waraqah-email-header',
    content: 'waraqah-email-content',
    footer: 'waraqah-email-footer',
};

const RESPONSIVE_EMAIL_CSS = `
@media only screen and (max-width: ${EMAIL_MOBILE_BREAKPOINT}) {
    .${EMAIL_LAYOUT_CLASSES.body} {
        padding: 0 !important;
    }
    .${EMAIL_LAYOUT_CLASSES.container} {
        width: 100% !important;
        max-width: 100% !important;
        margin: 0 !important;
        border-radius: 0 !important;
        border-left: none !important;
        border-right: none !important;
    }
    .${EMAIL_LAYOUT_CLASSES.header},
    .${EMAIL_LAYOUT_CLASSES.content},
    .${EMAIL_LAYOUT_CLASSES.footer} {
        padding-left: 20px !important;
        padding-right: 20px !important;
    }
}
`;

/** Injected into <Head> so mobile clients can expand the layout to full viewport width. */
export function ResponsiveEmailStyles() {
    return React.createElement('style', {
        dangerouslySetInnerHTML: { __html: RESPONSIVE_EMAIL_CSS },
    });
}
