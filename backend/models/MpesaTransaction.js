const mongoose = require('mongoose');

const MpesaTransactionSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true }, // e.g. 'c2b-12345'
    transactionType: { type: String, enum: ['C2B', 'STK_PUSH'] },
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'completed' },
    amount: { type: Number },
    mpesaReceiptNumber: { type: String }, // e.g. OJU1234567
    accountReference: { type: String }, // BillRefNumber
    phoneNumber: { type: String }, // MSISDN
    payerName: { type: String }, // FirstName MiddleName LastName
    mpesaCheckoutRequestId: { type: String }, // For STK Push
    merchantRequestId: { type: String }, // For STK Push
    rawMessage: { type: String }, // Full payload as string or JSON
    fullDescription: { type: String }, // E.g., 'Payment for services'
    resultDesc: { type: String },
    completedAt: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('MpesaTransaction', MpesaTransactionSchema);
