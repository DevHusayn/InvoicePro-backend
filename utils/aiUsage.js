import AiUsage from '../models/AiUsage.js';
import { getDatePartsInTimezone } from './timezone.js';
import { aiHttpError } from './aiHttpError.js';

const DEFAULT_DAILY_DRAFT_LIMIT = 30;
const DEFAULT_USER_MONTHLY_TOKEN_LIMIT = 500_000;
const DEFAULT_GLOBAL_MONTHLY_TOKEN_BUDGET = 10_000_000;

function envInt(name, fallback) {
    const n = Number(process.env[name]);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

function periodKeys(timeZone, date = new Date()) {
    const parts = getDatePartsInTimezone(timeZone, date);
    const month = String(parts.month).padStart(2, '0');
    const day = String(parts.day).padStart(2, '0');
    return {
        dayKey: `${parts.year}-${month}-${day}`,
        monthKey: `${parts.year}-${month}`,
    };
}

async function incrementDraftCount(userId, dayKey) {
    return AiUsage.findOneAndUpdate(
        { scope: 'user', userId, periodKey: dayKey },
        { $inc: { draftCount: 1 } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
}

export async function assertAndReserveAiDraft(userId, timeZone) {
    const { dayKey, monthKey } = periodKeys(timeZone);
    const dailyLimit = envInt('AI_DAILY_DRAFT_LIMIT', DEFAULT_DAILY_DRAFT_LIMIT);
    const userMonthTokens = envInt('AI_USER_MONTHLY_TOKEN_LIMIT', DEFAULT_USER_MONTHLY_TOKEN_LIMIT);
    const globalMonthTokens = envInt('AI_GLOBAL_MONTHLY_TOKEN_BUDGET', DEFAULT_GLOBAL_MONTHLY_TOKEN_BUDGET);

    const [monthly, global] = await Promise.all([
        AiUsage.findOne({ scope: 'user', userId, periodKey: monthKey }).lean(),
        AiUsage.findOne({ scope: 'global', userId: null, periodKey: monthKey }).lean(),
    ]);

    const userTokens = (monthly?.promptTokens || 0) + (monthly?.completionTokens || 0);
    if (userTokens >= userMonthTokens) {
        throw aiHttpError('Monthly AI usage limit reached. Try again next month.', 429, 'AI_RATE_LIMIT');
    }

    const globalTokens = (global?.promptTokens || 0) + (global?.completionTokens || 0);
    if (globalTokens >= globalMonthTokens) {
        throw aiHttpError('AI drafting is temporarily unavailable.', 503, 'AI_BUDGET_EXCEEDED');
    }

    const daily = await incrementDraftCount(userId, dayKey);
    if ((daily?.draftCount || 0) > dailyLimit) {
        await AiUsage.updateOne(
            { scope: 'user', userId, periodKey: dayKey },
            { $inc: { draftCount: -1 } }
        );
        throw aiHttpError('Daily AI draft limit reached. Try again tomorrow.', 429, 'AI_RATE_LIMIT');
    }
}

export async function recordAiTokenUsage(userId, timeZone, usage = {}) {
    const { monthKey } = periodKeys(timeZone);
    const promptTokens = Number(usage.promptTokens) || 0;
    const completionTokens = Number(usage.completionTokens) || 0;
    if (promptTokens <= 0 && completionTokens <= 0) return;

    await Promise.all([
        AiUsage.findOneAndUpdate(
            { scope: 'user', userId, periodKey: monthKey },
            { $inc: { promptTokens, completionTokens } },
            { upsert: true, setDefaultsOnInsert: true }
        ),
        AiUsage.findOneAndUpdate(
            { scope: 'global', userId: null, periodKey: monthKey },
            { $inc: { promptTokens, completionTokens, draftCount: 1 } },
            { upsert: true, setDefaultsOnInsert: true }
        ),
    ]);
}
