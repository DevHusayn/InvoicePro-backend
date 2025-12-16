import mongoose from 'mongoose';

const businessInfoSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: String,
    address: String,
    email: String,
    phone: String,
    website: String,
    defaultCurrency: String,
    taxRate: Number,
    brandColor: String,
}, { timestamps: true });

export default mongoose.model('BusinessInfo', businessInfoSchema);
