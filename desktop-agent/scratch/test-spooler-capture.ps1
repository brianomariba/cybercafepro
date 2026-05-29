# Quick test: captures what the SpoolerWatcher sees for the NEXT print job
# Run this, then print something

Add-Type -AssemblyName System.Printing
Add-Type -AssemblyName ReachFramework

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class TestJobApi {
    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool OpenPrinter(string pPrinterName, out IntPtr hPrinter, IntPtr pDefault);
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool GetJob(IntPtr hPrinter, int jobId, int level, IntPtr buffer, int bufSize, out int needed);

    public static int[] GetJobDevmode(string printerName, int jobId) {
        IntPtr hPrinter;
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) return null;
        try {
            int needed = 0;
            GetJob(hPrinter, jobId, 2, IntPtr.Zero, 0, out needed);
            if (needed <= 0) return null;
            IntPtr buf = Marshal.AllocHGlobal(needed);
            try {
                if (!GetJob(hPrinter, jobId, 2, buf, needed, out needed)) return null;
                IntPtr pDevMode;
                if (IntPtr.Size == 8) {
                    pDevMode = Marshal.ReadIntPtr(buf, 80);
                } else {
                    pDevMode = Marshal.ReadIntPtr(buf, 40);
                }
                if (pDevMode == IntPtr.Zero) return null;
                
                // Read dmSize first to verify DEVMODE is valid
                short dmSize = Marshal.ReadInt16(pDevMode, 68);
                
                short dmColor = Marshal.ReadInt16(pDevMode, 92);
                short dmDuplex = Marshal.ReadInt16(pDevMode, 94);
                int dmMediaType = Marshal.ReadInt32(pDevMode, 196);
                short dmOrientation = Marshal.ReadInt16(pDevMode, 76);
                short dmPaperSize = Marshal.ReadInt16(pDevMode, 78);
                short dmCopies = Marshal.ReadInt16(pDevMode, 86);
                return new int[] { dmColor, dmMediaType, dmDuplex, dmOrientation, dmPaperSize, dmCopies, (int)dmSize };
            } finally { Marshal.FreeHGlobal(buf); }
        } finally { ClosePrinter(hPrinter); }
    }
}
"@

$query = "SELECT * FROM __InstanceCreationEvent WITHIN 1 WHERE TargetInstance ISA 'Win32_PrintJob'"
$watcher = New-Object System.Management.ManagementEventWatcher($query)
$watcher.Options.Timeout = New-Object TimeSpan(0, 2, 0)

Write-Host "Waiting for a print job... Print something NOW!"
Write-Host ""

try {
    $event = $watcher.WaitForNextEvent()
    $job = $event.TargetInstance
    
    $nameParts = $job.Name -split ', '
    $printerName = $nameParts[0]
    $jobId = if ($nameParts.Length -gt 1) { [int]$nameParts[1] } else { 0 }
    
    Write-Host "=== WMI EVENT CAPTURED ==="
    Write-Host "Printer: $printerName"
    Write-Host "JobId: $jobId"
    Write-Host "Document: $($job.Document)"
    Write-Host "WMI TotalPages: $($job.TotalPages)"
    Write-Host "WMI Color: $($job.Color)"
    Write-Host "WMI Size: $($job.Size)"
    Write-Host ""
    
    # 1. Try DEVMODE
    Write-Host "=== DEVMODE (Win32 GetJob) ==="
    $dm = [TestJobApi]::GetJobDevmode($printerName, $jobId)
    if ($dm) {
        Write-Host "  dmSize: $($dm[6])"
        Write-Host "  dmColor: $($dm[0]) (1=Mono, 2=Color)"
        Write-Host "  dmMediaType@196: $($dm[1])"
        Write-Host "  dmDuplex: $($dm[2])"
        Write-Host "  dmOrientation: $($dm[3])"
        Write-Host "  dmPaperSize: $($dm[4])"
        Write-Host "  dmCopies: $($dm[5])"
        
        if ($dm[6] -lt 200) {
            Write-Host "  *** WARNING: dmSize=$($dm[6]) is SMALL - offsets 92/196 may be WRONG for this driver! ***"
        }
    } else {
        Write-Host "  GetJobDevmode returned NULL (job may have already completed)"
    }
    Write-Host ""
    
    # 2. Try PrintTicket
    Write-Host "=== PRINTTICKET (System.Printing) ==="
    try {
        $server = New-Object System.Printing.LocalPrintServer
        $queue = $server.GetPrintQueue($printerName)
        if ($queue) {
            $jobs = $queue.GetPrintJobInfoCollection()
            foreach ($pj in $jobs) {
                if ($pj.JobIdentifier -eq $jobId) {
                    Write-Host "  NumberOfPages: $($pj.NumberOfPages)"
                    $ticket = $pj.JobTicket
                    if ($ticket -eq $null) { $ticket = $pj.PrintTicket }
                    if ($ticket) {
                        Write-Host "  PrintTicket: FOUND"
                        $xml = $ticket.GetXmlStream()
                        $reader = New-Object System.IO.StreamReader($xml)
                        $ticketXml = $reader.ReadToEnd()
                        $reader.Close()
                        
                        [xml]$doc = $ticketXml
                        $ns = New-Object System.Xml.XmlNamespaceManager($doc.NameTable)
                        $ns.AddNamespace("psf", "http://schemas.microsoft.com/windows/2003/08/printing/printschemaframework")
                        $ns.AddNamespace("psk", "http://schemas.microsoft.com/windows/2003/08/printing/printschemakeywords")
                        
                        $sizeNode = $doc.SelectSingleNode("//psf:Feature[@name='psk:PageMediaSize']/psf:Option", $ns)
                        if ($sizeNode) { Write-Host "  PaperSize: $($sizeNode.GetAttribute('name'))" }
                        else { Write-Host "  PaperSize: NOT IN TICKET" }
                        
                        $mediaNode = $doc.SelectSingleNode("//psf:Feature[@name='psk:PageMediaType']/psf:Option", $ns)
                        if ($mediaNode) { Write-Host "  MediaType: $($mediaNode.GetAttribute('name'))" }
                        else { Write-Host "  MediaType: NOT IN TICKET" }
                        
                        $colorNode = $doc.SelectSingleNode("//psf:Feature[@name='psk:PageOutputColor']/psf:Option", $ns)
                        if ($colorNode) { Write-Host "  ColorMode: $($colorNode.GetAttribute('name'))" }
                        else { Write-Host "  ColorMode: NOT IN TICKET" }
                        
                        # Check for DevmodeSnapshot
                        $dmSnapNode = $doc.SelectSingleNode("//psf:ParameterInit[contains(@name,'DevmodeSnapshot')]/psf:Value", $ns)
                        if ($dmSnapNode) {
                            Write-Host "  DevmodeSnapshot: FOUND (length=$($dmSnapNode.InnerText.Length))"
                            $dmBytes = [Convert]::FromBase64String($dmSnapNode.InnerText)
                            Write-Host "    Decoded size: $($dmBytes.Length) bytes"
                            Write-Host "    dmColor@92: $([BitConverter]::ToInt16($dmBytes, 92))"
                            Write-Host "    dmMediaType@196: $(if($dmBytes.Length -gt 197) { [BitConverter]::ToInt16($dmBytes, 196) } else { 'BEYOND SIZE' })"
                        } else {
                            Write-Host "  DevmodeSnapshot: NOT IN TICKET (EPSON doesn't provide this)"
                        }
                    } else {
                        Write-Host "  PrintTicket: NULL (EPSON typically doesn't attach tickets)"
                    }
                    break
                }
            }
            $queue.Dispose()
        }
        $server.Dispose()
    } catch {
        Write-Host "  Error: $_"
    }
    Write-Host ""
    
    # 3. Retry page count after delay 
    Write-Host "=== RETRY AFTER 3 SECONDS ==="
    Start-Sleep -Seconds 3
    try {
        $wmiRetryName = "$printerName, $jobId"
        $wmiRetry = Get-CimInstance Win32_PrintJob -Filter "Name='$wmiRetryName'" -ErrorAction Stop
        if ($wmiRetry) {
            Write-Host "  TotalPages (retry): $($wmiRetry.TotalPages)"
            Write-Host "  PagesPrinted (retry): $($wmiRetry.PagesPrinted)"
        } else {
            Write-Host "  Job already gone from spooler (completed)"
        }
    } catch {
        Write-Host "  Job already gone: $_"
    }
    
} catch {
    Write-Host "Timeout or error: $_"
}

$watcher.Dispose()
Write-Host ""
Write-Host "=== TEST COMPLETE ==="
