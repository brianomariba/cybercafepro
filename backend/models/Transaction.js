const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    type: { type: String, required: true },
    taskId: { type: String },
    sessionId: { type: String },
    description: { type: String },
    amount: { type: Number, required: true },
    clientId: { type: String },
    userId: { type: String },
    hostname: { type: String },
    breakdown: {
        usage: Number,
        printBW: Number,
        printColor: Number
    },
    // Inventory fields
    itemId: { type: String },
    itemName: { type: String },
    quantity: { type: Number },
    seller: { type: String }, // e.g. 'admin' or hostname
    reason: { type: String },
    paymentMethod: { type: String, enum: ['cash', 'mpesa', 'other'], default: 'cash' },
    // Sale correction fields
    status: { type: String, enum: ['completed', 'corrected'], default: 'completed' },
    correctedAt: { type: Date },
    correctionReason: { type: String },
    correctedBy: { type: String },
    originalTransactionId: { type: String }, // Links correction entry back to the original sale
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Transaction', TransactionSchema);
