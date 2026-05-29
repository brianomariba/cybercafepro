// Test: Run the fixed sheets-monitor with full stderr/stdout capture
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Generate the script using the fixed buildScript
const sm = require('./sheets-monitor');

// We can't access buildScript directly, so let's manually build and run
// Actually, let's just call runSheetsCycle and also check what printers exist
console.log('[TEST] Checking available printers first...');

execFile('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-Command', "Get-Printer | Select-Object Name, DriverName, PortName | Format-Table -AutoSize | Out-String -Width 200"
], { timeout: 15000 }, (err, stdout, stderr) => {
    if (err) {
        console.log('[TEST] Get-Printer error:', err.message);
    }
    if (stderr) console.log('[TEST] Get-Printer stderr:', stderr);
    console.log('[TEST] Printers found:');
    console.log(stdout || '(none)');

    // Now run the actual sheets monitor cycle
    console.log('\n[TEST] Running runSheetsCycle()...');
    sm.runSheetsCycle().then(results => {
        console.log(`[TEST] Results: ${results.length} valid readings`);
        if (results.length > 0) {
            for (const r of results) {
                console.log(`  ${r.printerName}: ${r.totalSheets} sheets (online: ${r.isOnline})`);
            }
        } else {
            console.log('[TEST] No valid readings. Checking generated script output...');
            // Let's run the script manually with visible output
            const lines = buildScriptFixed();
            const tmpFile = path.join(os.tmpdir(), 'hawknine_test_debug.ps1');
            fs.writeFileSync(tmpFile, lines, 'utf8');
            console.log(`[TEST] Script saved to: ${tmpFile}`);
            
            execFile('powershell.exe', [
                '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
                '-File', tmpFile
            ], { timeout: 120000, maxBuffer: 1024 * 1024 * 5 }, (error, stdout2, stderr2) => {
                console.log('\n[TEST] === Direct script execution ===');
                if (error) console.log('[TEST] ERROR:', error.message);
                if (stderr2) console.log('[TEST] STDERR:', stderr2.substring(0, 1000));
                console.log('[TEST] STDOUT:', stdout2 ? stdout2.substring(0, 1000) : '(empty)');
                try { fs.unlinkSync(tmpFile); } catch(e) {}
                process.exit(0);
            });
        }
    });
});

function buildScriptFixed() {
    // Minimal test: just get printers and output JSON
    return `
$excluded = 'Microsoft|OneNote|PDF|XPS|Fax|Send To|Snagit|Adobe|Remote'
$list = @()
try { $list = @(Get-Printer | Where-Object { $_.Name -notmatch $excluded }) } catch {}
Write-Host "Found $($list.Count) printer(s) after filtering"
foreach ($p in $list) { Write-Host "  Printer: $($p.Name)" }
if ($list.Count -eq 0) { "[]"; exit }
$results = @()
foreach ($p in $list) {
    $results += @{ printerName = $p.Name; totalSheets = $null; source = "test" }
}
$results | ConvertTo-Json -Depth 3
`;
}

setTimeout(() => { console.log('[TEST] TIMEOUT'); process.exit(1); }, 120000);
