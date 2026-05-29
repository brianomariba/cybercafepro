const fs = require('fs');
let code = fs.readFileSync('desktop-agent/print-monitor.js', 'utf8');
const search = "return \\$\{printerName\}-\$\{jobId\}\;";
const replacement = "const ds = timestamp ? new Date(timestamp).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]; return \\-\-\\;";
code = code.replace(search, replacement);
fs.writeFileSync('desktop-agent/print-monitor.js', code);
