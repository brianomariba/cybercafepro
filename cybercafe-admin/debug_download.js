
const fs = require('fs');

const filePath = 'src/pages/Reports.jsx';
let content = fs.readFileSync(filePath, 'utf8');

const tSearch = '  const handleDownloadReport = () => {\\n    if (!selectedEmployee) return;\\n    ';
const tReplace = \  const handleDownloadReport = () => {
    if (!selectedEmployee) return;
    try {\;

const endSearch = \    document.body.removeChild(a);\\n  };\;
const endReplace = \    document.body.removeChild(a);
    } catch(err) {
        alert('Download Error: ' + err.message);
        console.error(err);
    }
  };\;

if(content.includes(tSearch)) {
    content = content.replace(tSearch, tReplace);
    content = content.replace(endSearch, endReplace);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Patched');
} else {
    console.log('Not found');
}

