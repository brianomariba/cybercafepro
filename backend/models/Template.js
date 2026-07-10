const mongoose = require('mongoose');

const TemplateSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    category: { type: String, required: true }, // e.g., 'resume', 'business'
    type: { type: String, required: true }, // e.g., 'Word', 'Excel', 'PowerPoint'
    // Backward compatibility for single file
    fileUrl: { type: String }, // Path to file or URL
    fileOriginalName: { type: String }, // Original filename
    fileMimeType: { type: String }, // File MIME type
    fileSize: { type: Number }, // File size in bytes
    // New array for multiple files
    files: [{
        fileUrl: { type: String },
        fileOriginalName: { type: String },
        fileMimeType: { type: String },
        fileSize: { type: Number }
    }],
    previewUrl: { type: String }, // Optional preview image
    icon: { type: String }, // Icon name/identifier
    downloads: { type: Number, default: 0 },
    featured: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Template', TemplateSchema);
