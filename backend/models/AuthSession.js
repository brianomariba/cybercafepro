const mongoose = require('mongoose');

const AuthSessionSchema = new mongoose.Schema({
    token: { type: String, required: true, unique: true },
    username: { type: String, required: true },
    email: { type: String },
    type: { type: String, enum: ['admin', 'portal'], required: true },
    name: { type: String },
    role: { type: String },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now }
});

// Auto-delete expired sessions
AuthSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('AuthSession', AuthSessionSchema);
