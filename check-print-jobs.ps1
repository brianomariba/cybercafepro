$output = @()

$events = Get-WinEvent -FilterHashtable @{
    LogName='Microsoft-Windows-PrintService/Operational'
    ID=307
} -MaxEvents 10 -ErrorAction SilentlyContinue

$output += "=== RECENT PRINT JOBS ==="
foreach ($evt in $events) {
    $xml = [xml]$evt.ToXml()
    $ud = $xml.Event.UserData.DocumentPrinted
    $output += "Time=$($evt.TimeCreated) | ID=$($ud.Param1) | Doc=$($ud.Param2) | Printer=$($ud.Param5) | Pages=$($ud.Param8) | Size=$($ud.Param7)"
}

$output += ""
$output += "=== PRINTER COLOR CONFIG ==="
$printers = Get-Printer -ErrorAction SilentlyContinue
foreach ($p in $printers) {
    try {
        $config = Get-PrintConfiguration -PrinterName $p.Name -ErrorAction Stop
        $output += "Printer=$($p.Name) | Driver=$($p.DriverName) | ColorConfig=$($config.Color) | Paper=$($config.PaperSize)"
    } catch {}
}

$output | Out-File -FilePath "C:\Users\Admin\OneDrive\Desktop\HawkNine\print-diag.txt" -Encoding utf8
Write-Host "Done. Check print-diag.txt"
