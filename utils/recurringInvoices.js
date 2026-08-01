import Invoice from '../models/Invoice.js';
import { reserveInvoiceCreation, releaseInvoiceCreation } from './invoiceLimits.js';
import { attachPublicTokenIfNeeded } from './invoicePublicToken.js';
import { tryAutoEmailInvoice } from '../src/emails/helpers/invoiceDispatch.js';

function daysForFrequency(frequency) {
    switch (frequency) {
        case 'weekly': return 7;
        case 'bi-weekly': return 14;
        case 'monthly': return 30;
        case 'quarterly': return 90;
        case 'yearly': return 365;
        default: return 0;
    }
}

/** Generate child invoices from active recurring templates. */
export async function generateRecurringInvoices() {
    const recurringTemplates = await Invoice.find({
        isRecurring: true,
        recurringEndDate: { $ne: null },
    }).lean();

    const now = new Date();
    let createdCount = 0;

    for (const template of recurringTemplates) {
        const increment = daysForFrequency(template.recurringFrequency);
        if (!increment) continue;

        const lastInvoice = await Invoice.findOne({
            isRecurring: false,
            userId: template.userId,
            clientId: template.clientId,
            invoiceNumber: { $regex: `^${template.invoiceNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-` },
        })
            .select('date createdAt')
            .sort({ createdAt: -1 })
            .lean();

        let nextDate = new Date(template.date);
        if (lastInvoice) {
            nextDate = new Date(lastInvoice.date);
        }
        nextDate.setDate(nextDate.getDate() + increment);

        if (now < nextDate || new Date(template.recurringEndDate) < nextDate) {
            continue;
        }

        try {
            await reserveInvoiceCreation(template.userId);
        } catch (err) {
            if (err.code === 'INVOICE_LIMIT_REACHED') continue;
            throw err;
        }

        const newInvoice = new Invoice({
            ...template,
            _id: undefined,
            isRecurring: false,
            date: nextDate.toISOString().slice(0, 10),
            createdAt: new Date(),
            invoiceNumber: `${template.invoiceNumber}-${nextDate.toISOString().slice(0, 10)}`,
        });

        try {
            attachPublicTokenIfNeeded(newInvoice);
            await newInvoice.save();
            createdCount += 1;
            tryAutoEmailInvoice({ invoice: newInvoice, userId: template.userId });
        } catch (err) {
            await releaseInvoiceCreation(template.userId);
            throw err;
        }
    }

    return { createdCount };
}
