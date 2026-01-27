const mongoose = require('mongoose');

const VerificationCodeSchema = new mongoose.Schema({
    type: { type: String, enum: ['admin_otp', 'user_otp', 'admin_temp_token', 'user_temp_token'], required: true },
    key: { type: String, required: true }, // username or tempToken string
    value: { type: String, required: true }, // the OTP or the username it links to
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now }
});

// Auto-delete expired codes
VerificationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
VerificationCodeSchema.index({ type: 1, key: 1 }, { unique: true });

module.exports = mongoose.model('VerificationCode', VerificationCodeSchema);
