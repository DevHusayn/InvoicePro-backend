import DocumentCounter from '../models/DocumentCounter.js';

/**
 * Atomically increment a per-user document sequence.
 * Seeds from computeSeedMax on first use (one-time scan for existing records).
 */
export async function incrementDocumentSequence(userId, field, computeSeedMax) {
    let doc = await DocumentCounter.findOneAndUpdate(
        { userId },
        { $inc: { [field]: 1 } },
        { new: true }
    );
    if (doc) return doc[field];

    const seedMax = await computeSeedMax(userId);
    const seed = { userId, invoiceSeq: 0, quotationSeq: 0, [field]: seedMax };
    try {
        await DocumentCounter.create(seed);
    } catch (err) {
        if (err?.code !== 11000) throw err;
    }

    doc = await DocumentCounter.findOneAndUpdate(
        { userId },
        { $inc: { [field]: 1 } },
        { new: true }
    );
    if (!doc) {
        throw new Error('Failed to allocate document sequence');
    }
    return doc[field];
}
