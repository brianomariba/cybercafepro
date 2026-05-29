// Quick test: generate the PowerShell script from sheets-monitor and inspect it
const fs = require('fs');
const path = require('path');

// Import buildScript indirectly by requiring the module and generating the script
// We need to extract buildScript - but it's not exported. Let's read the file and extract.
const monitorSrc = fs.readFileSync(path.join(__dirname, 'sheets-monitor.js'), 'utf8');

// Find the buildScript function and get what it returns
// Easiest: just require the module and call runSheetsCycle but save the script
// Actually, let's just manually call buildScript by eval
const match = monitorSrc.match(/function buildScript\(\)\s*\{[\s\S]*?^}/m);
if (!match) {
    console.log('Could not extract buildScript function');
    process.exit(1);
}

// Execute buildScript in an isolated context
const fn = new Function(match[0] + '\nreturn buildScript();');
const script = fn();

// Save to a file for inspection
const outFile = path.join(__dirname, 'generated_sheets_script.ps1');
fs.writeFileSync(outFile, script, 'utf8');
console.log(`Generated script saved to: ${outFile}`);
console.log(`Script length: ${script.length} characters`);
console.log('');
console.log('=== First 500 chars ===');
console.log(script.substring(0, 500));
console.log('');
console.log('=== Lines with $ variables (first 20) ===');
const lines = script.split('\n');
let count = 0;
for (let i = 0; i < lines.length && count < 20; i++) {
    if (lines[i].includes('$')) {
        console.log(`  L${i+1}: ${lines[i].trimEnd()}`);
        count++;
    }
}
