const mongoose = require('mongoose');

// Connect to the actual MongoDB instance
mongoose.connect('mongodb://localhost:27017/hawknine', { useNewUrlParser: true, useUnifiedTopology: true })
    .then(async () => {
        const Log = mongoose.models.Log || mongoose.model('Log', new mongoose.Schema({}, { strict: false }));
        const recentPrints = await Log.find({ type: 'print' }).sort({ receivedAt: -1 }).limit(10).lean();
        console.log("Recent 10 prints:");
        for (const p of recentPrints) {
            console.log(`- ${p.receivedAt}: ${p.data.document} | ${p.data.pagesPrinted}/${p.data.totalPages} pages | Copies: ${p.data.copies} (src: ${p.data.source}) [Status: ${p.data.status}] | ${p.data.printer}`);
        }
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
