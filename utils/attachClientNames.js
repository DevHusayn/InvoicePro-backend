import Client from '../models/Client.js';
import Invoice from '../models/Invoice.js';
import Quotation from '../models/Quotation.js';
import { mergeClientDisplayFields } from './clientSnapshot.js';

function toPlain(document) {
    if (!document) return document;
    return typeof document.toObject === 'function' ? document.toObject() : { ...document };
}

const MISSING_SNAPSHOT = {
    $or: [{ clientName: null }, { clientName: '' }, { clientName: { $exists: false } }],
};

function scheduleSnapshotBackfill(documents, byId) {
    const updates = documents
        .map((doc) => {
            const client = doc.clientId ? byId.get(String(doc.clientId)) : null;
            if (!client || String(doc.clientName || '').trim()) return null;
            const fields = mergeClientDisplayFields(doc, client);
            if (!fields.clientName || !doc._id) return null;
            return { id: doc._id, fields };
        })
        .filter(Boolean);

    if (updates.length === 0) return;

    Promise.all(
        updates.flatMap(({ id, fields }) => [
            Invoice.updateOne({ _id: id, ...MISSING_SNAPSHOT }, { $set: fields }),
            Quotation.updateOne({ _id: id, ...MISSING_SNAPSHOT }, { $set: fields }),
        ])
    ).catch(() => {});
}

/** Attach clientName and clientCompany from the live client, falling back to the document snapshot. */
export async function attachClientNamesToDocuments(documents, userId) {
    const clientIds = [
        ...new Set(
            documents
                .map((doc) => doc.clientId)
                .filter(Boolean)
                .map((id) => String(id))
        ),
    ];
    if (clientIds.length === 0) {
        return documents.map((doc) => ({
            ...doc,
            ...mergeClientDisplayFields(doc, null),
        }));
    }
    const clients = await Client.find({
        userId,
        _id: { $in: clientIds },
    })
        .select('name company')
        .lean();
    const byId = new Map(clients.map((c) => [String(c._id), c]));
    scheduleSnapshotBackfill(documents, byId);
    return documents.map((doc) => {
        const client = doc.clientId ? byId.get(String(doc.clientId)) : null;
        return {
            ...doc,
            ...mergeClientDisplayFields(doc, client),
        };
    });
}

export async function attachClientNamesToDocument(document, userId) {
    if (!document) return document;
    const [attached] = await attachClientNamesToDocuments([toPlain(document)], userId);
    return attached;
}
