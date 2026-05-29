const fs = require('fs');
let content = fs.readFileSync('desktop-agent/print-monitor.js', 'utf8');

const t1 = `    \\$proc = Start-Process "rundll32.exe" -ArgumentList "printui.dll,PrintUIEntry /e /n \\\`"\\$pn\\\`"" -PassThru -ErrorAction Stop
    Start-Sleep -Seconds 5
    
    \\$title = "\\$pn Printing Preferences"
    \\$hwnd = [W]::FindWindow('#32770', \\$title)
    if (\\$hwnd -eq [IntPtr]::Zero) { \\$hwnd = [W]::FindWindow(\\$null, \\$title) }
    if (\\$hwnd -eq [IntPtr]::Zero) { '-1|-1' | Out-File \\$outFile; exit }`;

const r1 = `    \\$proc = Start-Process "rundll32.exe" -ArgumentList "printui.dll,PrintUIEntry /e /n \\\`"\\$pn\\\`"" -WindowStyle Hidden -PassThru -ErrorAction Stop
    
    \\$title = "\\$pn Printing Preferences"
    \\$hwnd = [W]::CaptureAndHide(\\$title)
    if (\\$hwnd -eq [IntPtr]::Zero) { '-1|-1' | Out-File \\$outFile; exit }`;

content = content.replace(t1, r1);

const t2 = `        for (\\$w = 0; \\$w -lt 10; \\$w++) {
            Start-Sleep -Seconds 1
            \\$poiDlg = [W]::FindWindow('#32770', 'Printer and Option Information')
            if (\\$poiDlg -ne [IntPtr]::Zero) { break }
        }
        if (\\$poiDlg -ne [IntPtr]::Zero) { break }`;

const r2 = `        \\$poiDlg = [W]::CaptureAndHide('Printer and Option Information')
        if (\\$poiDlg -ne [IntPtr]::Zero) { break }`;

content = content.replace(t2, r2);

fs.writeFileSync('desktop-agent/print-monitor.js', content);
console.log("Updated print-monitor.js");
