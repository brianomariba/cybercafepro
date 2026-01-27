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
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Transaction', TransactionSchema);
