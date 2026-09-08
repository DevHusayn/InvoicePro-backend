import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    unitPrice: { type: Number, default: 0 },
    /** Cost of goods sold per unit — used for profit margin analytics. */
    unitCost: { type: Number, default: 0 },
    trackInventory: { type: Boolean, default: false },
    quantityOnHand: { type: Number, default: 0 },
    lowStockThreshold: { type: Number, default: null },
}, { timestamps: true });

productSchema.index({ userId: 1, name: 1 });
productSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('Product', productSchema);
