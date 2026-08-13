import mongoose from 'mongoose';

const expenseSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        date: { type: String, required: true },
        amount: { type: Number, required: true, min: 0 },
        category: { type: String, required: true, trim: true, maxlength: 50 },
        description: { type: String, default: '' },
        vendor: { type: String, default: '' },
    },
    { timestamps: true }
);

expenseSchema.index({ userId: 1, date: -1 });
expenseSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('Expense', expenseSchema);
