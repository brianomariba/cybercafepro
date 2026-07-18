const fs = require('fs');
let f = fs.readFileSync('server.js', 'utf8');
f = f.replace("paymentMethod: 'mpesa'", "type: 'mpesa'");
fs.writeFileSync('server.js', f);
