import mongoose from 'mongoose';

const supplierSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: String,
    company: String,
    email: String,
    phone: String,
    address: String,
}, { timestamps: true });

supplierSchema.index({ userId: 1, name: 1 });
supplierSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('Supplier', supplierSchema);
