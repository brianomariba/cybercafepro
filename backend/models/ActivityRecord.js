const mongoose = require('mongoose');

const activityRecordSchema = new mongoose.Schema({
    serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrackableService' },
    serviceName: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    agentUser: { type: String, required: true },
    clientId: { type: String, default: '' },
    hostname: { type: String, default: '' },
    date: { type: String, required: true }, // YYYY-MM-DD format for grouping by day
    notes: { type: String, default: '' },
    customerName: { type: String, default: '' },
    paymentMethod: { type: String, default: 'cash' }, // cash, mpesa
    submittedAt: { type: Date, default: Date.now },
    // Batch ID to group all records from a single end-of-day submission
    batchId: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});

// Index for efficient queries
activityRecordSchema.index({ date: -1, agentUser: 1 });
activityRecordSchema.index({ batchId: 1 });
activityRecordSchema.index({ submittedAt: -1 });

module.exports = mongoose.model('ActivityRecord', activityRecordSchema);
