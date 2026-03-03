
$results = @()
try {
    $events = Get-WinEvent -FilterHashtable @{
        LogName = 'Microsoft-Windows-PrintService/Operational'
        ID = 307
        StartTime = (Get-Date).AddSeconds(-360000)
    } -ErrorAction Stop

    foreach ($evt in $events) {
        $id = 0
        $doc = "Unknown"
        $user = "Unknown"
        $printer = "Unknown"
        $port = "Unknown"
        $pages = 0
        $sizeBytes = 0

        try {
            $xml = [xml]$evt.ToXml()
            $ud = $xml.Event.UserData.DocumentPrinted
            if ($ud) {
                $id = $ud.Param1
                $doc = $ud.Param2
                $user = $ud.Param3
                $printer = $ud.Param5
                $port = $ud.Param6
                $sizeBytes = $ud.Param7
                $pages = $ud.Param8
            }
        } catch {
            try {
                if ($evt.Properties -and $evt.Properties.Count -ge 8) {
                    $id = $evt.Properties[0].Value
                    $doc = [string]$evt.Properties[1].Value
                    $user = [string]$evt.Properties[2].Value
                    $printer = [string]$evt.Properties[4].Value
                    $port = [string]$evt.Properties[5].Value
                    $sizeBytes = $evt.Properties[6].Value
                    $pages = $evt.Properties[7].Value
                }
            } catch {}
        }

        # Fallback: parse from message text (fixed regex — no double escaping)
        if ($pages -eq 0 -or $pages -eq $null) {
            $msg = $evt.Message
            if ($msg) {
                if ($msg -match '(\d+)\s+page') { $pages = [int]$Matches[1] }
                if ($msg -match 'Size in bytes:\s*(\d+)') { $sizeBytes = [long]$Matches[1] }
                if ($id -eq 0 -and $msg -match 'Document\s+(\d+)') { $id = [int]$Matches[1] }
                if ($doc -eq 'Unknown' -and $msg -match 'Document\s+\d+,\s+(.+?)\s+owned') { $doc = $Matches[1] }
                if ($user -eq 'Unknown' -and $msg -match 'owned by\s+(.+?)\s+on') { $user = $Matches[1] }
                if ($printer -eq 'Unknown' -and $msg -match 'printed on\s+(.+?)\s+through') { $printer = $Matches[1] }
            }
        }

        if ([int]$pages -le 0) { $pages = 1 }

        # Extract copies count
        $copies = 1
        # 1. Try to parse from event message
        try {
            $msg2 = $evt.Message
            if ($msg2) {
                if ($msg2 -match '(\d+)\s+cop(?:y|ies)') {
                    $parsedCopies = [int]$Matches[1]
                    if ($parsedCopies -gt 0) { $copies = $parsedCopies }
                }
            }
        } catch {}

        # 2. Try WMI for this specific job — get DEVMODE-level per-job settings
        # This is KEY: per-job DEVMODE has the actual paper size, media type, and page count
        $wmiTotalPages = 0
        $wmiMediaType = ""
        $wmiPaperSize = ""
        $wmiDuplex = ""
        if ($copies -le 1 -or $pages -le 1) {
            try {
                $wmiJobName = "$printer, $id"
                $wmiJob = Get-CimInstance Win32_PrintJob -Filter "Name='$wmiJobName'" -ErrorAction Stop
                if ($wmiJob) {
                    if ($wmiJob.TotalPages -gt 0) { $wmiTotalPages = [int]$wmiJob.TotalPages }
                    try {
                        if ($wmiJob.Parameters -match 'Copies=(\d+)') {
                            $parsedCopies = [int]$Matches[1]
                            if ($parsedCopies -gt 1) { $copies = $parsedCopies }
                        }
                    } catch {}
                }
            } catch {}
        }

        # Use WMI page count if it's higher than event log (drivers often under-report)
        if ($wmiTotalPages -gt [int]$pages) {
            $pages = $wmiTotalPages
        }

        # Get media type, paper size, duplex from PRINTER CONFIGURATION
        # Then try to get per-job overrides from WMI DEVMODE
        $mediaType = "Plain Paper"
        $paperSize = "A4"
        $duplexMode = "OneSided"
        $driverName = ""
        $colorMode = "Unknown"
        try {
            $pConfig = Get-PrintConfiguration -PrinterName $printer -ErrorAction Stop
            if ($pConfig.MediaType) { $mediaType = [string]$pConfig.MediaType }
            if ($pConfig.PaperSize) { $paperSize = [string]$pConfig.PaperSize }
            if ($pConfig.DuplexingMode) { $duplexMode = [string]$pConfig.DuplexingMode }
            if ($pConfig.Color -ne $null) { $colorMode = [string]$pConfig.Color }
        } catch {}
        try {
            $pInfo = Get-Printer -Name $printer -ErrorAction Stop
            $driverName = $pInfo.DriverName
        } catch {}

        # Try to get per-job DEVMODE paper size via PrinterProperties or recent PrintJob
        # Win32_PrintJob.Parameters sometimes contains paper info
        try {
            $wmiJobName2 = "$printer, $id"
            $wmiJob2 = Get-CimInstance Win32_PrintJob -Filter "Name='$wmiJobName2'" -ErrorAction Stop
            if ($wmiJob2) {
                # Check for paper size in Parameters string
                $params = [string]$wmiJob2.Parameters
                if ($params -match 'PaperSize=(\w+)') {
                    $wmiPaperSize = $Matches[1]
                }
                if ($params -match 'MediaType=(\w+)') {
                    $wmiMediaType = $Matches[1]
                }
                if ($params -match 'Duplex=(\w+)') {
                    $wmiDuplex = $Matches[1]
                }
            }
        } catch {}

        # Apply per-job overrides if available
        if ($wmiPaperSize -ne '') { $paperSize = $wmiPaperSize }
        if ($wmiMediaType -ne '') { $mediaType = $wmiMediaType }
        if ($wmiDuplex -ne '') { $duplexMode = $wmiDuplex }

        $results += [PSCustomObject]@{
            TimeCreated = [string]$evt.TimeCreated
            Id = [int]$id
            Document = [string]$doc
            User = [string]$user
            Printer = [string]$printer
            Port = [string]$port
            Pages = [int]$pages
            Copies = [int]$copies
            SizeBytes = [long]$sizeBytes
            MediaType = [string]$mediaType
            PaperSize = [string]$paperSize
            DuplexMode = [string]$duplexMode
            DriverName = [string]$driverName
            ColorMode = [string]$colorMode
        }
    }
} catch {
    # No events or log not enabled
}

if ($results.Count -eq 0) {
    "[]"
} else {
    $results | ConvertTo-Json -Depth 2
}
