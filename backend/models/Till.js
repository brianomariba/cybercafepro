const mongoose = require('mongoose');

const TillSchema = new mongoose.Schema({
    tillNumber: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    shop: { type: String }, // optional shop assignment
    agents: [{ type: String }], // array of agent usernames
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Till', TillSchema);
