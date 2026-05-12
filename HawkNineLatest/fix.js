const fs = require('fs');
let code = fs.readFileSync('print-monitor.js', 'utf8');

// Remove the Continue checks
code = code.replace(/# CANCELED JOB CHECK: Skip this job if it appears in the canceled\/deleted set[\s\S]*?if \(\$id -and \$canceledJobIds\.ContainsKey\(\[string\]\$id\)\) \{ continue \}/g, '');

// Remove the event collection blocks
code = code.replace(/# STEP 1: Build a set of CANCELED\/DELETED[\s\S]*?# STEP 2/g, '# STEP 2');
code = code.replace(/# Build canceled job IDs set[\s\S]*?catch \{\}\r?\n\r?\n\s+\$events = Get-WinEvent/g, '$events = Get-WinEvent');

fs.writeFileSync('print-monitor.js', code);
console.log("Successfully removed Event 312 cancellation logic.");
