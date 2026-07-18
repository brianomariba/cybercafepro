const fs = require('fs');

const filePath = 'src/pages/Reports.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// Target 1: Add functions before return (
const returnStart = '  return (';
const funcsToAdd = `  const handleExportAll = () => {
    let csv = 'Employee,Revenue (KSH),Cash (KSH),M-Pesa (KSH),Products (KSH),Services (KSH),Transactions\\n';
    employeesData.forEach(e => {
        csv += \`"\${e.name}",\${e.revenueKsh},\${e.cashKsh},\${e.mpesaKsh},\${e.productsKsh},\${e.servicesKsh},\${e.txnCount}\\n\`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', \`All_Employees_Report_\${selectedDate.format('YYYY-MM-DD')}.csv\`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadReport = () => {
    if (!selectedEmployee) return;
    
    let csv = \`Employee,\${selectedEmployee.name}\\n\`;
    csv += \`Date,\${selectedDate.format('YYYY-MM-DD')}\\n\`;
    csv += \`Shift,\${selectedEmployee.shiftTime}\\n\`;
    csv += \`Status,\${selectedEmployee.status}\\n\\n\`;
    
    csv += \`Summary\\n\`;
    csv += \`Revenue,\${selectedEmployee.revenueKsh}\\n\`;
    csv += \`Cash Collected,\${selectedEmployee.cashKsh}\\n\`;
    csv += \`Mpesa Collected,\${selectedEmployee.mpesaKsh}\\n\`;
    csv += \`Products Sold,\${selectedEmployee.productsKsh}\\n\`;
    csv += \`Services Revenue,\${selectedEmployee.servicesKsh}\\n\`;
    csv += \`Transactions,\${selectedEmployee.txnCount}\\n\`;
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', \`\${selectedEmployee.name}_Report_\${selectedDate.format('YYYY-MM-DD')}.csv\`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (`;

if (content.includes('const handleDownloadReport')) {
    console.log('Already patched');
    process.exit(0);
}

content = content.replace(returnStart, funcsToAdd);

// Target 2: Fix Export All button onClick
const exportBtnSearch = `<Button type="primary" icon={<DownloadOutlined />} className="btn-export" onClick={fetchData}>`;
const exportBtnReplace = `<Button type="primary" icon={<DownloadOutlined />} className="btn-export" onClick={handleExportAll}>`;
content = content.replace(exportBtnSearch, exportBtnReplace);

// Target 3: Fix Download Report button onClick
const downloadBtnSearch = `<Button icon={<DownloadOutlined />} className="btn-download">`;
const downloadBtnReplace = `<Button icon={<DownloadOutlined />} className="btn-download" onClick={handleDownloadReport}>`;
content = content.replace(downloadBtnSearch, downloadBtnReplace);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Success');
