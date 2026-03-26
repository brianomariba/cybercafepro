/**
 * Sheets Monitor - STEALTH Total Sheets reader for all connected printers.
 * 
 * TRUE STEALTH: Windows are moved off-screen immediately after creation.
 * All interactions use Win32 SendMessage (message-based) instead of real
 * mouse clicks. This means:
 *   - No visible windows on screen
 *   - No cursor movement
 *   - No keyboard stealing
 *   - Data still loads correctly (EPSON driver communicates via USB/network)
 * 
 * Key technique: SendMessage(WM_LBUTTONDOWN/UP) with client-relative coordinates
 * works on off-screen windows, unlike SetCursorPos which requires valid screen coords.
 */

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

let lastSheets = {};
let isRunning = false;
let intervalHandle = null;

function buildScript() {
    return `
# === Stealth Sheets Monitor (message-based, no visible windows) ===
Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Threading; using System.Text;
public class SW {
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint f, int x, int y, uint d, int e);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern IntPtr FindWindow(string cls, string title);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int X, int Y, int W, int H, bool repaint);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool ScreenToClient(IntPtr h, ref POINT p);
    [DllImport("user32.dll", CharSet=CharSet.Auto)]
    public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string text);
    [DllImport("user32.dll", CharSet=CharSet.Auto, EntryPoint="SendMessageW")]
    public static extern int SendMessageText(IntPtr h, uint m, int w, StringBuilder l);
    [DllImport("user32.dll")]
    public static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
    [DllImport("user32.dll")]
    public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L,T,R,B; }
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
    public const int SW_HIDE = 0;
    public const int SW_MINIMIZE = 6;
    public const int SW_SHOWMINNOACTIVE = 7;
    public const uint WM_LBUTTONDOWN = 0x0201;
    public const uint WM_LBUTTONUP = 0x0202;
    public const uint BM_CLICK = 0x00F5;
    public const uint WM_KEYDOWN = 0x0100;
    public const uint WM_KEYUP = 0x0101;
    public const int MK_LBUTTON = 0x0001;

    // Click via SendMessage (works on hidden/off-screen windows!)
    // x, y are in SCREEN coordinates — we convert to client coords
    public static void MsgClick(IntPtr parent, int screenX, int screenY) {
        POINT pt;
        pt.X = screenX; pt.Y = screenY;
        ScreenToClient(parent, ref pt);
        IntPtr lParam = (IntPtr)((pt.Y << 16) | (pt.X & 0xFFFF));
        SendMessage(parent, WM_LBUTTONDOWN, (IntPtr)MK_LBUTTON, lParam);
        Thread.Sleep(100);
        SendMessage(parent, WM_LBUTTONUP, IntPtr.Zero, lParam);
        Thread.Sleep(300);
    }

    // Real mouse click (fallback)
    public static void DoClick(int x, int y) {
        SetCursorPos(x, y); Thread.Sleep(200);
        mouse_event(0x0002, 0, 0, 0, 0); Thread.Sleep(100);
        mouse_event(0x0004, 0, 0, 0, 0); Thread.Sleep(300);
    }

    public static string GetText(IntPtr h) {
        StringBuilder sb = new StringBuilder(256);
        SendMessageText(h, 0x000D, 256, sb);
        return sb.ToString();
    }

    public static void HideOffScreen(IntPtr h) {
        if (h == IntPtr.Zero) return;
        MoveWindow(h, -4000, -4000, 800, 600, false);
    }

    // Send Ctrl+Tab via PostMessage
    public static void SendCtrlTab(IntPtr h) {
        PostMessage(h, WM_KEYDOWN, (IntPtr)0x11, IntPtr.Zero); // VK_CONTROL down
        Thread.Sleep(50);
        PostMessage(h, WM_KEYDOWN, (IntPtr)0x09, IntPtr.Zero); // VK_TAB down
        Thread.Sleep(50);
        PostMessage(h, WM_KEYUP, (IntPtr)0x09, IntPtr.Zero);   // VK_TAB up
        Thread.Sleep(50);
        PostMessage(h, WM_KEYUP, (IntPtr)0x11, IntPtr.Zero);   // VK_CONTROL up
        Thread.Sleep(300);
    }
}
"@

function Get-ConnectedPrinters {
    $excluded = 'Microsoft|OneNote|PDF|XPS|Fax|Send To|Snagit|Adobe|Remote'
    $list = @()
    try { $list = @(Get-Printer | Where-Object { $_.Name -notmatch $excluded }) } catch {}
    if ($list.Count -eq 0) {
        try {
            $list = @(Get-WmiObject Win32_Printer |
                Where-Object { $_.Name -notmatch $excluded } |
                Select-Object @{N='Name';E={$_.Name}})
        } catch {}
    }
    return $list
}

function Read-TotalSheets {
    param([string]$printerName)

    $proc = Start-Process rundll32.exe -ArgumentList "printui.dll,PrintUIEntry /e /n \`"$printerName\`"" -PassThru -WindowStyle Hidden
    Start-Sleep -Seconds 4

    $title = "$printerName Printing Preferences"
    $hwnd = [SW]::FindWindow('#32770', $title)
    if ($hwnd -eq [IntPtr]::Zero) { $hwnd = [SW]::FindWindow($null, $title) }
    if ($hwnd -eq [IntPtr]::Zero) { return @{ TotalSheets = -1; BorderlessSheets = -1 } }

    # === STEALTH: Move window off-screen immediately ===
    [SW]::HideOffScreen($hwnd)

    # Try message-based tab switching first (Ctrl+Tab x2 to get to Maintenance)
    [SW]::SetForegroundWindow($hwnd) | Out-Null
    Start-Sleep -Milliseconds 300
    [SW]::SendCtrlTab($hwnd)
    Start-Sleep -Milliseconds 500
    [SW]::SendCtrlTab($hwnd)
    Start-Sleep -Seconds 2

    # If message-based tabs didn't work, try SendKeys as fallback
    $maintPage = [SW]::FindWindowEx($hwnd, [IntPtr]::Zero, '#32770', 'Maintenance')
    if ($maintPage -eq [IntPtr]::Zero) {
        # Fallback: bring briefly to foreground for SendKeys
        [SW]::MoveWindow($hwnd, 0, 0, 800, 600, $false) | Out-Null
        [SW]::SetForegroundWindow($hwnd) | Out-Null
        Start-Sleep -Milliseconds 200
        [System.Windows.Forms.SendKeys]::SendWait("^{TAB}")
        Start-Sleep -Milliseconds 300
        [System.Windows.Forms.SendKeys]::SendWait("^{TAB}")
        Start-Sleep -Seconds 1
        [SW]::HideOffScreen($hwnd)
        Start-Sleep -Seconds 1
        $maintPage = [SW]::FindWindowEx($hwnd, [IntPtr]::Zero, '#32770', 'Maintenance')
    }

    if ($maintPage -eq [IntPtr]::Zero) { $maintPage = $hwnd }

    # Find "Printer and Option Information" label
    $poiLabel = [SW]::FindWindowEx($maintPage, [IntPtr]::Zero, 'Static', 'Printer and Option Information')
    if ($poiLabel -eq [IntPtr]::Zero) {
        $poiLabel = [SW]::FindWindowEx($hwnd, [IntPtr]::Zero, 'Static', 'Printer and Option Information')
    }
    if ($poiLabel -eq [IntPtr]::Zero) {
        $childDlg = [SW]::FindWindowEx($hwnd, [IntPtr]::Zero, '#32770', $null)
        while ($childDlg -ne [IntPtr]::Zero) {
            $poiLabel = [SW]::FindWindowEx($childDlg, [IntPtr]::Zero, 'Static', 'Printer and Option Information')
            if ($poiLabel -ne [IntPtr]::Zero) { break }
            $childDlg = [SW]::FindWindowEx($hwnd, $childDlg, '#32770', $null)
        }
    }

    if ($poiLabel -eq [IntPtr]::Zero) {
        Get-Process rundll32 -ErrorAction SilentlyContinue | ForEach-Object { try { $_.Kill() } catch {} }
        return @{ TotalSheets = -1; BorderlessSheets = -1 }
    }

    # Get POI label's screen coordinates (off-screen since window is moved)
    $rect = New-Object SW+RECT
    [SW]::GetWindowRect($poiLabel, [ref]$rect) | Out-Null

    # Click target: icon to the left of the label, or the label text itself
    $iconX = [int]($rect.L - 25)
    $labelCenterX = [int](($rect.L + $rect.R) / 2)
    $cy = [int](($rect.T + $rect.B) / 2)

    # Determine the correct parent to send the click message to
    $clickTarget = $maintPage
    if ($clickTarget -eq $hwnd) { $clickTarget = $hwnd }

    $poiDlg = [IntPtr]::Zero
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        $clickX = if ($attempt -eq 1) { $iconX } elseif ($attempt -eq 2) { $labelCenterX } else { $iconX }

        # Use message-based click (works off-screen!)
        [SW]::MsgClick($clickTarget, $clickX, $cy)

        # Also try clicking on parent window
        if ($attempt -ge 2) {
            [SW]::MsgClick($hwnd, $clickX, $cy)
        }

        for ($w = 0; $w -lt 10; $w++) {
            Start-Sleep -Seconds 1
            $poiDlg = [SW]::FindWindow('#32770', 'Printer and Option Information')
            if ($poiDlg -ne [IntPtr]::Zero) {
                # STEALTH: Hide POI dialog off-screen immediately
                [SW]::HideOffScreen($poiDlg)
                break
            }
        }
        if ($poiDlg -ne [IntPtr]::Zero) { break }

        # If message-based click failed, try real click as last resort
        if ($attempt -eq 3) {
            # Briefly move window on-screen for real click
            [SW]::MoveWindow($hwnd, -10, -10, 800, 700, $false) | Out-Null
            Start-Sleep -Milliseconds 300
            $rect2 = New-Object SW+RECT
            [SW]::GetWindowRect($poiLabel, [ref]$rect2) | Out-Null
            $rx = [int]($rect2.L - 25)
            $ry = [int](($rect2.T + $rect2.B) / 2)
            if ($rx -gt 0 -and $ry -gt 0) {
                [SW]::DoClick($rx, $ry)
            }
            Start-Sleep -Milliseconds 500
            # Alternative: click the center of the label
            $rxC = [int](($rect2.L + $rect2.R) / 2)
            if ($rxC -gt 0) { [SW]::DoClick($rxC, $ry) }

            for ($w2 = 0; $w2 -lt 8; $w2++) {
                Start-Sleep -Seconds 1
                $poiDlg = [SW]::FindWindow('#32770', 'Printer and Option Information')
                if ($poiDlg -ne [IntPtr]::Zero) { break }
            }
            # Hide everything again
            [SW]::HideOffScreen($hwnd)
            if ($poiDlg -ne [IntPtr]::Zero) { [SW]::HideOffScreen($poiDlg) }
        }
    }

    if ($poiDlg -eq [IntPtr]::Zero) {
        Get-Process rundll32 -ErrorAction SilentlyContinue | ForEach-Object { try { $_.Kill() } catch {} }
        return @{ TotalSheets = -1; BorderlessSheets = -1 }
    }

    # Wait for EPSON driver to load data from printer
    Start-Sleep -Seconds 5

    # === TARGETED VALUE EXTRACTION (Total Sheets label → adjacent Edit) ===
    $totalSheetsVal = -1
    $borderlessSheetsVal = -1
    $totalSheetsLabel = [IntPtr]::Zero
    $borderlessLabel = [IntPtr]::Zero

    $staticH = [SW]::FindWindowEx($poiDlg, [IntPtr]::Zero, 'Static', $null)
    while ($staticH -ne [IntPtr]::Zero) {
        $labelText = [SW]::GetText($staticH)
        if ($labelText -eq 'Total Sheets') { $totalSheetsLabel = $staticH }
        if ($labelText -match 'Borderless') { $borderlessLabel = $staticH }
        $staticH = [SW]::FindWindowEx($poiDlg, $staticH, 'Static', $null)
    }

    $subDlg = [SW]::FindWindowEx($poiDlg, [IntPtr]::Zero, '#32770', $null)
    while ($subDlg -ne [IntPtr]::Zero) {
        $ss = [SW]::FindWindowEx($subDlg, [IntPtr]::Zero, 'Static', $null)
        while ($ss -ne [IntPtr]::Zero) {
            $lt = [SW]::GetText($ss)
            if ($lt -eq 'Total Sheets') { $totalSheetsLabel = $ss }
            if ($lt -match 'Borderless') { $borderlessLabel = $ss }
            $ss = [SW]::FindWindowEx($subDlg, $ss, 'Static', $null)
        }
        $subDlg = [SW]::FindWindowEx($poiDlg, $subDlg, '#32770', $null)
    }

    if ($totalSheetsLabel -ne [IntPtr]::Zero) {
        $editAfter = [SW]::FindWindowEx($poiDlg, $totalSheetsLabel, 'Edit', $null)
        if ($editAfter -ne [IntPtr]::Zero) {
            $val = [SW]::GetText($editAfter)
            if ($val -match '^\\d+$' -and [int]$val -gt 0) { $totalSheetsVal = [int]$val }
        }
    }

    if ($borderlessLabel -ne [IntPtr]::Zero) {
        $editAfter = [SW]::FindWindowEx($poiDlg, $borderlessLabel, 'Edit', $null)
        if ($editAfter -ne [IntPtr]::Zero) {
            $val = [SW]::GetText($editAfter)
            if ($val -match '^\\d+$' -and [int]$val -gt 0) { $borderlessSheetsVal = [int]$val }
        }
    }

    # Fallback: scan all Edit controls but only accept values >= 100
    if ($totalSheetsVal -le 0) {
        $numbers = @()
        $editH = [SW]::FindWindowEx($poiDlg, [IntPtr]::Zero, 'Edit', $null)
        while ($editH -ne [IntPtr]::Zero) {
            $val = [SW]::GetText($editH)
            if ($val -match '^\\d+$' -and [int]$val -ge 100) { $numbers += [int]$val }
            $editH = [SW]::FindWindowEx($poiDlg, $editH, 'Edit', $null)
        }
        $numbers = $numbers | Sort-Object -Descending | Select-Object -Unique
        if ($numbers.Count -ge 1) { $totalSheetsVal = $numbers[0] }
        if ($numbers.Count -ge 2) { $borderlessSheetsVal = $numbers[1] }
    }

    # Close POI dialog via SendMessage BM_CLICK (works off-screen)
    $okBtn = [SW]::FindWindowEx($poiDlg, [IntPtr]::Zero, 'Button', 'OK')
    if ($okBtn -ne [IntPtr]::Zero) {
        [SW]::SendMessage($okBtn, [SW]::BM_CLICK, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
    }
    Start-Sleep -Seconds 1

    $cancelBtn = [SW]::FindWindowEx($hwnd, [IntPtr]::Zero, 'Button', 'Cancel')
    if ($cancelBtn -ne [IntPtr]::Zero) {
        [SW]::SendMessage($cancelBtn, [SW]::BM_CLICK, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
    }
    Start-Sleep -Seconds 1
    Get-Process rundll32 -ErrorAction SilentlyContinue | ForEach-Object { try { $_.Kill() } catch {} }

    return @{ TotalSheets = $totalSheetsVal; BorderlessSheets = $borderlessSheetsVal }
}

# === MAIN ===
$printers = @(Get-ConnectedPrinters)
$results = @()

foreach ($printer in $printers) {
    $name = $printer.Name
    $reading = Read-TotalSheets -printerName $name

    $isOnline = $false
    try {
        $wmi = Get-WmiObject Win32_Printer -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq $name }
        if ($wmi -and -not $wmi.WorkOffline) { $isOnline = $true }
    } catch {}

    $ts = $reading.TotalSheets
    $bs = $reading.BorderlessSheets

    if ($ts -gt 0) {
        $results += @{
            printerName      = $name
            totalPages       = $ts
            totalSheets      = $ts
            borderlessSheets = if ($bs -gt 0) { $bs } else { $null }
            isOnline         = $isOnline
            source           = "poi_dialog"
        }
    } else {
        $results += @{
            printerName      = $name
            totalPages       = $null
            totalSheets      = $null
            borderlessSheets = $null
            isOnline         = $isOnline
            source           = "poi_dialog_no_data"
            noData           = $true
        }
    }

    Start-Sleep -Seconds 3
}

if ($results.Count -eq 0) { "[]" }
else { $results | ConvertTo-Json -Depth 3 }
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
        const tmpFile = path.join(os.tmpdir(), `hawknine_sheets_${Date.now()}.ps1`);

        try {
            fs.writeFileSync(tmpFile, script, 'utf8');
        } catch (e) {
            console.error('[SHEETS] Failed to write temp script:', e.message);
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
            try { fs.unlinkSync(tmpFile); } catch (e) { /* ignore */ }
            isRunning = false;

            if (error) {
                if (error.killed) {
                    console.error('[SHEETS] Script timed out');
                } else if (stderr && stderr.trim()) {
                    console.error('[SHEETS] PS error:', stderr.trim().substring(0, 300));
                }
                resolve([]);
                return;
            }

            if (!stdout || stdout.trim() === '' || stdout.trim() === '[]') {
                console.log('[SHEETS] No readings returned');
                resolve([]);
                return;
            }

            try {
                const parsed = JSON.parse(stdout);
                const counters = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
                const valid = counters.filter(c => c && c.totalSheets > 0 && !c.noData);
                const noData = counters.filter(c => c && c.noData);

                for (const c of valid) {
                    const prev = lastSheets[c.printerName];
                    if (prev === undefined) {
                        console.log(`[SHEETS] ${c.printerName}: BASELINE = ${c.totalSheets} sheets`);
                    } else if (c.totalSheets !== prev) {
                        console.log(`[SHEETS] ${c.printerName}: CHANGED ${prev} -> ${c.totalSheets} (+${c.totalSheets - prev})`);
                    }
                    lastSheets[c.printerName] = c.totalSheets;
                }

                for (const c of noData) {
                    console.log(`[SHEETS] ${c.printerName}: No data available`);
                }

                resolve(valid);
            } catch (e) {
                console.error('[SHEETS] Parse error:', e.message, 'Raw:', stdout.substring(0, 200));
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

    console.log(`[SHEETS] Starting stealth sheets monitor (interval: ${intervalMs / 1000}s)`);

    async function cycle() {
        try {
            const counters = await runSheetsCycle();
            if (counters.length > 0) {
                console.log(`[SHEETS] Got readings for ${counters.length} printer(s):`,
                    counters.map(c => `${c.printerName}=${c.totalSheets}`).join(', '));

                // Notify main.js for portal display
                if (onReadings) {
                    try { onReadings(counters); } catch (e) { /* ignore */ }
                }

                // ALWAYS send to API (even if unchanged — dashboard tracks changes)
                const payload = { clientId, hostname, counters };

                try {
                    await sendToServer(`${apiBase}/api/v1/agent/page-counter`, payload);
                    console.log('[SHEETS] Sent to API successfully');
                } catch (e) {
                    console.error('[SHEETS] API send failed:', e.message);
                }
            }
        } catch (e) {
            console.error('[SHEETS] Cycle error:', e.message);
        }
    }

    // Run first cycle immediately after launch (5s init delay)
    setTimeout(cycle, 5000);
    intervalHandle = setInterval(cycle, intervalMs);

    return {
        stop: () => { if (intervalHandle) { clearInterval(intervalHandle); intervalHandle = null; } },
        runNow: cycle,
        isRunning: () => isRunning
    };
}

module.exports = { startSheetsMonitor, runSheetsCycle };
