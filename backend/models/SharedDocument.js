const mongoose = require('mongoose');

const SharedDocumentSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    filename: { type: String, required: true },
    storedName: { type: String, required: true },
    path: { type: String, required: true },
    size: { type: Number },
    sizeFormatted: { type: String },
    mimetype: { type: String },
    from: {
        user: String,
        clientId: String
    },
    to: {
        user: String,
        clientId: String
    },
    message: { type: String },
    status: { type: String, default: 'pending' },
    uploadedAt: { type: Date, default: Date.now },
    downloadedAt: { type: Date }
});

module.exports = mongoose.model('SharedDocument', SharedDocumentSchema);
