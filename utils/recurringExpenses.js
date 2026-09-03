import Expense from '../models/Expense.js';
import { getBusinessTimezone } from './timezone.js';
import {
    addFrequency,
    shouldGenerateRecurrence,
} from './recurrence.js';
import { todayInTimezone } from './recurringInvoices.js';

export function buildRecurringExpenseChildPayload(template) {
    return {
        userId: template.userId,
        date: template.recurringNextDate,
        amount: template.amount,
        category: template.category,
        description: template.description || '',
        vendor: template.vendor || '',
        isRecurring: false,
        recurringFrequency: undefined,
        recurringEndDate: null,
        recurringNextDate: null,
        recurringSourceId: template._id,
    };
}

/** Generate child expenses from active recurring templates. */
export async function generateRecurringExpenses(now = new Date()) {
    const templates = await Expense.find({
        isRecurring: true,
        recurringNextDate: { $ne: null },
    }).lean();

    let createdCount = 0;
    const timezoneCache = new Map();

    for (const template of templates) {
        const userKey = String(template.userId);
        if (!timezoneCache.has(userKey)) {
            timezoneCache.set(userKey, await getBusinessTimezone(template.userId));
        }
        const today = todayInTimezone(timezoneCache.get(userKey), now);

        if (!shouldGenerateRecurrence({
            nextDate: template.recurringNextDate,
            endDate: template.recurringEndDate,
            today,
        })) {
            continue;
        }

        try {
            await Expense.create(buildRecurringExpenseChildPayload(template));
            createdCount += 1;

            const advanced = addFrequency(template.recurringNextDate, template.recurringFrequency);
            const ended = Boolean(
                template.recurringEndDate
                && advanced
                && advanced > template.recurringEndDate
            );
            await Expense.updateOne(
                { _id: template._id },
                ended
                    ? {
                        $set: { isRecurring: false, recurringNextDate: null },
                        $unset: { recurringFrequency: 1 },
                    }
                    : { $set: { recurringNextDate: advanced } }
            );
        } catch (err) {
            console.error('[Recurring expenses] Failed to generate from', template._id, err);
        }
    }

    return { createdCount };
}
