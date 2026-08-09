import Client from '../models/Client.js';

/** Attach clientName and clientCompany to documents with clientId. */
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
        return documents.map((doc) => ({ ...doc, clientName: null, clientCompany: null }));
    }
    const clients = await Client.find({
        userId,
        _id: { $in: clientIds },
    })
        .select('name company')
        .lean();
    const byId = new Map(clients.map((c) => [String(c._id), c]));
    return documents.map((doc) => {
        const client = doc.clientId ? byId.get(String(doc.clientId)) : null;
        return {
            ...doc,
            clientName: client?.name || null,
            clientCompany: client?.company || null,
        };
    });
}
