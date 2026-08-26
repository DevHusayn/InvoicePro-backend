import { aiHttpError } from './aiHttpError.js';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';
const REQUEST_TIMEOUT_MS = 25000;

export function getAiConfig() {
    const apiKey = String(process.env.AI_API_KEY || '').trim();
    return {
        apiKey,
        baseUrl: String(process.env.AI_API_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/$/, ''),
        model: String(process.env.AI_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL,
        configured: Boolean(apiKey),
    };
}

export async function completeJson({ system, user, maxTokens = 1200 } = {}) {
    const config = getAiConfig();
    if (!config.configured) {
        throw aiHttpError(
            'AI drafting is not configured yet. You can still fill the form yourself.',
            503,
            'AI_NOT_CONFIGURED'
        );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const res = await fetch(`${config.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: config.model,
                temperature: 0.1,
                max_tokens: maxTokens,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: system },
                    { role: 'user', content: user },
                ],
            }),
            signal: controller.signal,
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw aiHttpError(
                'Could not draft the document right now. Try again in a moment.',
                502,
                'AI_PROVIDER_ERROR'
            );
        }

        return {
            text: String(data?.choices?.[0]?.message?.content || ''),
            usage: {
                promptTokens: Number(data?.usage?.prompt_tokens) || 0,
                completionTokens: Number(data?.usage?.completion_tokens) || 0,
            },
        };
    } catch (err) {
        if (err?.code === 'AI_NOT_CONFIGURED' || err?.code === 'AI_PROVIDER_ERROR') throw err;
        throw aiHttpError(
            'Could not draft the document right now. Try again in a moment.',
            502,
            'AI_PROVIDER_ERROR'
        );
    } finally {
        clearTimeout(timer);
    }
}
