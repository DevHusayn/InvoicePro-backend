import Client from '../models/Client.js';
import { sanitizePlainText } from './sanitize.js';

export const DOCUMENT_CLIENT_SEARCH_FIELDS = ['clientName', 'clientCompany'];

export function mergeClientDisplayFields(doc, liveClient) {
    const name = String(liveClient?.name || doc?.clientName || '').trim() || null;
    const company = String(liveClient?.company || doc?.clientCompany || '').trim() || null;
    return {
        clientName: name,
        clientCompany: company,
    };
}

function sanitizeSnapshotValue(value) {
    const text = sanitizePlainText(value, 200);
    return text || null;
}

/** Copy the live client name onto a document payload, or keep the last known snapshot. */
export async function applyClientSnapshot(data, userId, existing = null) {
    if (!data || typeof data !== 'object') return data;

    if (data.clientName !== undefined) {
        data.clientName = sanitizeSnapshotValue(data.clientName);
    }
    if (data.clientCompany !== undefined) {
        data.clientCompany = sanitizeSnapshotValue(data.clientCompany);
    }

    const clientId = data.clientId !== undefined ? data.clientId : existing?.clientId || null;
    if (clientId) {
        const client = await Client.findOne({ _id: clientId, userId }).select('name company').lean();
        if (client) {
            data.clientName = sanitizeSnapshotValue(client.name);
            data.clientCompany = sanitizeSnapshotValue(client.company);
            return data;
        }
    }

    if (data.clientName == null && existing?.clientName) {
        data.clientName = existing.clientName;
    }
    if (data.clientCompany == null && existing?.clientCompany) {
        data.clientCompany = existing.clientCompany;
    }
    return data;
}
