const fs = require('fs');
const file = 'C:\\Users\\Admin\\Downloads\\hawnineprint-source\\HawkNineLatest\\print-monitor.js';
let content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');

const replacement2 = `                # Pages
                \\$officePages = ""
                if (\\$pagesEdit) {
                    try {
                        \\$pev = \\$pagesEdit.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
                        \\$officePages = \\$pev.Current.Value
                    } catch {}
                }
                if ([string]::IsNullOrWhiteSpace(\\$officePages) -and \\$pagesCombo) {
                    try {
                        \\$pgv = \\$pagesCombo.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
                        \\$officePages = \\$pgv.Current.Value
                    } catch {}
                }
                
                \\$result = @{`;

let startIndex = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('# Pages') && lines[i+1].includes('\\$officePages = ""')) {
        startIndex = i;
        break;
    }
}

let endIndex = -1;
if (startIndex !== -1) {
    for (let i = startIndex + 1; i < lines.length; i++) {
        if (lines[i].includes('\\$result = @{')) {
            endIndex = i;
            break;
        }
    }
}

if (startIndex !== -1 && endIndex !== -1) {
    let deleteCount = endIndex - startIndex + 1;
    lines.splice(startIndex, deleteCount, replacement2);
    console.log("Spliced block 2 from " + startIndex + " to " + endIndex);
    
    let newContent = lines.join('\n');
    fs.writeFileSync(file, newContent, 'utf8');
    console.log("File updated successfully.");
} else {
    console.log("Could not find start or end index for block 2");
}
