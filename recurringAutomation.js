// In-app recurring invoice automation using node-cron (local/dev only).
import cron from 'node-cron';
import { generateRecurringInvoices } from './utils/recurringInvoices.js';

cron.schedule('0 2 * * *', async () => {
    try {
        const { createdCount } = await generateRecurringInvoices();
        console.log(`Recurring invoice automation ran. Created ${createdCount} invoices.`);
    } catch (err) {
        console.error('Recurring invoice automation error:', err);
    }
});
