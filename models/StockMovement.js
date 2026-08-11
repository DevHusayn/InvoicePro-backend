import mongoose from 'mongoose';

const stockMovementSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    /** Signed quantity change (+ restock, − sale/deduction). */
    delta: { type: Number, required: true },
    /** quantityOnHand immediately after this movement. */
    balanceAfter: { type: Number, required: true },
    source: {
        type: String,
        enum: ['manual', 'opening', 'set', 'invoice', 'receipt'],
        required: true,
    },
    action: {
        type: String,
        enum: ['adjustment', 'opening', 'set', 'issue', 'update', 'cancel', 'delete'],
        required: true,
    },
    documentId: { type: mongoose.Schema.Types.ObjectId, default: null },
    documentNumber: { type: String, default: null },
    note: { type: String, default: '' },
}, { timestamps: true });

stockMovementSchema.index({ userId: 1, productId: 1, createdAt: -1 });

export default mongoose.model('StockMovement', stockMovementSchema);
