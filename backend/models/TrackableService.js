const mongoose = require('mongoose');

const trackableServiceSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String, default: '' },
    price: { type: Number, required: true, min: 0 },
    unit: { type: String, default: 'per_item' }, // per_item, per_page, flat, per_hour
    keyboardShortcut: { type: String, default: '' }, // e.g. "Ctrl+1", "F5", "Ctrl+Shift+K"
    icon: { type: String, default: '📋' },
    category: { type: String, default: 'General' },
    isActive: { type: Boolean, default: true },
    color: { type: String, default: '#00B4D8' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

trackableServiceSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('TrackableService', trackableServiceSchema);
