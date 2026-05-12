const fs = require('fs');

const file = 'c:/Users/Admin/Downloads/hawnineprint-source/HawkNineLatest/print-monitor.js';
let content = fs.readFileSync(file, 'utf8');

const newFunc = `function startPrintDialogMonitor(onDataCaptured) {
    const { spawn } = require('child_process');
    let running = true;
    let proc = null;

    const psScript = \`
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class DlgReader {
    [DllImport("user32.dll")]
    public static extern IntPtr FindWindow(string className, string windowName);
    [DllImport("user32.dll")]
    public static extern IntPtr GetDlgItem(IntPtr hDlg, int nIDDlgItem);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int SendMessage(IntPtr hWnd, int msg, int wParam, StringBuilder lParam);
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
}
"@

\\$root = [System.Windows.Automation.AutomationElement]::RootElement
\\$lastJson = ""
\\$dialogWasOpen = \\$false
\\$lastResult = \\$null

function Find-UIValue(\\$parent, \\$name) {
    try {
        \\$cond = New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::NameProperty, \\$name)
        \\$els = \\$parent.FindAll([System.Windows.Automation.TreeScope]::Descendants, \\$cond)
        foreach (\\$el in \\$els) {
            \\$ct = \\$el.Current.ControlType.ProgrammaticName
            if (\\$ct -eq 'ControlType.Text') { continue }
            try {
                \\$vp = \\$el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
                return \\$vp.Current.Value
            } catch {}
        }
    } catch {}
    return \\$null
}

function Find-UIText(\\$parent, \\$pattern) {
    try {
        \\$all = \\$parent.FindAll([System.Windows.Automation.TreeScope]::Descendants,
            [System.Windows.Automation.Condition]::TrueCondition)
        foreach (\\$el in \\$all) {
            try {
                \\$n = \\$el.Current.Name
                if (\\$n -match \\$pattern) { return \\$n }
            } catch {}
        }
    } catch {}
    return \\$null
}

while (\\$true) {
    Start-Sleep -Milliseconds 150
    \\$result = \\$null

    # === METHOD 1: Office Backstage (Word, Excel, PowerPoint) ===
    \\$officeProcs = Get-Process WINWORD,EXCEL,POWERPNT -ErrorAction SilentlyContinue
    foreach (\\$p in \\$officeProcs) {
        try {
            \\$pidCond = New-Object System.Windows.Automation.PropertyCondition(
                [System.Windows.Automation.AutomationElement]::ProcessIdProperty, \\$p.Id)
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
            
            foreach (\\$el in \\$allControls) {
                \\$nm = \\$el.Current.Name
                \\$ct = \\$el.Current.ControlType.ProgrammaticName
                
                # Copies
                if (-not \\$copiesEdit -and \\$nm -match '^(Copies|Copies:|Number of copies|Number of Copies:|Number of copies:)\\$') {
                    \\$copiesEdit = \\$el
                }
                # Printer
                if (-not \\$printerEl -and \\$ct -eq 'ControlType.ComboBox' -and \\$nm -match '^(Which Printer|Printer|Active Printer|Printer:)\\$') {
                    \\$printerEl = \\$el
                }
                # Duplex
                if (-not \\$duplexCombo -and \\$ct -eq 'ControlType.ComboBox' -and \\$nm -match '^(Two-Sided Printing|Print on Both Sides|Duplex|2-Sided Printing)\\$') {
                    \\$duplexCombo = \\$el
                }
                # Paper/Page Size
                if (-not \\$paperCombo -and \\$ct -eq 'ControlType.ComboBox' -and \\$nm -match '^(Paper Size|Page Size|Document Size)\\$') {
                    \\$paperCombo = \\$el
                }
                # Orientation
                if (-not \\$orientCombo -and \\$ct -eq 'ControlType.ComboBox' -and \\$nm -match '^(Orientation|Page Orientation)\\$') {
                    \\$orientCombo = \\$el
                }
                # Color / Grayscale
                if (-not \\$colorCombo -and \\$ct -eq 'ControlType.ComboBox' -and \\$nm -match '^(Color|Color Mode|Output Color|Colour|Color/Grayscale)\\$') {
                    \\$colorCombo = \\$el
                }
                # Pages to print
                if (-not \\$pagesCombo -and \\$ct -eq 'ControlType.ComboBox' -and \\$nm -match '^(Print All Pages|Pages|Which pages|Pages:)\\$') {
                    \\$pagesCombo = \\$el
                }
            }
            
            # Fallback for plain number named edits (copies)
            if (-not \\$copiesEdit) {
                foreach (\\$el in \\$allControls) {
                    if (\\$el.Current.ControlType.ProgrammaticName -eq 'ControlType.Edit' -and \\$el.Current.Name -match '^\\d{1,3}\\$') {
                        \\$copiesEdit = \\$el
                        break
                    }
                }
            }

            if (\\$copiesEdit) {
                \\$copies = 1
                \\$valStr = ""
                try {
                    \\$valP = \\$copiesEdit.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
                    \\$valStr = \\$valP.Current.Value
                } catch {}
                
                if ([string]::IsNullOrWhiteSpace(\\$valStr) -or \\$valStr -eq '0') {
                    try {
                        \\$rvp = \\$copiesEdit.GetCurrentPattern([System.Windows.Automation.RangeValuePattern]::Pattern)
                        \\$valStr = [string](\\$rvp.Current.Value)
                    } catch {}
                }
                
                if ([string]::IsNullOrWhiteSpace(\\$valStr) -or \\$valStr -eq '0') {
                    try {
                        \\$nmVal = \\$copiesEdit.Current.Name
                        if (\\$nmVal -match '^\\d+\\$') {
                            \\$valStr = \\$nmVal
                        }
                    } catch {}
                }

                if (-not [string]::IsNullOrWhiteSpace(\\$valStr)) {
                    \\$valStr = \\$valStr.Replace(',', '.')
                    try { \\$copies = [int][Math]::Round([double]\\$valStr) } catch {}
                }
                if (\\$copies -le 0) { \\$copies = 1 }

                # Printer Name
                \\$printer = ""
                if (\\$printerEl) {
                    try {
                        \\$pv = \\$printerEl.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
                        \\$printer = \\$pv.Current.Value
                    } catch {
                        try {
                            \\$sp = \\$printerEl.GetCurrentPattern([System.Windows.Automation.SelectionPattern]::Pattern)
                            \\$sel = \\$sp.Current.GetSelection()
                            if (\\$sel -and \\$sel.Length -gt 0) { \\$printer = \\$sel[0].Current.Name }
                        } catch {}
                    }
                }
                
                # Fallback: scan tree for printer brands if ComboBox wasn't found
                if (-not \\$printer) {
                    try {
                        \\$allEls2 = \\$appWin.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
                        foreach (\\$el2 in \\$allEls2) {
                            \\$n2 = \\$el2.Current.Name
                            if (\\$n2 -and \\$n2.Length -gt 4 -and \\$n2 -match '(?i)(EPSON|Canon|HP\\s|Brother|Xerox|Ricoh|Samsung|Lexmark).*Series') {
                                \\$printer = \\$n2
                                break
                            }
                        }
                    } catch {}
                }

                # Duplex
                \\$duplex = ""
                if (\\$duplexCombo) {
                    try {
                        \\$dv = \\$duplexCombo.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
                        \\$duplex = \\$dv.Current.Value
                    } catch {}
                }
                
                # Paper
                \\$officePaper = ""
                if (\\$paperCombo) {
                    try {
                        \\$pv = \\$paperCombo.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
                        \\$officePaper = \\$pv.Current.Value
                    } catch {}
                }
                
                # Orientation
                \\$officeOrient = ""
                if (\\$orientCombo) {
                    try {
                        \\$ov = \\$orientCombo.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
                        \\$officeOrient = \\$ov.Current.Value
                    } catch {}
                }
                
                # Color
                \\$officeColor = ""
                if (\\$colorCombo) {
                    try {
                        \\$cv = \\$colorCombo.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
                        \\$officeColor = \\$cv.Current.Value
                    } catch {}
                }
                
                # Pages
                \\$officePages = ""
                if (\\$pagesCombo) {
                    try {
                        \\$pgv = \\$pagesCombo.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
                        \\$officePages = \\$pgv.Current.Value
                    } catch {}
                }
                
                \\$result = @{
                    c = \\$copies; p = \\$printer; d = \\$appWin.Current.Name
                    s = "office"
                    color = if (\\$officeColor) { \\$officeColor } else { "" }
                    pages = if (\\$officePages) { \\$officePages } else { "" }
                    paper = if (\\$officePaper) { \\$officePaper } else { "" }
                    media = ""
                    orient = if (\\$officeOrient) { \\$officeOrient } else { "" }
                    duplex = \\$duplex; sheets = 0
                    final = 0; t = (Get-Date -Format o)
                }
            }
        } catch {}
    }

    # === METHOD 2: Chrome/Edge Print Dialog (Ctrl+P) ===
    if (-not \\$result) {
        \\$browserProcs = Get-Process chrome,msedge -ErrorAction SilentlyContinue
        foreach (\\$p in (\\$browserProcs | Select-Object -Unique Id)) {
            try {
                \\$pidCond = New-Object System.Windows.Automation.PropertyCondition(
                    [System.Windows.Automation.AutomationElement]::ProcessIdProperty, \\$p.Id)
                \\$wins = \\$root.FindAll([System.Windows.Automation.TreeScope]::Children, \\$pidCond)
                foreach (\\$win in \\$wins) {
                    if (-not \\$win.Current.Name -or \\$win.Current.Name.Length -lt 2) { continue }

                    \\$copiesCond = New-Object System.Windows.Automation.PropertyCondition(
                        [System.Windows.Automation.AutomationElement]::NameProperty, "Copies")
                    \\$spinnerCond = New-Object System.Windows.Automation.PropertyCondition(
                        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
                        [System.Windows.Automation.ControlType]::Spinner)
                    \\$andCond = New-Object System.Windows.Automation.AndCondition(\\$copiesCond, \\$spinnerCond)
                    \\$copiesSpinner = \\$win.FindFirst(
                        [System.Windows.Automation.TreeScope]::Descendants, \\$andCond)

                    if (\\$copiesSpinner) {
                        \\$copies = 1
                        try {
                            \\$vp = \\$copiesSpinner.GetCurrentPattern(
                                [System.Windows.Automation.ValuePattern]::Pattern)
                            \\$copies = [int]\\$vp.Current.Value
                        } catch {}

                        \\$printer = Find-UIValue \\$win "Destination"
                        \\$color = Find-UIValue \\$win "Color"
                        \\$pages = Find-UIValue \\$win "Pages"
                        \\$layout = Find-UIValue \\$win "Layout"
                        \\$paper = Find-UIValue \\$win "Paper size"
                        # Media/paper type (e.g. Epson Ultra Glossy, Plain paper)
                        \\$media = Find-UIValue \\$win "Media type"
                        if (-not \\$media) { \\$media = Find-UIValue \\$win "Paper type" }
                        if (-not \\$media) { \\$media = Find-UIValue \\$win "Media" }
                        \\$sheetsText = Find-UIText \\$win 'sheet.*paper'
                        \\$sheets = 0
                        if (\\$sheetsText -match '(\\d+)\\s+sheet') { \\$sheets = [int]\\$Matches[1] }

                        \\$result = @{
                            c = \\$copies
                            p = if (\\$printer) { \\$printer } else { "" }
                            d = \\$win.Current.Name
                            s = "browser"
                            color = if (\\$color) { \\$color } else { "" }
                            pages = if (\\$pages) { \\$pages } else { "" }
                            paper = if (\\$paper) { \\$paper } else { "" }
                            media = if (\\$media) { \\$media } else { "" }
                            orient = if (\\$layout) { \\$layout } else { "" }
                            duplex = ""; sheets = \\$sheets
                            final = 0; t = (Get-Date -Format o)
                        }
                        break
                    }
                }
                if (\\$result) { break }
            } catch {}
        }
    }

    # === METHOD 3: Adobe Reader/Acrobat ===
    if (-not \\$result) {
        \\$adobeProcs = Get-Process AcroRd32,Acrobat -ErrorAction SilentlyContinue
        foreach (\\$p in \\$adobeProcs) {
            try {
                \\$pidCond = New-Object System.Windows.Automation.PropertyCondition(
                    [System.Windows.Automation.AutomationElement]::ProcessIdProperty, \\$p.Id)
                \\$wins = \\$root.FindAll([System.Windows.Automation.TreeScope]::Children, \\$pidCond)
                foreach (\\$win in \\$wins) {
                    if (\\$win.Current.Name -match '[Pp]rint') {
                        \\$copies = Find-UIValue \\$win "Copies"
                        if (\\$copies) {
                            \\$printer = Find-UIValue \\$win "Printer"
                            \\$color = Find-UIValue \\$win "Color"
                            \\$paper = Find-UIValue \\$win "Paper Size"
                            \\$pages = Find-UIValue \\$win "Pages"
                            \\$media = Find-UIValue \\$win "Media type"
                            if (-not \\$media) { \\$media = Find-UIValue \\$win "Paper type" }

                            \\$result = @{
                                c = [int]\\$copies
                                p = if (\\$printer) { \\$printer } else { "" }
                                d = \\$win.Current.Name
                                s = "adobe"; color = if (\\$color) { \\$color } else { "" }
                                pages = if (\\$pages) { \\$pages } else { "" }
                                paper = if (\\$paper) { \\$paper } else { "" }
                                media = if (\\$media) { \\$media } else { "" }
                                orient = ""; duplex = ""; sheets = 0
                                final = 0; t = (Get-Date -Format o)
                            }
                        }
                    }
                }
            } catch {}
        }
    }

    # === METHOD 4: Standard Windows Print Dialog (#32770) ===
    if (-not \\$result) {
        try {
            \\$dlg = [DlgReader]::FindWindow("#32770", \\$null)
            if (\\$dlg -ne [IntPtr]::Zero -and [DlgReader]::IsWindowVisible(\\$dlg)) {
                \\$copiesCtrl = [DlgReader]::GetDlgItem(\\$dlg, 1154)
                if (\\$copiesCtrl -ne [IntPtr]::Zero) {
                    \\$sb = New-Object System.Text.StringBuilder 20
                    [DlgReader]::SendMessage(\\$copiesCtrl, 0x000D, 20, \\$sb) | Out-Null
                    \\$copies = 0
                    if ([int]::TryParse(\\$sb.ToString(), [ref]\\$copies) -and \\$copies -gt 0) {
                        \\$titleSb = New-Object System.Text.StringBuilder 256
                        [DlgReader]::GetWindowText(\\$dlg, \\$titleSb, 256) | Out-Null

                        \\$result = @{
                            c = \\$copies; p = ""; d = \\$titleSb.ToString()
                            s = "win32_dialog"; color = ""; pages = ""
                            paper = ""; media = ""; orient = ""; duplex = ""; sheets = 0
                            final = 0; t = (Get-Date -Format o)
                        }
                    }
                }
            }
        } catch {}
    }

    # === METHOD 5: Printer Driver Properties/Preferences Dialog ===
    # (e.g. "EPSON L3150 Series Properties" opened from Word or system dialog)
    # This dialog has Paper Type, Color, Copies, Quality, Document Size, etc.
    if (-not \\$result) {
        try {
            \\$allWins = \\$root.FindAll([System.Windows.Automation.TreeScope]::Children,
                [System.Windows.Automation.Condition]::TrueCondition)
            foreach (\\$win in \\$allWins) {
                \\$wName = \\$win.Current.Name
                if (\\$wName -match '(Properties|Preferences)' -and \\$wName -match '(Printer|EPSON|Canon|HP|Brother|Xerox|Ricoh|Samsung|Lexmark|Series)') {
                    # Found a printer properties dialog
                    \\$media = Find-UIValue \\$win "Paper Type"
                    if (-not \\$media) { \\$media = Find-UIValue \\$win "Media Type" }
                    \\$color = ""
                    \\$copies = ""
                    \\$paper = ""
                    \\$quality = ""
                    \\$duplex = ""
                    \\$orient = ""

                    # Color: check radio buttons
                    try {
                        \\$colorCond = New-Object System.Windows.Automation.PropertyCondition(
                            [System.Windows.Automation.AutomationElement]::NameProperty, "Color")
                        \\$colorEls = \\$win.FindAll([System.Windows.Automation.TreeScope]::Descendants, \\$colorCond)
                        foreach (\\$ce in \\$colorEls) {
                            if (\\$ce.Current.ControlType.ProgrammaticName -eq 'ControlType.RadioButton') {
                                try {
                                    \\$si = \\$ce.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
                                    if (\\$si.Current.IsSelected) { \\$color = "Color" }
                                } catch {}
                            }
                        }
                        \\$gsCond = New-Object System.Windows.Automation.PropertyCondition(
                            [System.Windows.Automation.AutomationElement]::NameProperty, "Grayscale")
                        \\$gsEls = \\$win.FindAll([System.Windows.Automation.TreeScope]::Descendants, \\$gsCond)
                        foreach (\\$ge in \\$gsEls) {
                            if (\\$ge.Current.ControlType.ProgrammaticName -eq 'ControlType.RadioButton') {
                                try {
                                    \\$si = \\$ge.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
                                    if (\\$si.Current.IsSelected) { \\$color = "Grayscale" }
                                } catch {}
                            }
                        }
                    } catch {}

                    \\$copies = Find-UIValue \\$win "Copies"
                    \\$paper = Find-UIValue \\$win "Document Size"
                    \\$quality = Find-UIValue \\$win "Quality"
                    \\$duplex = Find-UIValue \\$win "2-Sided Printing"

                    # Orientation radio buttons
                    try {
                        \\$pCond = New-Object System.Windows.Automation.PropertyCondition(
                            [System.Windows.Automation.AutomationElement]::NameProperty, "Portrait")
                        \\$pEls = \\$win.FindAll([System.Windows.Automation.TreeScope]::Descendants, \\$pCond)
                        foreach (\\$pe in \\$pEls) {
                            if (\\$pe.Current.ControlType.ProgrammaticName -eq 'ControlType.RadioButton') {
                                try {
                                    \\$si = \\$pe.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
                                    if (\\$si.Current.IsSelected) { \\$orient = "Portrait" }
                                } catch {}
                            }
                        }
                        \\$lCond = New-Object System.Windows.Automation.PropertyCondition(
                            [System.Windows.Automation.AutomationElement]::NameProperty, "Landscape")
                        \\$lEls = \\$win.FindAll([System.Windows.Automation.TreeScope]::Descendants, \\$lCond)
                        foreach (\\$le in \\$lEls) {
                            if (\\$le.Current.ControlType.ProgrammaticName -eq 'ControlType.RadioButton') {
                                try {
                                    \\$si = \\$le.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
                                    if (\\$si.Current.IsSelected) { \\$orient = "Landscape" }
                                } catch {}
                            }
                        }
                    } catch {}

                    # Extract printer name from dialog title (e.g. "EPSON L3150 Series Properties" -> "EPSON L3150 Series")
                    \\$printerFromTitle = \\$wName -replace '\\s*(Properties|Preferences).*\\$', ''

                    if (\\$media -or \\$color -or \\$copies) {
                        \\$copiesInt = 1
                        if (\\$copies) { try { \\$copiesInt = [int]\\$copies } catch {} }

                        \\$result = @{
                            c = \\$copiesInt
                            p = \\$printerFromTitle
                            d = ""
                            s = "driver_props"
                            color = if (\\$color) { \\$color } else { "" }
                            pages = ""
                            paper = if (\\$paper) { \\$paper } else { "" }
                            media = if (\\$media) { \\$media } else { "" }
                            orient = \\$orient
                            duplex = if (\\$duplex) { \\$duplex } else { "" }
                            sheets = 0
                            final = 0; t = (Get-Date -Format o)
                        }
                    }
                }
            }
        } catch {}
    }

    # === DIALOG STATE TRACKING ===
    # Track open/close transitions to detect when user clicks Print or Cancel
    if (\\$result) {
        # Dialog IS open - continuously update with latest values
        \\$dialogWasOpen = \\$true
        \\$lastResult = \\$result

        # Output update (continuously)
        \\$json = \\$result | ConvertTo-Json -Compress
        Write-Output \\$json
        [Console]::Out.Flush()
        \\$lastJson = \\$json
    } else {
        # Dialog is NOT open (or not found)
        if (\\$dialogWasOpen -and \\$lastResult) {
            # Dialog JUST CLOSED - user clicked Print or Cancel
            # Output final values with final=1 flag
            \\$lastResult.final = 1
            \\$lastResult.t = (Get-Date -Format o)
            \\$finalJson = \\$lastResult | ConvertTo-Json -Compress
            Write-Output \\$finalJson
            [Console]::Out.Flush()

            \\$dialogWasOpen = \\$false
            \\$lastResult = \\$null
            \\$lastJson = ""
        }
    }
}
\`;

    try {
        proc = spawn('powershell.exe', [
            '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
            '-Command', psScript
        ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });

        let buffer = '';
        proc.stdout.on('data', (data) => {
            buffer += data.toString();
            const lines = buffer.split('\\n');
            buffer = lines.pop();

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('{')) continue;
                try {
                    const parsed = JSON.parse(trimmed);
                    if (parsed.c && parsed.c > 0) {
                        const isFinal = parsed.final === 1;
                        const result = {
                            copies: parsed.c,
                            printer: parsed.p || '',
                            document: parsed.d || '',
                            source: parsed.s || 'unknown',
                            color: parsed.color || '',
                            pages: parsed.pages || '',
                            paperSize: parsed.paper || '',
                            mediaType: parsed.media || '',
                            orientation: parsed.orient || '',
                            duplex: parsed.duplex || '',
                            totalSheets: parsed.sheets || 0,
                            finalized: isFinal,
                            timestamp: parsed.t || new Date().toISOString()
                        };
                        if (isFinal) {
                            console.log('[PRINT-DIALOG] FINALIZED (dialog closed): copies=' + result.copies
                                + ' printer="' + result.printer + '"'
                                + ' color="' + result.color + '"'
                                + ' paper="' + result.paperSize + '"'
                                + ' [' + result.source + ']');
                        } else {
                            console.log('[PRINT-DIALOG] Watching: copies=' + result.copies
                                + ' printer="' + result.printer + '"'
                                + ' color="' + result.color + '"'
                                + ' [' + result.source + ']');
                        }
                        if (onDataCaptured) onDataCaptured(result);
                    }
                } catch (e) {}
            }
        });

        proc.stderr.on('data', () => {});

        proc.on('exit', (code) => {
            if (running) {
                console.log('[PRINT-DIALOG] Monitor exited, restarting in 5s...');
                setTimeout(() => {
                    if (running) startPrintDialogMonitor(onDataCaptured);
                }, 5000);
            }
        });

        console.log('[PRINT-DIALOG] UI monitor started - Office/Chrome/Edge/Adobe/Win32 (polling 150ms)');
        console.log('[PRINT-DIALOG] NOTE: Data is only USED when Event 307 confirms actual printing');
    } catch (e) {
        console.error('[PRINT-DIALOG] Failed to start monitor:', e.message);
    }

    function stop() {
        running = false;
        if (proc) { try { proc.kill(); } catch (e) {} }
    }

    return { stop, isRunning: () => running };
}
`;

const startIdx = content.indexOf('function startPrintDialogMonitor');
const endIdx = content.indexOf('module.exports = {', startIdx);
if (startIdx > -1 && endIdx > -1) {
    content = content.substring(0, startIdx) + newFunc + '\n\n' + content.substring(endIdx);
    fs.writeFileSync(file, content);
    console.log('Successfully replaced startPrintDialogMonitor!');
} else {
    console.log('Failed to find function boundaries');
}
