// Test: Generate the PowerShell script and save it + run it with visible output
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// We need to get the buildScript output - require the module and extract
// Actually, let's just call runSheetsCycle but with added stderr logging
// Let's manually replicate what sheets-monitor does but with logging

// Read the sheets-monitor source and extract buildScript
const src = fs.readFileSync(path.join(__dirname, 'sheets-monitor.js'), 'utf8');

// Find buildScript function body - it returns a template literal
const startIdx = src.indexOf('function buildScript()');
const returnIdx = src.indexOf("return `\n", startIdx);
const endBacktick = src.indexOf("\n`;\n}", returnIdx + 8);

if (returnIdx === -1 || endBacktick === -1) {
    console.log('Could not extract template literal from buildScript');
    console.log('returnIdx:', returnIdx, 'endBacktick:', endBacktick);
    
    // Fallback: just require and run
    const mod = require('./sheets-monitor');
    console.log('\n[FALLBACK] Generating script via buildScript...');
    
    // Since buildScript is not exported, let's just look at the generated temp file
    // by modifying the cycle to keep the temp file
    process.exit(1);
}

// Extract the template literal content (between the backticks)  
const templateContent = src.substring(returnIdx + 9, endBacktick);

// In JS, the template literal would process escape sequences
// Let's evaluate it properly
const scriptContent = eval('`' + templateContent + '`');

// Save the generated script
const outFile = path.join(__dirname, 'debug_generated.ps1');
fs.writeFileSync(outFile, scriptContent, 'utf8');
console.log(`[DEBUG] Generated script saved to: ${outFile}`);
console.log(`[DEBUG] Script size: ${scriptContent.length} chars, ${scriptContent.split('\n').length} lines`);

// Show first few variable assignments to check escaping
const lines = scriptContent.split('\n');
console.log('\n[DEBUG] === PowerShell variable lines (checking $ escaping) ===');
let shown = 0;
for (let i = 0; i < lines.length && shown < 15; i++) {
    const line = lines[i].trim();
    if (line.match(/^\$\w+\s*=/) || line.match(/^\\\$/) || line.includes('$list') || line.includes('$excluded')) {
        console.log(`  L${i+1}: ${line}`);
        shown++;
    }
}

// Now run it and capture ALL output including errors
console.log('\n[DEBUG] === Running generated script ===');
execFile('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', outFile
], { timeout: 120000, maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
    console.log('\n[DEBUG] === EXECUTION RESULTS ===');
    if (error) {
        console.log('[DEBUG] ERROR:', error.message);
        if (error.killed) console.log('[DEBUG] Process was killed (timeout?)');
    }
    if (stderr && stderr.trim()) {
        console.log('[DEBUG] STDERR:', stderr.substring(0, 2000));
    }
    if (stdout && stdout.trim()) {
        console.log('[DEBUG] STDOUT:', stdout.substring(0, 2000));
    } else {
        console.log('[DEBUG] STDOUT: (empty - no output)');
    }
    
    // Don't delete the file so user can inspect it
    console.log(`\n[DEBUG] Script file kept at: ${outFile}`);
    console.log('[DEBUG] You can inspect it to see the generated PowerShell');
});
