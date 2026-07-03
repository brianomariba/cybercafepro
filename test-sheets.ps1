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

    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L,T,R,B; }
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }

    public const uint BM_CLICK  = 0x00F5;
    public const uint TCM_GETITEMCOUNT = 0x1304;

    public static void MakeInvisible(IntPtr hwnd) {
        int wl = GetWindowLong(hwnd, -20);
        SetWindowLong(hwnd, -20, wl | 0x80000); // WS_EX_LAYERED
        SetLayeredWindowAttributes(hwnd, 0, 1, 2); // Alpha = 1
    }

    public static void MoveToCorner(IntPtr hwnd) {
        RECT r; GetWindowRect(hwnd, out r);
        int w = r.R - r.L; int h = r.B - r.T;
        int sw = GetSystemMetrics(0); int sh = GetSystemMetrics(1);
        MoveWindow(hwnd, sw - w, sh - h, w, h, true);
    }

    public static void MoveOffscreen(IntPtr hwnd) {
        RECT r; GetWindowRect(hwnd, out r);
        MoveWindow(hwnd, -8000, -8000, r.R - r.L, r.B - r.T, false);
    }

    public static void HardwareClick(int screenX, int screenY) {
        POINT old; GetCursorPos(out old);
        SetCursorPos(screenX, screenY);
        Thread.Sleep(100);
        mouse_event(2, 0, 0, 0, 0);
        Thread.Sleep(50);
        mouse_event(4, 0, 0, 0, 0);
        Thread.Sleep(100);
        SetCursorPos(old.X, old.Y);
    }

    public static void HardwareClickBtn(IntPtr btn) {
        RECT r; GetWindowRect(btn, out r);
        int cx = (r.L + r.R) / 2;
        int cy = (r.T + r.B) / 2;
        HardwareClick(cx, cy);
    }

    public static bool ClickTab(IntPtr tc, int idx) {
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
                HardwareClick((tl.X+br.X)/2, (tl.Y+br.Y)/2);
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

    $proc = Start-Process rundll32.exe -ArgumentList "printui.dll,PrintUIEntry /e /n `"$printerName`"" -PassThru

    $hwnd = [IntPtr]::Zero
    for ($i = 0; $i -lt 800; $i++) {
        Start-Sleep -Milliseconds 10
        $hwnd = [W6]::FindWindow("#32770", "$printerName Printing Preferences")
        if ($hwnd -eq [IntPtr]::Zero) { $hwnd = [W6]::FindWindow($null, "$printerName Printing Preferences") }
        if ($hwnd -eq [IntPtr]::Zero) { $hwnd = [W6]::FindWindow("#32770", "$printerName Properties") }
        if ($hwnd -eq [IntPtr]::Zero) { $hwnd = [W6]::FindWindow($null, "$printerName Properties") }
        if ($hwnd -ne [IntPtr]::Zero) {
            [void][W6]::MakeInvisible($hwnd)
            [void][W6]::MoveToCorner($hwnd)
            break
        }
    }
    if ($hwnd -eq [IntPtr]::Zero) { return -1 }

    $tabCtrl = [W6]::FindWindowEx($hwnd, [IntPtr]::Zero, "SysTabControl32", $null)
    if ($tabCtrl -ne [IntPtr]::Zero) {
        $tabCount = [int][W6]::SendMessage($tabCtrl, [W6]::TCM_GETITEMCOUNT, [IntPtr]::Zero, [IntPtr]::Zero)
        if ($tabCount -gt 0) {
            [void][W6]::SetForegroundWindow($hwnd)
            Start-Sleep -Milliseconds 300
            [void][W6]::ClickTab($tabCtrl, $tabCount - 1)
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
        [W6]::HardwareClickBtn($global:poiBtn)
        for ($w = 0; $w -lt 500; $w++) {
            Start-Sleep -Milliseconds 10
            $poiDlg = [W6]::FindWindow("#32770", "Printer and Option Information")
            if ($poiDlg -ne [IntPtr]::Zero) { 
                [void][W6]::MakeInvisible($poiDlg)
                break 
            }
        }
        if ($poiDlg -ne [IntPtr]::Zero) { break }
    }

    if ($poiDlg -eq [IntPtr]::Zero) {
        Get-Process rundll32 -ErrorAction SilentlyContinue | ForEach-Object { try { $_.Kill() } catch {} }
        return -1
    }

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
            if ($val -match "^[\d,]+$") {
                $stripped = $val -replace ",", ""
                $global:totalSheetsVal = [int]$stripped
                return $false
            }
        }
        if ($val -match "^[\d,]+$") {
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