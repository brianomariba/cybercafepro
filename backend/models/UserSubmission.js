const mongoose = require('mongoose');

const UserSubmissionSchema = new mongoose.Schema({
    // Basic info
    title: { type: String, required: true },
    description: { type: String },
    category: { type: String }, // e.g., 'resume', 'business', 'academic'

    // File info
    fileUrl: { type: String, required: true },
    fileOriginalName: { type: String, required: true },
    fileMimeType: { type: String },
    fileSize: { type: Number },

    // Submission details
    submittedBy: { type: String, required: true }, // username
    submittedByName: { type: String }, // display name
    submittedAt: { type: Date, default: Date.now },

    // Target type - what the user wants this to become
    targetType: {
        type: String,
        enum: ['template', 'guidance'],
        required: true
    },

    // Review status
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },

    // Admin review details
    reviewedBy: { type: String },
    reviewedAt: { type: Date },
    reviewNotes: { type: String },

    // If approved, track the resulting resource
    approvedResourceId: { type: mongoose.Schema.Types.ObjectId },
    approvedResourceType: { type: String } // 'Template' or 'Guide'
});

module.exports = mongoose.model('UserSubmission', UserSubmissionSchema);
