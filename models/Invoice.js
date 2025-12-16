import mongoose from 'mongoose';

const invoiceSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
    invoiceNumber: String,
    date: String,
    dueDate: String,
    items: [
        {
            description: String,
            quantity: Number,
            rate: Number,
        }
    ],
    notes: String,
    status: String,
    currency: String,
    taxRate: Number,
    subtotal: Number,
    tax: Number,
    total: Number,
    createdAt: { type: Date, default: Date.now },
    // Recurring invoice fields
    isRecurring: { type: Boolean, default: false },
    recurringFrequency: { type: String, enum: ['weekly', 'bi-weekly', 'monthly', 'quarterly', 'yearly'], default: null },
    recurringEndDate: { type: String, default: null },
}, { timestamps: true });

export default mongoose.model('Invoice', invoiceSchema);
