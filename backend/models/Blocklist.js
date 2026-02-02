const mongoose = require('mongoose');

const BlocklistSchema = new mongoose.Schema({
    url: {
        type: String,
        required: true
    },
    domain: {
        type: String,
        required: true
    },
    reason: {
        type: String,
        default: 'Blocked by admin'
    },
    blockedBy: {
        type: String,
        default: 'admin'
    },
    active: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

// Extract domain from URL
BlocklistSchema.pre('save', function (next) {
    if (this.url && !this.domain) {
        try {
            const urlObj = new URL(this.url.startsWith('http') ? this.url : `https://${this.url}`);
            this.domain = urlObj.hostname;
        } catch {
            this.domain = this.url;
        }
    }
    next();
});

module.exports = mongoose.model('Blocklist', BlocklistSchema);
