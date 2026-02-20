const mongoose = require('mongoose');

const DocumentRequestSchema = new mongoose.Schema({
    orderId: { type: String, required: true, unique: true },
    customerName: { type: String, required: true },
    customerPhone: { type: String, required: true },
    serviceType: { type: String, required: true },
    instructions: { type: String },
    source: { type: String, default: 'landing_page' },
    status: {
        type: String,
        enum: ['pending', 'processing', 'ready', 'completed', 'cancelled'],
        default: 'pending'
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'paid'],
        default: 'pending'
    },
    files: [{
        originalName: String,
        filename: String,
        path: String,
        mimeType: String,
        size: Number,
        docType: String // 'pdf', 'word', 'excel', 'other'
    }],
    totalFiles: { type: Number, default: 0 },
    totalSize: { type: Number, default: 0 },
    notes: { type: String }, // Admin notes
    receivedBy: {
        hostname: { type: String },
        clientId: { type: String },
        receivedAt: { type: Date }
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('DocumentRequest', DocumentRequestSchema);
