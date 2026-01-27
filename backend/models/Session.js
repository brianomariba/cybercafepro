const mongoose = require('mongoose');

const SessionSchema = new mongoose.Schema({
    sessionId: { type: String, required: true },
    clientId: { type: String, required: true },
    hostname: { type: String },
    user: { type: String },
    type: { type: String, enum: ['LOGIN', 'LOGOUT'], required: true },
    startTime: { type: Date },
    endTime: { type: Date },
    durationMinutes: { type: Number },
    charges: {
        usage: {
            hours: Number,
            total: Number
        },
        printing: {
            bwPages: Number,
            bwTotal: Number,
            colorPages: Number,
            colorTotal: Number
        },
        services: Number,
        grandTotal: Number
    },
    receivedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Session', SessionSchema);
