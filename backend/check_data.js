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

async function checkData() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        const hostname = 'KINGMAGETOH';

        // 1. Check Browser History
        const browserLogs = await Log.find({
            hostname: new RegExp(hostname, 'i'),
            type: 'browser'
        }).sort({ receivedAt: -1 }).limit(5);

        console.log('\n--- Browser History (Last 5) ---');
        console.log(`Total Found: ${await Log.countDocuments({ hostname: new RegExp(hostname, 'i'), type: 'browser' })}`);
        if (browserLogs.length > 0) {
            browserLogs.forEach(log => {
                const url = log.data?.url || log.data?.title || 'No URL';
                console.log(`[${log.receivedAt.toISOString()}] ${url} (${log.data?.category || 'nocat'})`);
            });
        } else {
            console.log('No browser history found.');
        }

        // 2. Check File Activity
        const fileLogs = await Log.find({
            hostname: new RegExp(hostname, 'i'),
            type: 'file'
        }).sort({ receivedAt: -1 }).limit(5);

        console.log('\n--- File Activity (Last 5) ---');
        console.log(`Total Found: ${await Log.countDocuments({ hostname: new RegExp(hostname, 'i'), type: 'file' })}`);
        if (fileLogs.length > 0) {
            fileLogs.forEach(log => {
                // Determine format based on structure (might be array or single object)
                const files = Array.isArray(log.data) ? log.data : [log.data];
                files.forEach(f => {
                    console.log(`[${log.receivedAt.toISOString()}] ${f.action}: ${f.name} (${f.category})`);
                });
            });
        } else {
            console.log('No file activity found.');
        }

        // 3. Check Print Manager (Print Logs)
        const printLogs = await Log.find({
            hostname: new RegExp(hostname, 'i'),
            type: 'print'
        }).sort({ receivedAt: -1 }).limit(5);

        console.log('\n--- Print Logs (Last 5) ---');
        console.log(`Total Found: ${await Log.countDocuments({ hostname: new RegExp(hostname, 'i'), type: 'print' })}`);
        if (printLogs.length > 0) {
            printLogs.forEach(log => {
                const job = log.data;
                console.log(`[${log.receivedAt.toISOString()}] ${job.document} on ${job.printer} (${job.pages} pages)`);
            });
        } else {
            console.log('No print logs found.');
        }

        // 4. Check Printer Status (Printers detected)
        const printerLogs = await Log.findOne({
            hostname: new RegExp(hostname, 'i'),
            type: 'printers'
        }).sort({ receivedAt: -1 });

        console.log('\n--- Detected Printers (Latest) ---');
        if (printerLogs && printerLogs.data && Array.isArray(printerLogs.data)) {
            printerLogs.data.forEach(p => {
                console.log(`- ${p.name} (${p.conn || 'Local'}) - Status: ${p.status}`);
            });
        } else {
            console.log('No printer status logs found.');
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected');
    }
}

checkData();
