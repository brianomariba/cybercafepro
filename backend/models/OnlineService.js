const mongoose = require('mongoose');

const OnlineServiceSchema = new mongoose.Schema({
    clientId: { type: String, required: true },
    hostname: { type: String },
    sessionId: { type: String },
    sessionUser: { type: String },
    service: { type: String, required: true },
    fileName: { type: String },
    path: { type: String },
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('OnlineService', OnlineServiceSchema);
