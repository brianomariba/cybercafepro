const fs = require('fs');
let code = fs.readFileSync('desktop-agent/main.js', 'utf8');

code = code.replace(/color: data\.color \|\| '',/g, "color: data.color || (existing ? existing.color : ''),");
code = code.replace(/pages: data\.pages \|\| '',/g, "pages: data.pages || (existing ? existing.pages : ''),");
code = code.replace(/paperSize: data\.paperSize \|\| '',/g, "paperSize: data.paperSize || (existing ? existing.paperSize : ''),");
code = code.replace(/mediaType: data\.mediaType \|\| '',/g, "mediaType: data.mediaType || (existing ? existing.mediaType : ''),");
code = code.replace(/duplex: data\.duplex \|\| '',/g, "duplex: data.duplex || (existing ? existing.duplex : ''),");

fs.writeFileSync('desktop-agent/main.js', code);
