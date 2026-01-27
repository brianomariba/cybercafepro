const mongoose = require('mongoose');

const LogSchema = new mongoose.Schema({
    type: { type: String, enum: ['print', 'browser', 'file', 'usb', 'activity'], required: true },
    clientId: String,
    hostname: String,
    sessionId: String,
    sessionUser: String,
    data: mongoose.Schema.Types.Mixed,
    receivedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Log', LogSchema);
