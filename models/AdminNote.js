import mongoose from 'mongoose';

const adminNoteSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        authorName: { type: String, default: '' },
        body: { type: String, required: true, maxlength: 5000 },
    },
    { timestamps: true }
);

adminNoteSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('AdminNote', adminNoteSchema);
