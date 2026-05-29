Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
Add-Type -ErrorAction SilentlyContinue @"
using System; using System.Runtime.InteropServices; using System.Threading; using System.Text;
public class W6 {
    public delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern IntPtr FindWindow(string cls, string title);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string text);
    [DllImport("user32.dll", CharSet=CharSet.Auto, EntryPoint="SendMessageW")] public static extern int SendMessageText(IntPtr h, uint m, int w, StringBuilder l);
    [DllImport("user32.dll")] public static extern int SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int X, int Y, int W, int H, bool repaint);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr h);
    [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr hDlg, int nIDDlgItem);
    [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr hWndParent, EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref POINT p);
    [DllImport("user32.dll")] public static extern void mouse_event(uint f, int x, int y, uint d, int e);
    [DllImport("kernel32.dll")] public static extern IntPtr OpenProcess(uint a, bool i, int pid);
    [DllImport("kernel32.dll")] public static extern IntPtr VirtualAllocEx(IntPtr hp, IntPtr a, uint sz, uint t, uint p);
    [DllImport("kernel32.dll")] public static extern bool VirtualFreeEx(IntPtr hp, IntPtr a, uint sz, uint t);
    [DllImport("kernel32.dll")] public static extern bool ReadProcessMemory(IntPtr hp, IntPtr a, byte[] b, uint sz, out int r);
    [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
    [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h, out int pid);
    [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hWnd, int nIndex);
    [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);
    [DllImport("user32.dll")] public static extern bool SetLayeredWindowAttributes(IntPtr hwnd, uint crKey, byte bAlpha, uint dwFlags);
    [DllImport("user32.dll")] public static extern int GetSystemMetrics(int nIndex);
    public delegate void WinEventDelegate(IntPtr hWinEventHook, uint eventType, IntPtr hwnd, int idObject, int idChild, uint dwEventThread, uint dwmsEventTime);
    [DllImport("user32.dll")] public static extern IntPtr SetWinEventHook(uint eventMin, uint eventMax, IntPtr hmodWinEventProc, WinEventDelegate lpfnWinEventProc, uint idProcess, uint idThread, uint dwFlags);
    [DllImport("user32.dll")] public static extern bool UnhookWinEvent(IntPtr hWinEventHook);
    [DllImport("user32.dll")] public static extern bool PeekMessage(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax, uint wRemoveMsg);
    [DllImport("user32.dll")] public static extern bool TranslateMessage(ref MSG lpMsg);
    [DllImport("user32.dll")] public static extern IntPtr DispatchMessage(ref MSG lpMsg);

    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L,T,R,B; }
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] public struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam; public IntPtr lParam; public uint time; public POINT pt; }

    public const uint BM_CLICK  = 0x00F5;
    public const uint TCM_GETITEMCOUNT = 0x1304;

    public static WinEventDelegate hookDel;
    public static IntPtr hHook = IntPtr.Zero;
    public static IntPtr hHook2 = IntPtr.Zero;
    public static int hookPid = 0;

    public static void HookProc(IntPtr hWinEventHook, uint eventType, IntPtr hwnd, int idObject, int idChild, uint dwEventThread, uint dwmsEventTime) {
        if (idObject != 0) return;
        int pid; GetWindowThreadProcessId(hwnd, out pid);
        if (pid == hookPid && pid != 0) { MakeInvisible(hwnd); MoveToCorner(hwnd); }
    }

    public static void MakeInvisible(IntPtr hwnd) {
        int wl = GetWindowLong(hwnd, -20);
        SetWindowLong(hwnd, -20, wl | 0x80000); // WS_EX_LAYERED
        SetLayeredWindowAttributes(hwnd, 0, 0, 2); // Alpha 0 immediately to prevent initial massive flash
    }

    public static void SetAlpha(IntPtr hwnd, byte a) {
        SetLayeredWindowAttributes(hwnd, 0, a, 2);
    }

    public static void MoveToCorner(IntPtr hwnd) {
        RECT r; GetWindowRect(hwnd, out r);
        int w = r.R - r.L; int h = r.B - r.T;
        int sw = GetSystemMetrics(0); int sh = GetSystemMetrics(1);
        MoveWindow(hwnd, sw - w, sh - h, w, h, true);
    }

    public static IntPtr FastCapture(string title1, string title2) {
        long end = DateTime.Now.Ticks + TimeSpan.TicksPerSecond * 10;
        while (DateTime.Now.Ticks < end) {
            MSG msg;
            while (PeekMessage(out msg, IntPtr.Zero, 0, 0, 1)) {
                TranslateMessage(ref msg);
                DispatchMessage(ref msg);
            }
            IntPtr h = FindWindow("#32770", title1);
            if (h == IntPtr.Zero) h = FindWindow(null, title1);
            if (h == IntPtr.Zero && title2 != null) {
                h = FindWindow("#32770", title2);
                if (h == IntPtr.Zero) h = FindWindow(null, title2);
            }
            if (h != IntPtr.Zero) {
                MakeInvisible(h);
                MoveToCorner(h);
                return h;
            }
            Thread.Sleep(1);
        }
        return IntPtr.Zero;
    }

    public static IntPtr RunAndCapture(string args, string expectedTitle1, string expectedTitle2) {
        System.Diagnostics.Process p = new System.Diagnostics.Process();
        p.StartInfo.FileName = "rundll32.exe";
        p.StartInfo.Arguments = args;
        p.StartInfo.WindowStyle = System.Diagnostics.ProcessWindowStyle.Hidden;
        p.Start();
        hookPid = p.Id;
        hookDel = new WinEventDelegate(HookProc);
        hHook = SetWinEventHook(0x8000, 0x8000, IntPtr.Zero, hookDel, (uint)hookPid, 0, 0);
        hHook2 = SetWinEventHook(0x8002, 0x8002, IntPtr.Zero, hookDel, (uint)hookPid, 0, 0);
        return FastCapture(expectedTitle1, expectedTitle2);
    }

    public static IntPtr ClickAndCapture(IntPtr btn, string expectedTitle, IntPtr parent) {
        RECT r; GetWindowRect(btn, out r);
        int cx = (r.L + r.R) / 2;
        int cy = (r.T + r.B) / 2;
        HardwareClick(cx, cy, parent);
        return FastCapture(expectedTitle, null);
    }

    public static void MoveOffscreen(IntPtr hwnd) {
        RECT r; GetWindowRect(hwnd, out r);
        MoveWindow(hwnd, -8000, -8000, r.R - r.L, r.B - r.T, false);
    }

    public static void HardwareClick(int screenX, int screenY, IntPtr hParent) {
        // Briefly make window opaque (1/255) so mouse_event succeeds against hit testing
        if (hParent != IntPtr.Zero) SetAlpha(hParent, 1);
        POINT old; GetCursorPos(out old);
        SetCursorPos(screenX, screenY);
        Thread.Sleep(50);
        mouse_event(2, 0, 0, 0, 0);
        Thread.Sleep(20);
        mouse_event(4, 0, 0, 0, 0);
        SetCursorPos(old.X, old.Y);
        // Restore perfect invisibility
        if (hParent != IntPtr.Zero) SetAlpha(hParent, 0);
    }

    public static void HardwareClickBtn(IntPtr btn, IntPtr parent) {
        RECT r; GetWindowRect(btn, out r);
        int cx = (r.L + r.R) / 2;
        int cy = (r.T + r.B) / 2;
        HardwareClick(cx, cy, parent);
    }

    public static bool ClickTab(IntPtr tc, int idx, IntPtr parent) {
        int pid; GetWindowThreadProcessId(tc, out pid);
        IntPtr hp = OpenProcess(0x001F0FFF, false, pid);
        if (hp == IntPtr.Zero) return false;
        try {
            IntPtr rb = VirtualAllocEx(hp, IntPtr.Zero, 16, 0x1000, 0x04);
            if (rb == IntPtr.Zero) return false;
            try {
                int ok = SendMessage(tc, 0x130A, (IntPtr)idx, rb);
                if (ok == 0) return false;
                byte[] buf = new byte[16]; int rd;
                ReadProcessMemory(hp, rb, buf, 16, out rd);
                int L = BitConverter.ToInt32(buf,0); int T = BitConverter.ToInt32(buf,4);
                int R = BitConverter.ToInt32(buf,8); int B = BitConverter.ToInt32(buf,12);
                POINT tl = new POINT(); tl.X = L; tl.Y = T;
                POINT br = new POINT(); br.X = R; br.Y = B;
                ClientToScreen(tc, ref tl); ClientToScreen(tc, ref br);
                HardwareClick((tl.X+br.X)/2, (tl.Y+br.Y)/2, parent);
                return true;
            } finally { VirtualFreeEx(hp, rb, 0, 0x8000); }
        } finally { CloseHandle(hp); }
    }

    public static string GetText(IntPtr h) {
        StringBuilder sb = new StringBuilder(512);
        SendMessageText(h, 0x000D, 512, sb);
        return sb.ToString().Trim();
    }
}
"@

function Get-ConnectedPrinters {
    $excluded = "Microsoft|OneNote|PDF|XPS|Fax|Send To|Snagit|Adobe|Remote"
    $list = @()
    try { $list = @(Get-Printer | Where-Object { $_.Name -notmatch $excluded }) } catch {}
    if ($list.Count -eq 0) {
        try {
            $list = @(Get-WmiObject Win32_Printer |
                Where-Object { $_.Name -notmatch $excluded } |
                Select-Object @{N="Name";E={$_.Name}})
        } catch {}
    }
    return $list
}

function Read-TotalSheets {
    param([string]$printerName)

    $args = "printui.dll,PrintUIEntry /e /n `"$printerName`""
    $hwnd = [W6]::RunAndCapture($args, "$printerName Printing Preferences", "$printerName Properties")
    if ($hwnd -eq [IntPtr]::Zero) { return -1 }

    $tabCtrl = [W6]::FindWindowEx($hwnd, [IntPtr]::Zero, "SysTabControl32", $null)
    if ($tabCtrl -ne [IntPtr]::Zero) {
        $tabCount = [int][W6]::SendMessage($tabCtrl, [W6]::TCM_GETITEMCOUNT, [IntPtr]::Zero, [IntPtr]::Zero)
        if ($tabCount -gt 0) {
            [void][W6]::SetForegroundWindow($hwnd)
            Start-Sleep -Milliseconds 300
            [void][W6]::ClickTab($tabCtrl, $tabCount - 1, $hwnd)
        }
    }

    Start-Sleep -Seconds 2

    $global:poiLabel = [IntPtr]::Zero
    $global:poiBtn = [IntPtr]::Zero

    $callback = {
        param([IntPtr]$child, [IntPtr]$lParam)
        $txt = [W6]::GetText($child)
        if ($txt -match "Printer and Option( Information)?") {
            $global:poiLabel = $child
            $parentId = [W6]::GetParent($child)
            $labelId = [W6]::GetDlgCtrlID($child)
            $btnId = $labelId - 1
            $btn = [W6]::GetDlgItem($parentId, $btnId)
            if ($btn -ne [IntPtr]::Zero) {
                $global:poiBtn = $btn
            }
            return $false
        }
        return $true
    }
    $delegate = [W6+EnumWindowsProc]$callback
    [void][W6]::EnumChildWindows($hwnd, $delegate, [IntPtr]::Zero)

    if ($global:poiBtn -eq [IntPtr]::Zero) {
        Get-Process rundll32 -ErrorAction SilentlyContinue | ForEach-Object { try { $_.Kill() } catch {} }
        return -1
    }

    $poiDlg = [IntPtr]::Zero
    for ($a = 1; $a -le 3; $a++) {
        [void][W6]::SetForegroundWindow($hwnd)
        Start-Sleep -Milliseconds 200
        $poiDlg = [W6]::ClickAndCapture($global:poiBtn, "Printer and Option Information", $hwnd)
        if ($poiDlg -ne [IntPtr]::Zero) { break }
    }

    if ($poiDlg -eq [IntPtr]::Zero) {
        Get-Process rundll32 -ErrorAction SilentlyContinue | ForEach-Object { try { $_.Kill() } catch {} }
        return -1
    }

    # The POI dialog doesn't need physical clicks inside so it can be truly offscreen immediately
    [void][W6]::MoveOffscreen($poiDlg)
    [void][W6]::MoveOffscreen($hwnd)
    Start-Sleep -Seconds 5

    $global:totalSheetsVal = -1
    $global:tsLabelFound = $false

    $cbPOI = {
        param([IntPtr]$e, [IntPtr]$lParam)
        $val = [W6]::GetText($e)
        
        if ($val -eq "Total Sheets") {
            $global:tsLabelFound = $true
            return $true
        }
        if ($global:tsLabelFound) {
            if ($val -match "^[\\d,]+$") {
                $stripped = $val -replace ",", ""
                $global:totalSheetsVal = [int]$stripped
                return $false
            }
        }
        if ($val -match "^[\\d,]+$") {
            $stripped = $val -replace ",", ""
            if ([int]$stripped -gt 10) { }
        }
        return $true
    }
    $dlgDelegate = [W6+EnumWindowsProc]$cbPOI
    [void][W6]::EnumChildWindows($poiDlg, $dlgDelegate, [IntPtr]::Zero)

    $ok = [W6]::FindWindowEx($poiDlg, [IntPtr]::Zero, "Button", "OK")
    if ($ok -ne [IntPtr]::Zero) { [void][W6]::SendMessage($ok, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero) }
    Start-Sleep -Seconds 1
    $cancel = [W6]::FindWindowEx($hwnd, [IntPtr]::Zero, "Button", "Cancel")
    if ($cancel -ne [IntPtr]::Zero) { [void][W6]::SendMessage($cancel, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero) }
    Start-Sleep -Seconds 1
    if ([W6]::hHook -ne [IntPtr]::Zero) { [void][W6]::UnhookWinEvent([W6]::hHook) }
    if ([W6]::hHook2 -ne [IntPtr]::Zero) { [void][W6]::UnhookWinEvent([W6]::hHook2) }
    Get-Process rundll32 -ErrorAction SilentlyContinue | ForEach-Object { try { $_.Kill() } catch {} }

    return $global:totalSheetsVal
}

# === MAIN: Single cycle, output JSON ===
Get-Process rundll32 -ErrorAction SilentlyContinue | ForEach-Object { try { $_.Kill() } catch {} }
$printers = @(Get-ConnectedPrinters)
$results = @()

foreach ($printer in $printers) {
    $name = $printer.Name
    $ts = Read-TotalSheets -printerName $name

    $isOnline = $false
    try {
        $wmi = Get-WmiObject Win32_Printer -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq $name }
        if ($wmi -and -not $wmi.WorkOffline) { $isOnline = $true }
    } catch {}

    if ($ts -gt 0) {
        $results += @{
            printerName      = $name
            totalPages       = $ts
            totalSheets      = $ts
            isOnline         = $isOnline
            source           = "poi_dialog_offscreen"
        }
    } else {
        $results += @{
            printerName      = $name
            totalPages       = $null
            totalSheets      = $null
            isOnline         = $isOnline
            source           = "poi_dialog_no_data"
            noData           = $true
        }
    }
    Start-Sleep -Seconds 2
}

if ($results.Count -eq 0) { "[]" }
else { $results | ConvertTo-Json -Depth 3 }