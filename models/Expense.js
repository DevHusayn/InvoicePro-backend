import mongoose from 'mongoose';

const expenseSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        date: { type: String, required: true },
        amount: { type: Number, required: true, min: 0 },
        category: { type: String, required: true, trim: true, maxlength: 50 },
        description: { type: String, default: '' },
        vendor: { type: String, default: '' },
        isRecurring: { type: Boolean, default: false },
        recurringFrequency: {
            type: String,
            enum: ['weekly', 'bi-weekly', 'monthly', 'quarterly', 'yearly'],
            required: false,
        },
        recurringEndDate: { type: String, default: null },
        recurringNextDate: { type: String, default: null },
        recurringSourceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Expense',
            default: null,
        },
    },
    { timestamps: true }
);

expenseSchema.index({ userId: 1, date: -1 });
expenseSchema.index({ userId: 1, createdAt: -1 });
expenseSchema.index({ isRecurring: 1, recurringNextDate: 1 });
expenseSchema.index({ recurringSourceId: 1 });

export default mongoose.model('Expense', expenseSchema);
