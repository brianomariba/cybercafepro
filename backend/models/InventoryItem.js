const mongoose = require('mongoose');

const InventoryItemSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String },
    price: { type: Number, required: true, default: 0 },
    stock: { type: Number, required: true, default: 0 },
    lowStockThreshold: { type: Number, default: 5 },
    category: { type: String, default: 'General' },
    isActive: { type: Boolean, default: true },
    // Access control fields
    hiddenFromUsers: [{ type: String }],  // Usernames who cannot see this item
    stockLimitForUsers: [{
        username: { type: String, required: true },
        maxVisible: { type: Number, required: true }  // Max stock shown to this user
    }],
    allowedUsers: [{ type: String }],  // If visibilityMode is 'whitelist', only these users can see
    visibilityMode: { type: String, enum: ['all', 'whitelist'], default: 'all' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('InventoryItem', InventoryItemSchema);
