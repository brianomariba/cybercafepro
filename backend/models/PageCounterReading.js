const mongoose = require('mongoose');

const PageCounterReadingSchema = new mongoose.Schema({
    printerName: { type: String, required: true, index: true },
    counterValue: { type: Number, required: true },
    notes: { type: String, default: '' },
    recordedBy: { type: String, default: 'admin' },
    recordedAt: { type: Date, default: Date.now, index: true }
});

// Compound index for efficient queries
PageCounterReadingSchema.index({ printerName: 1, recordedAt: -1 });

module.exports = mongoose.model('PageCounterReading', PageCounterReadingSchema);
