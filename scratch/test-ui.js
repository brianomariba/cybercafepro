const monitor = require('../desktop-agent/print-monitor');

console.log("Starting UI Monitor. Please open the Word Print Dialog, set copies to 2, and wait 5 seconds...");

monitor.startPrintDialogMonitor((data) => {
    console.log("CAPTURED_UI_DATA:", JSON.stringify(data, null, 2));
    process.exit(0);
});

// Timeout after 30 seconds
setTimeout(() => {
    console.log("Timeout reached.");
    process.exit(1);
}, 30000);
