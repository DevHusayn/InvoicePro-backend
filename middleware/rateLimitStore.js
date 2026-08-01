import mongoose from 'mongoose';

const rateLimitSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true, index: true },
    hits: { type: Number, default: 0 },
    resetTime: { type: Date, required: true, index: true },
}, { timestamps: false });

const RateLimitEntry =
    mongoose.models.RateLimitEntry || mongoose.model('RateLimitEntry', rateLimitSchema);

let ttlIndexEnsured = false;

async function ensureTtlIndex() {
    if (ttlIndexEnsured) return;
    try {
        await RateLimitEntry.collection.createIndex(
            { resetTime: 1 },
            { expireAfterSeconds: 0, background: true }
        );
    } catch {
        /* index may already exist */
    }
    ttlIndexEnsured = true;
}

/**
 * MongoDB store for express-rate-limit (works across Vercel serverless instances).
 */
export class MongoRateLimitStore {
    constructor() {
        this.prefix = 'rl:';
        this.windowMs = 15 * 60 * 1000;
    }

    init(options) {
        this.windowMs = options.windowMs;
    }

    _docKey(key) {
        return `${this.prefix}${key}`;
    }

    async increment(key) {
        await ensureTtlIndex();
        const docKey = this._docKey(key);
        const now = new Date();
        const resetTime = new Date(Date.now() + this.windowMs);

        const doc = await RateLimitEntry.findOneAndUpdate(
            { key: docKey },
            [
                {
                    $set: {
                        hits: {
                            $cond: {
                                if: { $gt: ['$resetTime', now] },
                                then: { $add: [{ $ifNull: ['$hits', 0] }, 1] },
                                else: 1,
                            },
                        },
                        resetTime: {
                            $cond: {
                                if: { $gt: ['$resetTime', now] },
                                then: '$resetTime',
                                else: resetTime,
                            },
                        },
                    },
                },
            ],
            { upsert: true, new: true }
        );

        return { totalHits: doc.hits, resetTime: doc.resetTime };
    }

    async decrement(key) {
        await RateLimitEntry.findOneAndUpdate(
            { key: this._docKey(key), hits: { $gt: 0 } },
            { $inc: { hits: -1 } }
        );
    }

    async resetKey(key) {
        await RateLimitEntry.deleteOne({ key: this._docKey(key) });
    }
}

export function createMongoStore() {
    return new MongoRateLimitStore();
}
