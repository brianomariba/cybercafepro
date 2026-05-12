const mongoose = require('mongoose');

const ServiceCategorySchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true }, // Display name (e.g., 'Printing', 'Photo Paper')
    key: { type: String, required: true, unique: true }, // Lowercase key (e.g., 'printing', 'photopaper')
    icon: { type: String, default: 'folder' }, // Icon identifier
    color: { type: String, default: '#00B4D8' }, // Category color
    description: { type: String },
    parentCategory: { type: String }, // For nested categories (parent key)
    displayOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ServiceCategory', ServiceCategorySchema);
