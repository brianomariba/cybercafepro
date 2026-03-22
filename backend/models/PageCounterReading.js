const mongoose = require('mongoose');

const PageCounterReadingSchema = new mongoose.Schema({
    printerName: { type: String, required: true, index: true },
    counterValue: { type: Number, required: true },
    // Detailed page breakdowns (from Epson Maintenance > Nozzle Check data)
    colorPages: { type: Number, default: null },
    bwPages: { type: Number, default: null },
    blankPages: { type: Number, default: null },
    borderlessColor: { type: Number, default: null },
    borderlessBW: { type: Number, default: null },
    withBorderColor: { type: Number, default: null },
    withBorderBW: { type: Number, default: null },
    firstPrintDate: { type: String, default: null },
    // Source tracking
    source: { type: String, default: 'manual' },
    clientId: { type: String, default: null },
    hostname: { type: String, default: null },
    printerOnline: { type: Boolean, default: null },
    notes: { type: String, default: '' },
    recordedBy: { type: String, default: 'admin' },
    recordedAt: { type: Date, default: Date.now, index: true }
});

// Compound index for efficient queries
PageCounterReadingSchema.index({ printerName: 1, recordedAt: -1 });

module.exports = mongoose.model('PageCounterReading', PageCounterReadingSchema);

