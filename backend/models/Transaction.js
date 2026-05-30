const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
    id: { type: String, unique: true, sparse: true },
    type: { type: String },
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
    businessShortCode: { type: String }, // Stores Till Number or HO shortcode
    // Sale correction fields
    status: { type: String, enum: ['completed', 'corrected', 'pending', 'failed'], default: 'completed' },
    correctedAt: { type: Date },
    correctionReason: { type: String },
    correctedBy: { type: String },
    originalTransactionId: { type: String }, // Links correction entry back to the original sale
    // M-Pesa STK Push fields
    mpesaCheckoutRequestId: { type: String, index: true }, // Safaricom's CheckoutRequestID for polling & callback lookup
    mpesaReceiptNumber: { type: String },                  // Safaricom receipt e.g. "QKJ3ABCDEF"
    phoneNumber: { type: String },                         // Customer's Safaricom number (254...)
    accountReference: { type: String },                    // PayBill account reference sent to customer
    fullDescription: { type: String },                     // Full human-readable description (e.g. "Checkout: 2x Paper, 1x Ink")
    payerName: { type: String },                           // Customer/payer name entered by agent
    completedAt: { type: Date },                           // When M-Pesa payment was confirmed
    failureReason: { type: String },                       // Reason if M-Pesa payment failed/cancelled
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Transaction', TransactionSchema);
