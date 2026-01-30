const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    email: { type: String },
    name: { type: String },
    type: { type: String, enum: ['agent', 'portal', 'admin'], required: true },
    role: { type: String, enum: ['Super Admin', 'Admin', 'Staff'], default: 'Staff' },
    active: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    lastLogin: { type: Date }
});

module.exports = mongoose.model('User', UserSchema);
