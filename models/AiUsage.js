import mongoose from 'mongoose';

const aiUsageSchema = new mongoose.Schema(
    {
        scope: { type: String, enum: ['user', 'global'], required: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        periodKey: { type: String, required: true },
        draftCount: { type: Number, default: 0 },
        promptTokens: { type: Number, default: 0 },
        completionTokens: { type: Number, default: 0 },
    },
    { timestamps: true }
);

aiUsageSchema.index({ scope: 1, userId: 1, periodKey: 1 }, { unique: true });

export default mongoose.model('AiUsage', aiUsageSchema);
