/**
 * Sheets Monitor - Offscreen Stealth POI Dialog
 * 
 * Runs a PowerShell script that:
 * 1. Opens printer preferences dialog (rundll32 printui.dll)
 * 2. Moves the window to (-8000,-8000) immediately (offscreen)
 * 3. Navigates to Maintenance tab via Win32 TCM_SETCURSEL messages
 * 4. Clicks "Printer and Option Information" via BM_CLICK / SendMessage
 * 5. Reads the "Total Sheets" counter from the POI dialog
 * 6. Closes all dialogs via BM_CLICK on OK/Cancel buttons
 * 
 * No cursor movement. No focus stealing. Completely invisible to the user.
 */

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

let lastSheets = {};
let isRunning = false;
let intervalHandle = null;

/**
 * Build the PowerShell script that performs offscreen stealth POI reading.
 * The script returns JSON: [{ printerName, totalPages, totalSheets, isOnline, source }]
 */
function buildScript() {
    return `
Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
Add-Type -ErrorAction SilentlyContinue @"
using System; using System.Runtime.InteropServices; using System.Threading; using System.Text;
public class W6 {
    [DllImport("user32.dll")] public static extern IntPtr FindWindow(string cls, string title);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll", CharSet=CharSet.Auto)]
    public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string text);
    [DllImport("user32.dll", CharSet=CharSet.Auto, EntryPoint="SendMessageW")]
    public static extern int SendMessageText(IntPtr h, uint m, int w, StringBuilder l);
    [DllImport("user32.dll")]
    public static extern int SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int X, int Y, int W, int H, bool repaint);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool ScreenToClient(IntPtr h, ref POINT p);
    [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr h);

    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L,T,R,B; }
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] public struct NMHDR { public IntPtr hwndFrom; public IntPtr idFrom; public int code; }

    public const uint BM_CLICK  = 0x00F5;
    public const uint WM_CLOSE  = 0x0010;
    public const uint WM_NOTIFY = 0x004E;
    public const uint WM_LBUTTONDOWN = 0x0201;
    public const uint WM_LBUTTONUP   = 0x0202;
    public const uint TCM_SETCURSEL    = 0x130C;
    public const uint TCM_GETITEMCOUNT = 0x1304;

    public static void MoveOffscreen(IntPtr hwnd) {
        RECT r; GetWindowRect(hwnd, out r);
        MoveWindow(hwnd, -8000, -8000, r.R - r.L, r.B - r.T, false);
    }

    public static void ClickAt(IntPtr hwnd, int screenX, int screenY) {
        POINT pt; pt.X = screenX; pt.Y = screenY;
        ScreenToClient(hwnd, ref pt);
        int lp = (pt.X & 0xFFFF) | ((pt.Y & 0xFFFF) << 16);
        SendMessage(hwnd, WM_LBUTTONDOWN, (IntPtr)1, (IntPtr)lp);
        Thread.Sleep(150);
        SendMessage(hwnd, WM_LBUTTONUP, IntPtr.Zero, (IntPtr)lp);
        Thread.Sleep(300);
    }

    public static void SelectTab(IntPtr parentDlg, IntPtr tabCtrl, int tabIndex) {
        SendMessage(tabCtrl, TCM_SETCURSEL, (IntPtr)tabIndex, IntPtr.Zero);
        IntPtr pNm = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(NMHDR)));
        try {
            NMHDR nm = new NMHDR();
            nm.hwndFrom = tabCtrl; nm.idFrom = (IntPtr)GetDlgCtrlID(tabCtrl);
            nm.code = -552; // TCN_SELCHANGING
            Marshal.StructureToPtr(nm, pNm, false);
            SendMessage(parentDlg, WM_NOTIFY, nm.idFrom, pNm);
            nm.code = -551; // TCN_SELCHANGE
            Marshal.StructureToPtr(nm, pNm, false);
            SendMessage(parentDlg, WM_NOTIFY, nm.idFrom, pNm);
        } finally { Marshal.FreeHGlobal(pNm); }
    }

    public static string GetText(IntPtr h) {
        StringBuilder sb = new StringBuilder(256);
        SendMessageText(h, 0x000D, 256, sb);
        return sb.ToString();
    }
}
"@

function Get-ConnectedPrinters {
    \\$excluded = 'Microsoft|OneNote|PDF|XPS|Fax|Send To|Snagit|Adobe|Remote'
    \\$list = @()
    try { \\$list = @(Get-Printer | Where-Object { \\$_.Name -notmatch \\$excluded }) } catch {}
    if (\\$list.Count -eq 0) {
        try {
            \\$list = @(Get-WmiObject Win32_Printer |
                Where-Object { \\$_.Name -notmatch \\$excluded } |
                Select-Object @{N='Name';E={\\$_.Name}})
        } catch {}
    }
    return \\$list
}

function Read-TotalSheets {
    param([string]\\$printerName)

    \\$proc = Start-Process rundll32.exe -ArgumentList "printui.dll,PrintUIEntry /e /n \`"\\$printerName\`"" -PassThru

    \\$hwnd = [IntPtr]::Zero
    for (\\$i = 0; \\$i -lt 80; \\$i++) {
        Start-Sleep -Milliseconds 100
        \\$hwnd = [W6]::FindWindow('#32770', "\\$printerName Printing Preferences")
        if (\\$hwnd -eq [IntPtr]::Zero) { \\$hwnd = [W6]::FindWindow(\\$null, "\\$printerName Printing Preferences") }
        if (\\$hwnd -ne [IntPtr]::Zero) {
            [void][W6]::MoveOffscreen(\\$hwnd)
            break
        }
    }
    if (\\$hwnd -eq [IntPtr]::Zero) { return -1 }

    Start-Sleep -Seconds 1

    # Navigate to Maintenance tab
    \\$tabCtrl = [W6]::FindWindowEx(\\$hwnd, [IntPtr]::Zero, "SysTabControl32", \\$null)
    if (\\$tabCtrl -ne [IntPtr]::Zero) {
        \\$tabCount = [int][W6]::SendMessage(\\$tabCtrl, [W6]::TCM_GETITEMCOUNT, [IntPtr]::Zero, [IntPtr]::Zero)
        if (\\$tabCount -gt 0) {
            [void][W6]::SelectTab(\\$hwnd, \\$tabCtrl, \\$tabCount - 1)
        }
    } else {
        [void][W6]::SetForegroundWindow(\\$hwnd)
        [System.Windows.Forms.SendKeys]::SendWait("^{TAB}")
        Start-Sleep -Milliseconds 500
        [System.Windows.Forms.SendKeys]::SendWait("^{TAB}")
    }

    Start-Sleep -Seconds 2

    \\$maintPage = [W6]::FindWindowEx(\\$hwnd, [IntPtr]::Zero, '#32770', 'Maintenance')
    if (\\$maintPage -eq [IntPtr]::Zero) { \\$maintPage = \\$hwnd }

    # Find POI - try Button first, then Static label
    \\$poiBtn = [IntPtr]::Zero
    \\$poiLabel = [IntPtr]::Zero

    \\$btn = [W6]::FindWindowEx(\\$maintPage, [IntPtr]::Zero, 'Button', \\$null)
    while (\\$btn -ne [IntPtr]::Zero) {
        \\$t = [W6]::GetText(\\$btn)
        if (\\$t -match 'Printer and Option|Information') { \\$poiBtn = \\$btn; break }
        \\$btn = [W6]::FindWindowEx(\\$maintPage, \\$btn, 'Button', \\$null)
    }
    if (\\$poiBtn -eq [IntPtr]::Zero) {
        \\$cd = [W6]::FindWindowEx(\\$hwnd, [IntPtr]::Zero, '#32770', \\$null)
        while (\\$cd -ne [IntPtr]::Zero) {
            \\$btn = [W6]::FindWindowEx(\\$cd, [IntPtr]::Zero, 'Button', \\$null)
            while (\\$btn -ne [IntPtr]::Zero) {
                \\$t = [W6]::GetText(\\$btn)
                if (\\$t -match 'Printer and Option|Information') { \\$poiBtn = \\$btn; break }
                \\$btn = [W6]::FindWindowEx(\\$cd, \\$btn, 'Button', \\$null)
            }
            if (\\$poiBtn -ne [IntPtr]::Zero) { break }
            \\$cd = [W6]::FindWindowEx(\\$hwnd, \\$cd, '#32770', \\$null)
        }
    }

    if (\\$poiBtn -eq [IntPtr]::Zero) {
        \\$poiLabel = [W6]::FindWindowEx(\\$maintPage, [IntPtr]::Zero, 'Static', 'Printer and Option Information')
        if (\\$poiLabel -eq [IntPtr]::Zero) { \\$poiLabel = [W6]::FindWindowEx(\\$hwnd, [IntPtr]::Zero, 'Static', 'Printer and Option Information') }
        if (\\$poiLabel -eq [IntPtr]::Zero) {
            \\$cd = [W6]::FindWindowEx(\\$hwnd, [IntPtr]::Zero, '#32770', \\$null)
            while (\\$cd -ne [IntPtr]::Zero) {
                \\$poiLabel = [W6]::FindWindowEx(\\$cd, [IntPtr]::Zero, 'Static', 'Printer and Option Information')
                if (\\$poiLabel -ne [IntPtr]::Zero) { break }
                \\$cd = [W6]::FindWindowEx(\\$hwnd, \\$cd, '#32770', \\$null)
            }
        }
    }

    if (\\$poiBtn -eq [IntPtr]::Zero -and \\$poiLabel -eq [IntPtr]::Zero) {
        Get-Process rundll32 -ErrorAction SilentlyContinue | ForEach-Object { try { \\$_.Kill() } catch {} }
        return -1
    }

    # Open POI dialog
    \\$poiDlg = [IntPtr]::Zero

    if (\\$poiBtn -ne [IntPtr]::Zero) {
        for (\\$a = 1; \\$a -le 3; \\$a++) {
            [void][W6]::SendMessage(\\$poiBtn, [W6]::BM_CLICK, [IntPtr]::Zero, [IntPtr]::Zero)
            for (\\$w = 0; \\$w -lt 15; \\$w++) {
                Start-Sleep -Milliseconds 500
                \\$poiDlg = [W6]::FindWindow('#32770', 'Printer and Option Information')
                if (\\$poiDlg -ne [IntPtr]::Zero) { break }
            }
            if (\\$poiDlg -ne [IntPtr]::Zero) { break }
        }
    }

    if (\\$poiDlg -eq [IntPtr]::Zero -and \\$poiLabel -ne [IntPtr]::Zero) {
        \\$rect = New-Object W6+RECT
        [void][W6]::GetWindowRect(\\$poiLabel, [ref]\\$rect)
        \\$bx = [int](\\$rect.L - 25); \\$by = [int]((\\$rect.T + \\$rect.B) / 2)
        \\$target = if (\\$maintPage -ne \\$hwnd) { \\$maintPage } else { \\$hwnd }

        for (\\$a = 1; \\$a -le 3; \\$a++) {
            [void][W6]::ClickAt(\\$target, \\$bx, \\$by)
            for (\\$w = 0; \\$w -lt 15; \\$w++) {
                Start-Sleep -Milliseconds 500
                \\$poiDlg = [W6]::FindWindow('#32770', 'Printer and Option Information')
                if (\\$poiDlg -ne [IntPtr]::Zero) { break }
            }
            if (\\$poiDlg -ne [IntPtr]::Zero) { break }
            if (\\$a -eq 1) { \\$bx = [int]((\\$rect.L + \\$rect.R) / 2); \\$by = [int]((\\$rect.T + \\$rect.B) / 2) }
            if (\\$a -eq 2) { \\$bx = [int](\\$rect.L - 25); [void][W6]::ClickAt(\\$target, \\$bx, \\$by); Start-Sleep -Milliseconds 200; [void][W6]::ClickAt(\\$target, \\$bx, \\$by) }
        }
    }

    if (\\$poiDlg -eq [IntPtr]::Zero) {
        Get-Process rundll32 -ErrorAction SilentlyContinue | ForEach-Object { try { \\$_.Kill() } catch {} }
        return -1
    }

    [void][W6]::MoveOffscreen(\\$poiDlg)
    Start-Sleep -Seconds 5

    # Read Total Sheets
    \\$totalSheetsVal = -1
    \\$tsLabel = [IntPtr]::Zero

    \\$s = [W6]::FindWindowEx(\\$poiDlg, [IntPtr]::Zero, 'Static', \\$null)
    while (\\$s -ne [IntPtr]::Zero) {
        if ([W6]::GetText(\\$s) -eq 'Total Sheets') { \\$tsLabel = \\$s }
        \\$s = [W6]::FindWindowEx(\\$poiDlg, \\$s, 'Static', \\$null)
    }
    \\$sd = [W6]::FindWindowEx(\\$poiDlg, [IntPtr]::Zero, '#32770', \\$null)
    while (\\$sd -ne [IntPtr]::Zero) {
        \\$ss = [W6]::FindWindowEx(\\$sd, [IntPtr]::Zero, 'Static', \\$null)
        while (\\$ss -ne [IntPtr]::Zero) {
            if ([W6]::GetText(\\$ss) -eq 'Total Sheets') { \\$tsLabel = \\$ss }
            \\$ss = [W6]::FindWindowEx(\\$sd, \\$ss, 'Static', \\$null)
        }
        \\$sd = [W6]::FindWindowEx(\\$poiDlg, \\$sd, '#32770', \\$null)
    }

    if (\\$tsLabel -ne [IntPtr]::Zero) {
        \\$ed = [W6]::FindWindowEx(\\$poiDlg, \\$tsLabel, 'Edit', \\$null)
        if (\\$ed -ne [IntPtr]::Zero) {
            \\$val = [W6]::GetText(\\$ed)
            if (\\$val -match '^\\d+$' -and [int]\\$val -gt 0) { \\$totalSheetsVal = [int]\\$val }
        }
    } else {
        \\$numbers = @()
        \\$e = [W6]::FindWindowEx(\\$poiDlg, [IntPtr]::Zero, 'Edit', \\$null)
        while (\\$e -ne [IntPtr]::Zero) {
            \\$val = [W6]::GetText(\\$e)
            if (\\$val -match '^\\d+$' -and [int]\\$val -ge 100) { \\$numbers += [int]\\$val }
            \\$e = [W6]::FindWindowEx(\\$poiDlg, \\$e, 'Edit', \\$null)
        }
        \\$numbers = \\$numbers | Sort-Object -Descending | Select-Object -Unique
        if (\\$numbers.Count -ge 1) { \\$totalSheetsVal = \\$numbers[0] }
    }

    # Close dialogs
    \\$ok = [W6]::FindWindowEx(\\$poiDlg, [IntPtr]::Zero, 'Button', 'OK')
    if (\\$ok -ne [IntPtr]::Zero) { [void][W6]::SendMessage(\\$ok, [W6]::BM_CLICK, [IntPtr]::Zero, [IntPtr]::Zero) }
    Start-Sleep -Seconds 1
    \\$cancel = [W6]::FindWindowEx(\\$hwnd, [IntPtr]::Zero, 'Button', 'Cancel')
    if (\\$cancel -ne [IntPtr]::Zero) { [void][W6]::SendMessage(\\$cancel, [W6]::BM_CLICK, [IntPtr]::Zero, [IntPtr]::Zero) }
    Start-Sleep -Seconds 1
    Get-Process rundll32 -ErrorAction SilentlyContinue | ForEach-Object { try { \\$_.Kill() } catch {} }

    if (\\$totalSheetsVal -gt 0) { return \\$totalSheetsVal }
    return -1
}

# === MAIN: Single cycle, output JSON ===
Get-Process rundll32 -ErrorAction SilentlyContinue | ForEach-Object { try { \\$_.Kill() } catch {} }
\\$printers = @(Get-ConnectedPrinters)
\\$results = @()

foreach (\\$printer in \\$printers) {
    \\$name = \\$printer.Name
    \\$ts = Read-TotalSheets -printerName \\$name

    \\$isOnline = \\$false
    try {
        \\$wmi = Get-WmiObject Win32_Printer -ErrorAction SilentlyContinue | Where-Object { \\$_.Name -eq \\$name }
        if (\\$wmi -and -not \\$wmi.WorkOffline) { \\$isOnline = \\$true }
    } catch {}

    if (\\$ts -gt 0) {
        \\$results += @{
            printerName      = \\$name
            totalPages       = \\$ts
            totalSheets      = \\$ts
            isOnline         = \\$isOnline
            source           = "poi_dialog_offscreen"
        }
    } else {
        \\$results += @{
            printerName      = \\$name
            totalPages       = \\$null
            totalSheets      = \\$null
            isOnline         = \\$isOnline
            source           = "poi_dialog_no_data"
            noData           = \\$true
        }
    }
    Start-Sleep -Seconds 2
}

if (\\$results.Count -eq 0) { "[]" }
else { \\$results | ConvertTo-Json -Depth 3 }
`;
}

function runSheetsCycle() {
    return new Promise((resolve) => {
        if (isRunning) {
            console.log('[SHEETS] Previous cycle still running, skipping');
            resolve([]);
            return;
        }
        isRunning = true;

        const script = buildScript();
        const tmpFile = path.join(os.tmpdir(), `hawknine_sheets_offscreen_${Date.now()}.ps1`);

        try {
            fs.writeFileSync(tmpFile, script, 'utf8');
        } catch (e) {
            isRunning = false;
            resolve([]);
            return;
        }

        execFile('powershell.exe', [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy', 'Bypass',
            '-WindowStyle', 'Hidden',
            '-File', tmpFile
        ], { timeout: 180000, maxBuffer: 1024 * 1024 * 5, windowsHide: true }, (error, stdout, stderr) => {
            try { fs.unlinkSync(tmpFile); } catch (e) {}
            isRunning = false;

            if (error) { resolve([]); return; }
            if (!stdout || stdout.trim() === '' || stdout.trim() === '[]') { resolve([]); return; }

            try {
                const parsed = JSON.parse(stdout);
                const counters = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
                const valid = counters.filter(c => c && c.totalSheets > 0 && !c.noData);

                for (const c of valid) {
                    const prev = lastSheets[c.printerName];
                    if (prev === undefined) {
                        console.log(`[SHEETS] ${c.printerName}: BASELINE = ${c.totalSheets} sheets`);
                    } else if (c.totalSheets !== prev) {
                        console.log(`[SHEETS] ${c.printerName}: CHANGED ${prev} -> ${c.totalSheets} (+${c.totalSheets - prev})`);
                    }
                    lastSheets[c.printerName] = c.totalSheets;
                }
                resolve(valid);
            } catch (e) {
                console.error('[SHEETS] Parse error:', e.message);
                resolve([]);
            }
        });
    });
}

function startSheetsMonitor(opts, sendToServer) {
    const {
        apiBase = 'https://api.hawkninegroup.com',
        clientId = 'unknown',
        hostname = os.hostname(),
        intervalMs = 60000,
        onReadings = null
    } = opts;

    console.log(`[SHEETS] Starting offscreen stealth monitor (interval: ${intervalMs / 1000}s)`);

    async function cycle() {
        try {
            const counters = await runSheetsCycle();
            if (counters.length > 0) {
                console.log(`[SHEETS] Got readings for ${counters.length} printer(s)`);
                if (onReadings) { try { onReadings(counters); } catch (e) {} }

                const payload = { clientId, hostname, counters };
                try {
                    await sendToServer(`${apiBase}/api/v1/agent/page-counter`, payload);
                } catch (e) {}
            }
        } catch (e) {
            console.error('[SHEETS] Cycle error:', e.message);
        }
    }

    setTimeout(cycle, 10000); // First run after 10s
    intervalHandle = setInterval(cycle, intervalMs);

    return {
        stop: () => { if (intervalHandle) { clearInterval(intervalHandle); intervalHandle = null; } },
        runNow: cycle,
        isRunning: () => isRunning
    };
}

module.exports = { startSheetsMonitor, runSheetsCycle };
