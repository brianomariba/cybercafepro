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
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Guide', GuideSchema);
