// Test the built-in sheets-monitor.js module (same code the Electron app uses)
const { runSheetsCycle } = require('./sheets-monitor');

console.log('[TEST] Running sheets-monitor cycle...');
console.log('[TEST] This will open printer dialogs offscreen and try to read Total Sheets.');
console.log('[TEST] Waiting for result...\n');

runSheetsCycle().then(results => {
    console.log('\n[TEST] === RESULTS ===');
    console.log(`[TEST] Got ${results.length} valid reading(s)`);
    
    if (results.length === 0) {
        console.log('[TEST] NO DATA RETURNED - the script failed silently!');
        console.log('[TEST] Possible causes:');
        console.log('[TEST]   1. Generated PowerShell script has syntax errors');
        console.log('[TEST]   2. No printers found');
        console.log('[TEST]   3. POI dialog did not appear');
        console.log('[TEST]   4. Total Sheets value was not readable');
    } else {
        for (const r of results) {
            console.log(`[TEST]   Printer: ${r.printerName}`);
            console.log(`[TEST]   Total Sheets: ${r.totalSheets}`);
            console.log(`[TEST]   Online: ${r.isOnline}`);
            console.log(`[TEST]   Source: ${r.source}`);
            console.log('');
        }
    }
    
    process.exit(0);
}).catch(err => {
    console.error('[TEST] ERROR:', err);
    process.exit(1);
});

// Safety timeout
setTimeout(() => {
    console.log('[TEST] TIMEOUT after 3 minutes - script hung');
    process.exit(1);
}, 180000);
