const fs = require('fs');
const filePath = 'c:/Users/Admin/OneDrive/Desktop/HawkNine/desktop-agent/print-monitor.js';
let txt = fs.readFileSync(filePath, 'utf8');
let lines = txt.split('\n');

// Find the corrupted region: lines 3285-3320 (0-indexed: 3284-3319)
// The correct content should be: Pages block + result block + caching block
// Replace lines 3285 through 3320 with corrected content

const correctLines = [
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
'                }',
'                # Cache element references for fast polling',
'                \\$cachedCopiesEl = \\$copiesEdit',
'                \\$cachedPrinterEl = \\$printerEl',
'                \\$cachedDuplexEl = \\$duplexCombo',
'                \\$cachedPaperEl = \\$paperCombo',
'                \\$cachedOrientEl = \\$orientCombo',
'                \\$cachedColorEl = \\$colorCombo',
'                \\$cachedPagesEl = \\$pagesCombo',
'                \\$cachedAppWin = \\$appWin',
'                \\$cachedPid = \\$p.Id',
'                \\$lastFullScan = \\$now',
];

// Replace lines 3285-3320 (0-indexed: 3284-3319)
lines.splice(3284, 3320 - 3285 + 1, ...correctLines);

fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
console.log('Fixed escaping in lines 3285-3320');
