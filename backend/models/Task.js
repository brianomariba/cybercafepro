const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    description: { type: String },
    serviceId: { type: String },
    serviceName: { type: String },
    price: { type: Number, default: 0 },
    priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },
    status: { type: String, enum: ['available', 'assigned', 'in-progress', 'completed', 'cancelled'], default: 'available' },
    assignedTo: {
        userId: String,
        clientId: String,
        hostname: String,
        userName: String
    },
    assignedAt: { type: Date },
    startedAt: { type: Date },
    completedAt: { type: Date },
    dueAt: { type: Date },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Task', TaskSchema);
