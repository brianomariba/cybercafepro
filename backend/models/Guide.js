const mongoose = require('mongoose');

const GuideSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    objective: { type: String, required: true }, // e.g., 'getting-started', 'printing'
    type: { type: String, enum: ['Guide', 'Tutorial', 'Reference'], default: 'Guide' },
    duration: { type: String, required: true }, // e.g., '5 min read'
    content: { type: String }, // Markdown content or HTML
    icon: { type: String }, // Icon identifier
    popular: { type: Boolean, default: false },
    // File attachment fields
    fileUrl: { type: String }, // Path to uploaded file
    fileOriginalName: { type: String }, // Original filename
    fileMimeType: { type: String }, // File MIME type (application/pdf, etc.)
    fileSize: { type: Number }, // File size in bytes
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Guide', GuideSchema);
