const fs = require('fs');
let code = fs.readFileSync('desktop-agent/print-monitor.js', 'utf8');
code = code.replace(/return \\\S+printerName\S+\-\S+jobId\S+\\;/g, 
  "const ds = timestamp ? new Date(timestamp).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]; return \\-\-\\;");
fs.writeFileSync('desktop-agent/print-monitor.js', code);
