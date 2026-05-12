const fs = require('fs');
const file = 'c:/Users/Admin/Downloads/hawnineprint-source/HawkNineLatest/print-monitor.js';
let content = fs.readFileSync(file, 'utf8');

// 1. Add orientation, color, pages combos to the variable declarations
const oldVars = [
    '\\$copiesEdit = \\$null',
    '            \\$printerEl = \\$null',
    '            \\$duplexCombo = \\$null',
    '            \\$paperCombo = \\$null'
].join('\n');

const newVars = [
    '\\$copiesEdit = \\$null',
    '            \\$printerEl = \\$null',
    '            \\$duplexCombo = \\$null',
    '            \\$paperCombo = \\$null',
    '            \\$orientCombo = \\$null',
    '            \\$colorCombo = \\$null',
    '            \\$pagesCombo = \\$null'
].join('\n');

if (content.includes(oldVars)) {
    content = content.replace(oldVars, newVars);
    console.log('Step 1: Added new variable declarations');
} else {
    console.log('Step 1: SKIP - vars already present or not found');
}

// 2. Add orientation, color, pages matching after Paper/Page Size
const oldMatch = "# Paper/Page Size\n                if (-not \\$paperCombo -and \\$ct -eq 'ControlType.ComboBox' -and \\$nm -match '^(Paper Size|Page Size|Document Size)\\$') {\n                    \\$paperCombo = \\$el\n                }\n            }";

const newMatch = "# Paper/Page Size\n                if (-not \\$paperCombo -and \\$ct -eq 'ControlType.ComboBox' -and \\$nm -match '^(Paper Size|Page Size|Document Size)\\$') {\n                    \\$paperCombo = \\$el\n                }\n                # Orientation\n                if (-not \\$orientCombo -and \\$ct -eq 'ControlType.ComboBox' -and \\$nm -match '^(Orientation|Page Orientation)\\$') {\n                    \\$orientCombo = \\$el\n                }\n                # Color / Grayscale\n                if (-not \\$colorCombo -and \\$ct -eq 'ControlType.ComboBox' -and \\$nm -match '^(Color|Color Mode|Output Color|Colour|Color/Grayscale)\\$') {\n                    \\$colorCombo = \\$el\n                }\n                # Pages to print\n                if (-not \\$pagesCombo -and \\$ct -eq 'ControlType.ComboBox' -and \\$nm -match '^(Print All Pages|Pages|Which pages)\\$') {\n                    \\$pagesCombo = \\$el\n                }\n            }";

if (content.includes(oldMatch)) {
    content = content.replace(oldMatch, newMatch);
    console.log('Step 2: Added orientation/color/pages matching');
} else {
    console.log('Step 2: SKIP - match block not found');
}

// 3. Replace the result block to include orientation, color, pages extraction
const oldResult = [
    '                # Paper',
    '                \\$officePaper = ""',
    '                if (\\$paperCombo) {',
    '                    try {',
    '                        \\$pv = \\$paperCombo.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)',
    '                        \\$officePaper = \\$pv.Current.Value',
    '                    } catch {}',
    '                }',
    '                ',
    '                \\$result = @{',
    '                    c = \\$copies; p = \\$printer; d = \\$appWin.Current.Name',
    '                    s = "office"; color = ""; pages = ""',
    '                    paper = if (\\$officePaper) { \\$officePaper } else { "" }',
    '                    media = ""',
    '                    orient = ""; duplex = \\$duplex; sheets = 0',
    '                    final = 0; t = (Get-Date -Format o)',
    '                }'
].join('\n');

const newResult = [
    '                # Paper',
    '                \\$officePaper = ""',
    '                if (\\$paperCombo) {',
    '                    try {',
    '                        \\$pv = \\$paperCombo.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)',
    '                        \\$officePaper = \\$pv.Current.Value',
    '                    } catch {}',
    '                }',
    '                ',
    '                # Orientation',
    '                \\$officeOrient = ""',
    '                if (\\$orientCombo) {',
    '                    try {',
    '                        \\$ov = \\$orientCombo.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)',
    '                        \\$officeOrient = \\$ov.Current.Value',
    '                    } catch {}',
    '                }',
    '                ',
    '                # Color',
    '                \\$officeColor = ""',
    '                if (\\$colorCombo) {',
    '                    try {',
    '                        \\$cv = \\$colorCombo.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)',
    '                        \\$officeColor = \\$cv.Current.Value',
    '                    } catch {}',
    '                }',
    '                ',
    '                # Pages',
    '                \\$officePages = ""',
    '                if (\\$pagesCombo) {',
    '                    try {',
    '                        \\$pgv = \\$pagesCombo.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)',
    '                        \\$officePages = \\$pgv.Current.Value',
    '                    } catch {}',
    '                }',
    '                ',
    '                \\$result = @{',
    '                    c = \\$copies; p = \\$printer; d = \\$appWin.Current.Name',
    '                    s = "office"',
    '                    color = if (\\$officeColor) { \\$officeColor } else { "" }',
    '                    pages = if (\\$officePages) { \\$officePages } else { "" }',
    '                    paper = if (\\$officePaper) { \\$officePaper } else { "" }',
    '                    media = ""',
    '                    orient = if (\\$officeOrient) { \\$officeOrient } else { "" }',
    '                    duplex = \\$duplex; sheets = 0',
    '                    final = 0; t = (Get-Date -Format o)',
    '                }'
].join('\n');

if (content.includes(oldResult)) {
    content = content.replace(oldResult, newResult);
    console.log('Step 3: Enhanced result block with orientation/color/pages');
} else {
    console.log('Step 3: SKIP - result block not found');
    // Debug: try to find nearby content
    const idx = content.indexOf('# Paper');
    if (idx > 0) {
        console.log('Found "# Paper" at index', idx);
        console.log('Nearby content:', content.slice(idx, idx + 200));
    }
}

fs.writeFileSync(file, content);
console.log('Patch complete!');
