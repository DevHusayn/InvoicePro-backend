import { sanitizeNumber, sanitizePlainText } from './sanitize.js';
import { aiHttpError } from './aiHttpError.js';

export const AI_MAX_PROMPT_LENGTH = 2000;
export const AI_MAX_CATALOG_CLIENTS = 80;
export const AI_MAX_CATALOG_PRODUCTS = 80;
export const AI_MAX_ITEMS = 40;
export const AI_DOCUMENT_TYPES = new Set(['invoice', 'quotation']);

const DEFAULT_UNIT = 'Qty';

export function normalizeAiPrompt(value) {
    const prompt = sanitizePlainText(value, AI_MAX_PROMPT_LENGTH);
    if (!prompt) {
        throw aiHttpError('Describe the job to draft a document.', 400, 'AI_PROMPT_REQUIRED');
    }
    return prompt;
}

export function normalizeAiDocumentType(value) {
    const type = sanitizePlainText(value, 20).toLowerCase();
    if (!AI_DOCUMENT_TYPES.has(type)) {
        throw aiHttpError('AI drafting is only available for invoices and quotations.', 400, 'AI_UNSUPPORTED_TYPE');
    }
    return type;
}

function truncate(value, maxLen) {
    return sanitizePlainText(value, maxLen);
}

export function sliceCatalog({ clients = [], products = [] } = {}) {
    return {
        clients: (Array.isArray(clients) ? clients : []).slice(0, AI_MAX_CATALOG_CLIENTS).map((client) => ({
            id: String(client._id || client.id || ''),
            name: truncate(client.name, 80),
            company: truncate(client.company, 80),
        })),
        products: (Array.isArray(products) ? products : []).slice(0, AI_MAX_CATALOG_PRODUCTS).map((product) => ({
            id: String(product._id || product.id || ''),
            name: truncate(product.name, 80),
            unitPrice: sanitizeNumber(product.unitPrice, { min: 0, max: 1_000_000_000, fallback: 0 }),
            stock: product.trackInventory
                ? sanitizeNumber(product.quantityOnHand, { min: 0, max: 1_000_000, fallback: 0 })
                : null,
        })),
    };
}

export function normalizeMatchText(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function scoreName(query, candidate) {
    const q = normalizeMatchText(query);
    const c = normalizeMatchText(candidate);
    if (!q || !c) return -1;
    if (q === c) return 0;
    if (c.startsWith(q) || q.startsWith(c)) return 1;
    if (c.includes(q) || q.includes(c)) return 2;

    const qTokens = q.split(' ').filter((token) => token.length > 2);
    const cTokens = c.split(' ').filter((token) => token.length > 2);
    if (qTokens.length === 0 || cTokens.length === 0) return -1;
    const cSet = new Set(cTokens);
    const overlap = qTokens.filter((token) => cSet.has(token)).length;
    if (overlap === 0) return -1;
    if (overlap / Math.max(qTokens.length, cTokens.length) >= 0.5) return 3;
    return -1;
}

export function matchCatalogClient(query, clients, preferredId) {
    const list = Array.isArray(clients) ? clients : [];
    if (preferredId) {
        const byId = list.find((client) => client.id === String(preferredId));
        if (byId && (!query || scoreName(query, byId.name) >= 0 || scoreName(query, byId.company) >= 0)) {
            return byId;
        }
    }
    const name = String(query || '').trim();
    if (!name) return null;

    let best = null;
    let bestScore = -1;
    for (const client of list) {
        const score = Math.min(
            scoreName(name, client.name),
            99
        );
        const companyScore = scoreName(name, client.company);
        const combined = [score, companyScore].filter((value) => value >= 0);
        if (combined.length === 0) continue;
        const nextScore = Math.min(...combined);
        if (bestScore < 0 || nextScore < bestScore) {
            best = client;
            bestScore = nextScore;
        }
    }
    return best;
}

export function matchCatalogProduct(query, products, preferredId) {
    const list = Array.isArray(products) ? products : [];
    if (preferredId) {
        const byId = list.find((product) => product.id === String(preferredId));
        if (byId && (!query || scoreName(query, byId.name) >= 0)) return byId;
    }
    const name = String(query || '').trim();
    if (!name) return null;

    let best = null;
    let bestScore = -1;
    for (const product of list) {
        const nextScore = scoreName(name, product.name);
        if (nextScore < 0) continue;
        if (bestScore < 0 || nextScore < bestScore) {
            best = product;
            bestScore = nextScore;
        }
    }
    return best;
}

export function parseModelJson(text) {
    const raw = String(text || '').trim();
    if (!raw) {
        throw aiHttpError('Could not understand that description. Try again with item names and quantities.', 422, 'AI_DRAFT_INVALID');
    }
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = (fenced ? fenced[1] : raw).trim();
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start < 0 || end <= start) {
        throw aiHttpError('Could not understand that description. Try again with item names and quantities.', 422, 'AI_DRAFT_INVALID');
    }
    try {
        const parsed = JSON.parse(candidate.slice(start, end + 1));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('not object');
        }
        return parsed;
    } catch {
        throw aiHttpError('Could not understand that description. Try again with item names and quantities.', 422, 'AI_DRAFT_INVALID');
    }
}

export function rateAppearsStatedInPrompt(prompt, rate) {
    const n = Number(rate);
    if (!Number.isFinite(n) || n < 0) return false;
    const text = String(prompt || '');
    const formatted = Number.isInteger(n) ? String(n) : String(n);
    if (!text.includes(formatted)) return false;
    if (n >= 50) return true;
    const escaped = formatted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:at|for|@|ngn|naira|₦)\\s*${escaped}\\b`, 'i').test(text);
}

function rawItemsFromModel(parsed) {
    if (Array.isArray(parsed.items)) return parsed.items;
    if (Array.isArray(parsed.lineItems)) return parsed.lineItems;
    return [];
}

export function buildAiDraftFromModelOutput({
    parsed,
    prompt,
    documentType,
    catalog,
    sourceClients = [],
} = {}) {
    const type = normalizeAiDocumentType(documentType);
    const itemsIn = rawItemsFromModel(parsed).slice(0, AI_MAX_ITEMS);
    if (itemsIn.length === 0) {
        throw aiHttpError('Describe at least one item to draft.', 422, 'AI_DRAFT_EMPTY');
    }

    const products = catalog?.products || [];
    const clients = catalog?.clients || [];
    const warnings = [];

    const items = itemsIn.map((item, index) => {
        if (!item || typeof item !== 'object') {
            throw aiHttpError('Describe at least one item to draft.', 422, 'AI_DRAFT_EMPTY');
        }
        const description = sanitizePlainText(item.description || item.name, 500);
        if (!description) {
            throw aiHttpError(`Line item ${index + 1} needs a description.`, 422, 'AI_DRAFT_INVALID');
        }
        const quantity = sanitizeNumber(item.quantity ?? item.qty, {
            min: 0.01,
            max: 1_000_000,
            fallback: 1,
        });
        const unit = sanitizePlainText(item.unit, 40) || DEFAULT_UNIT;
        const preferredId = item.catalogProductId || item.productId || null;
        const matched = matchCatalogProduct(description, products, preferredId);
        const modelRate = item.rate == null || item.rate === '' ? null : Number(item.rate);
        const stated = rateAppearsStatedInPrompt(prompt, modelRate);

        let rate = 0;
        let isNewItem = !matched;
        if (stated && Number.isFinite(modelRate)) {
            rate = sanitizeNumber(modelRate, { min: 0, max: 1_000_000_000, fallback: 0 });
        } else if (matched) {
            rate = sanitizeNumber(matched.unitPrice, { min: 0, max: 1_000_000_000, fallback: 0 });
        } else {
            rate = 0;
            warnings.push(`${description}: new item — review price`);
        }

        if (matched && !stated && matched.unitPrice > 0 && Number.isFinite(modelRate) && modelRate !== matched.unitPrice) {
            warnings.push(`${matched.name}: used catalog price instead of a guessed amount`);
        }

        const reviewReason = isNewItem ? 'new item — review' : null;
        return {
            description: matched ? matched.name : description,
            quantity,
            rate,
            unit,
            productId: matched ? matched.id : null,
            isNewItem,
            reviewReason,
        };
    });

    const rawClientName = sanitizePlainText(
        parsed.clientName || parsed.client?.name || parsed.client?.clientName,
        200
    );
    const preferredClientId =
        parsed.catalogClientId || parsed.client?.catalogClientId || parsed.client?.clientId || null;
    const matchedClient = matchCatalogClient(rawClientName, clients, preferredClientId);
    const sourceClient = matchedClient
        ? sourceClients.find((client) => String(client._id || client.id) === matchedClient.id)
        : null;

    const client = rawClientName || matchedClient
        ? {
            clientId: matchedClient?.id || null,
            clientName: matchedClient?.name || rawClientName,
            clientEmail: sourceClient?.email || '',
            clientBusiness: sourceClient?.company || matchedClient?.company || '',
            clientPhone: sourceClient?.phone || '',
            clientAddress: sourceClient?.address || '',
            matched: Boolean(matchedClient),
        }
        : {
            clientId: null,
            clientName: '',
            clientEmail: '',
            clientBusiness: '',
            clientPhone: '',
            clientAddress: '',
            matched: false,
        };

    if (rawClientName && !matchedClient) {
        warnings.push(`${rawClientName}: new client — review before saving`);
    }

    const notes = sanitizePlainText(parsed.notes, 2000);

    return {
        documentType: type,
        client,
        items,
        notes,
        warnings,
        saved: false,
    };
}

export function buildAiDraftMessages({ prompt, documentType, catalog, businessName, currency }) {
    const type = normalizeAiDocumentType(documentType);
    const system = [
        'You draft Waraqah sales documents for Nigerian small businesses.',
        'Return JSON only. Never send, save, email, or mark a document paid.',
        'Use catalog ids when a client or product clearly matches. If unsure, leave catalog ids null.',
        'If the user did not state a price, set rate to null. Do not invent prices.',
        'Schema: {"clientName": string|null, "catalogClientId": string|null, "notes": string, "items": [{"description": string, "quantity": number, "rate": number|null, "unit": string, "catalogProductId": string|null}]}',
    ].join(' ');

    const user = [
        `Business: ${truncate(businessName, 80) || 'Unknown'}`,
        `Currency: ${truncate(currency, 8) || 'NGN'}`,
        `Document type: ${type}`,
        `Prompt: ${prompt}`,
        `Catalog clients: ${JSON.stringify(catalog.clients)}`,
        `Catalog products: ${JSON.stringify(catalog.products)}`,
    ].join('\n');

    return { system, user };
}
