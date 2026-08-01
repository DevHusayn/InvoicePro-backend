import mongoose from 'mongoose';

const documentCounterSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    invoiceSeq: { type: Number, default: 0 },
    quotationSeq: { type: Number, default: 0 },
}, { timestamps: false });

export default mongoose.model('DocumentCounter', documentCounterSchema);
