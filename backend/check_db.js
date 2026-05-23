const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hawknine';

const LogSchema = new mongoose.Schema({
    type: { type: String, required: true },
    clientId: String,
    hostname: String,
    data: mongoose.Schema.Types.Mixed,
    receivedAt: { type: Date, default: Date.now }
});
const Log = mongoose.model('Log', LogSchema);

async function check() {
    await mongoose.connect(MONGODB_URI);
    const prints = await Log.find({ type: 'print' }).sort({ receivedAt: -1 }).limit(10);
    console.log("RECENT PRINTS ACROSS ALL HOSTS:");
    prints.forEach(p => {
        console.log(`[${p.receivedAt.toISOString()}] (Host: ${p.hostname}) ${p.data.document} - ${p.data.copies} copies - ${p.data.printers}`);
        console.log(p.data);
    });
    process.exit();
}
check();
