// In-app recurring automation using node-cron (local/dev only).
import cron from 'node-cron';
import { generateRecurringInvoices } from './utils/recurringInvoices.js';
import { generateRecurringExpenses } from './utils/recurringExpenses.js';

cron.schedule('0 2 * * *', async () => {
    try {
        const invoices = await generateRecurringInvoices();
        const expenses = await generateRecurringExpenses();
        console.log(
            `Recurring automation ran. Created ${invoices.createdCount} invoices and ${expenses.createdCount} expenses.`
        );
    } catch (err) {
        console.error('Recurring automation error:', err);
    }
});
