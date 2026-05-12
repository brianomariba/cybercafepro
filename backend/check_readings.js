// Quick script to check PageCounterReading documents in MongoDB
const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

async function check() {
    await mongoose.connect(MONGO_URI);
    const PageCounterReading = require('./models/PageCounterReading');
    
    const count = await PageCounterReading.countDocuments();
    console.log(`Total PageCounterReading documents: ${count}`);
    
    if (count > 0) {
        const latest = await PageCounterReading.find().sort({ recordedAt: -1 }).limit(5).lean();
        console.log('\nLatest 5 readings:');
        for (const r of latest) {
            console.log(`  ${r.printerName} | counter=${r.counterValue} | sheets=${r.totalSheets} | client=${r.clientId} | source=${r.source} | ${r.recordedAt}`);
        }
    } else {
        console.log('No readings found in database at all!');
    }
    
    await mongoose.disconnect();
}

check().catch(e => { console.error(e); process.exit(1); });
