const fs = require('fs');

const filePath = 'src/pages/Reports.jsx';
let content = fs.readFileSync(filePath, 'utf8');

const expSearch = `    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', \`All_Employees_Report_\${selectedDate.format('YYYY-MM-DD')}.csv\`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);`;

const expReplace = `    const csvData = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    const a = document.createElement('a');
    a.href = csvData;
    a.download = \`All_Employees_Report_\${selectedDate.format('YYYY-MM-DD')}.csv\`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);`;

content = content.replace(expSearch, expReplace);

const dnSearch = `    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', \`\${selectedEmployee.name}_Report_\${selectedDate.format('YYYY-MM-DD')}.csv\`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);`;

const dnReplace = `    const csvData = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    const a = document.createElement('a');
    a.href = csvData;
    a.download = \`\${selectedEmployee.name}_Report_\${selectedDate.format('YYYY-MM-DD')}.csv\`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);`;

content = content.replace(dnSearch, dnReplace);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Success');
