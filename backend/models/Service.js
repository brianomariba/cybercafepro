const mongoose = require('mongoose');

const ServiceSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    category: { type: String, required: true }, // Main category (e.g., 'printing', 'scanning')
    subcategory: { type: String }, // Subcategory (e.g., 'photopaper', 'a4', 'a3')
    description: { type: String },
    price: { type: Number, required: true },
    unit: { type: String, default: 'flat' }, // 'flat', 'per_hour', 'per_page', 'per_copy'
    icon: { type: String }, // Icon name (e.g., 'printer', 'picture', 'file')
    color: { type: String }, // Accent color for the service
    displayOrder: { type: Number, default: 0 }, // For ordering services
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Service', ServiceSchema);

