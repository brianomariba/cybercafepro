const mongoose = require('mongoose');

const LogSchema = new mongoose.Schema({
    type: { type: String, enum: ['print', 'browser', 'file', 'usb', 'activity', 'printers'], required: true },
    clientId: { type: String, index: true },
    hostname: String,
    sessionId: String,
    sessionUser: { type: String, index: true },
    data: mongoose.Schema.Types.Mixed,
    receivedAt: { type: Date, default: Date.now, index: true }
});

// Compound index for common queries
LogSchema.index({ type: 1, clientId: 1, receivedAt: -1 });
LogSchema.index({ type: 1, sessionUser: 1, receivedAt: -1 });

module.exports = mongoose.model('Log', LogSchema);

