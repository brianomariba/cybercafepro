const { runSheetsCycle } = require('./desktop-agent/sheets-monitor.js');

console.log('Testing EPSON Hardware Counter Extraction...');
runSheetsCycle().then(results => {
    console.log('====================================');
    console.log('RESULTS FROM PRINTER:');
    console.log(JSON.stringify(results, null, 2));
    console.log('====================================');
    
    if (results.length === 0) {
        console.log('ERROR: No printers returned data. The dialog might be stuck or the printer is offline.');
    }
}).catch(e => {
    console.error('Fatal Error:', e);
});
