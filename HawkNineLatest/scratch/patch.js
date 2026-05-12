const fs = require('fs');
const file = 'C:\\Users\\Admin\\Downloads\\hawnineprint-source\\HawkNineLatest\\print-monitor.js';
let content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');

const replacement1 = `\\$officeCache = @{}

while (\\$true) {
    Start-Sleep -Milliseconds 50
    \\$result = \\$null

    # === METHOD 1: Office Backstage (Word, Excel, PowerPoint) ===
    \\$officeProcs = Get-Process WINWORD,EXCEL,POWERPNT -ErrorAction SilentlyContinue
    
    # Prune dead processes from cache
    if (\\$officeProcs) {
        \\$activePids = \\$officeProcs | Select-Object -ExpandProperty Id
        \\$deadPids = @()
        foreach (\\$k in \\$officeCache.Keys) {
            if (\\$activePids -notcontains \\$k) { \\$deadPids += \\$k }
        }
        foreach (\\$k in \\$deadPids) { \\$officeCache.Remove(\\$k) }
    } else {
        \\$officeCache.Clear()
    }

    foreach (\\$p in \\$officeProcs) {
        try {
            \\$pid = \\$p.Id
            \\$cache = \\$null
            if (\\$officeCache.ContainsKey(\\$pid)) {
                \\$cache = \\$officeCache[\\$pid]
                try {
                    # Fast check if window is still alive
                    \\$cache.appWin.Current.ProcessId | Out-Null
                    # Verify elements are still valid (throws if dialog closed)
                    if (\\$cache.copiesEdit) { \\$cache.copiesEdit.Current.IsEnabled | Out-Null }
                    elseif (\\$cache.printerEl) { \\$cache.printerEl.Current.IsEnabled | Out-Null }
                } catch {
                    \\$officeCache.Remove(\\$pid)
                    \\$cache = \\$null
                }
            }

            if (-not \\$cache) {
                \\$pidCond = New-Object System.Windows.Automation.PropertyCondition(
                    [System.Windows.Automation.AutomationElement]::ProcessIdProperty, \\$pid)
                \\$appWin = \\$root.FindFirst([System.Windows.Automation.TreeScope]::Children, \\$pidCond)
                if (-not \\$appWin) { continue }

                \\$tcEdit = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)
                \\$tcSpin = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Spinner)
                \\$tcCombo = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::ComboBox)
                \\$condArr = [System.Windows.Automation.Condition[]]@(\\$tcEdit, \\$tcSpin, \\$tcCombo)
                \\$orCond = New-Object System.Windows.Automation.OrCondition(\\$condArr)

                \\$allControls = \\$appWin.FindAll([System.Windows.Automation.TreeScope]::Descendants, \\$orCond)

                \\$copiesEdit = \\$null
                \\$printerEl = \\$null
                \\$duplexCombo = \\$null
                \\$paperCombo = \\$null
                \\$orientCombo = \\$null
                \\$colorCombo = \\$null
                \\$pagesCombo = \\$null
                \\$pagesEdit = \\$null
                
                foreach (\\$el in \\$allControls) {
                    \\$nm = \\$el.Current.Name
                    \\$ct = \\$el.Current.ControlType.ProgrammaticName
                    
                    # Copies
                    if (-not \\$copiesEdit -and \\$nm -match '^(Copies|Copies:|Number of copies|Number of Copies:|Number of copies:)$') {
                        \\$copiesEdit = \\$el
                    }
                    # Printer
                    if (-not \\$printerEl -and \\$ct -eq 'ControlType.ComboBox' -and \\$nm -match '^(Which Printer|Printer|Active Printer|Printer:)$') {
                        \\$printerEl = \\$el
                    }
                    # Duplex
                    if (-not \\$duplexCombo -and \\$ct -eq 'ControlType.ComboBox' -and \\$nm -match '^(Two-Sided Printing|Print on Both Sides|Duplex|2-Sided Printing)$') {
                        \\$duplexCombo = \\$el
                    }
                    # Paper/Page Size
                    if (-not \\$paperCombo -and \\$ct -eq 'ControlType.ComboBox' -and \\$nm -match '^(Paper Size|Page Size|Document Size)$') {
                        \\$paperCombo = \\$el
                    }
                    # Orientation
                    if (-not \\$orientCombo -and \\$ct -eq 'ControlType.ComboBox' -and \\$nm -match '^(Orientation|Page Orientation)$') {
                        \\$orientCombo = \\$el
                    }
                    # Color / Grayscale
                    if (-not \\$colorCombo -and \\$ct -eq 'ControlType.ComboBox' -and \\$nm -match '^(Color|Color Mode|Output Color|Colour|Color/Grayscale)$') {
                        \\$colorCombo = \\$el
                    }
                    # Pages to print
                    if (-not \\$pagesCombo -and \\$ct -eq 'ControlType.ComboBox' -and \\$nm -match '^(Print All Pages|Pages|Which pages|Pages:)$') {
                        \\$pagesCombo = \\$el
                    }
                    # Pages Edit (Custom pages)
                    if (-not \\$pagesEdit -and \\$ct -eq 'ControlType.Edit' -and \\$nm -match '^(Pages|Pages:|Which pages)$') {
                        \\$pagesEdit = \\$el
                    }
                }
                
                # Fallback for plain number named edits (copies)
                if (-not \\$copiesEdit) {
                    foreach (\\$el in \\$allControls) {
                        if (\\$el.Current.ControlType.ProgrammaticName -eq 'ControlType.Edit' -and \\$el.Current.Name -match '^\\\\d{1,3}$') {
                            \\$copiesEdit = \\$el
                            break
                        }
                    }
                }

                if (\\$printerEl -or \\$copiesEdit) {
                    \\$cache = @{
                        appWin = \\$appWin
                        copiesEdit = \\$copiesEdit
                        printerEl = \\$printerEl
                        duplexCombo = \\$duplexCombo
                        paperCombo = \\$paperCombo
                        orientCombo = \\$orientCombo
                        colorCombo = \\$colorCombo
                        pagesCombo = \\$pagesCombo
                        pagesEdit = \\$pagesEdit
                    }
                    \\$officeCache[\\$pid] = \\$cache
                }
            }

            if (\\$cache) {
                \\$copiesEdit = \\$cache.copiesEdit
                \\$printerEl = \\$cache.printerEl
                \\$duplexCombo = \\$cache.duplexCombo
                \\$paperCombo = \\$cache.paperCombo
                \\$orientCombo = \\$cache.orientCombo
                \\$colorCombo = \\$cache.colorCombo
                \\$pagesCombo = \\$cache.pagesCombo
                \\$pagesEdit = \\$cache.pagesEdit
                \\$appWin = \\$cache.appWin`;

// Find index of `while (\$true) {`
let startIndex = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('while (\\$true) {')) {
        startIndex = i;
        break;
    }
}

let endIndex = -1;
if (startIndex !== -1) {
    for (let i = startIndex + 1; i < lines.length; i++) {
        if (lines[i].includes('if (\\$copiesEdit) {')) {
            // we want to replace up to the line right before `if ($copiesEdit) {`
            endIndex = i - 1;
            break;
        }
    }
}

if (startIndex !== -1 && endIndex !== -1) {
    let deleteCount = endIndex - startIndex + 1;
    lines.splice(startIndex, deleteCount, replacement1);
    console.log("Spliced block 1 from " + startIndex + " to " + endIndex);
} else {
    console.log("Could not find start or end index for block 1");
}

let newContent = lines.join('\n');
fs.writeFileSync(file, newContent, 'utf8');
console.log("File updated successfully.");
