const mongoose = require('mongoose');

const ComputerSchema = new mongoose.Schema({
    clientId: { type: String, required: true, unique: true },
    hostname: { type: String },
    ip: { type: String },
    status: { type: String, enum: ['locked', 'unlocked', 'active', 'offline'], default: 'offline' },
    sessionId: { type: String },
    sessionUser: { type: String },
    uptime: { type: String },
    metrics: {
        cpu: Number,
        memory: Number,
        disk: Number
    },
    activity: {
        window: {
            title: { type: String },
            owner: { type: String },
            url: { type: String }
        },
        printJobsActive: Number,
        hasScreenshot: Boolean
    },
    lastSeen: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Computer', ComputerSchema);
