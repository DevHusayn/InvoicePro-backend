import mongoose from 'mongoose';

const ACTIVITY_TYPES = [
    'login',
    'suspended',
    'reactivated',
    'plan_upgraded',
    'plan_downgraded',
    'subscription_cancelled',
    'subscription_payment_failed',
    'payment_success',
    'payment_failed',
];

const userActivityLogSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        type: { type: String, enum: ACTIVITY_TYPES, required: true },
        title: { type: String, default: '' },
        description: { type: String, default: '' },
        meta: { type: mongoose.Schema.Types.Mixed, default: null },
        actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true }
);

userActivityLogSchema.index({ userId: 1, createdAt: -1 });

export { ACTIVITY_TYPES };
export default mongoose.model('UserActivityLog', userActivityLogSchema);
