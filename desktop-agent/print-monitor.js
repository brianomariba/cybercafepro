const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Track processed jobs to avoid duplicates
let processedJobIds = new Set();
// Cache printer capabilities
let printerCache = new Map();
// Cache printer page counters to avoid redundant calls
let printerPageCounterCache = { data: null, timestamp: 0 };
const PAGE_COUNTER_CACHE_TTL = 30000; // 30 seconds

/**
 * Run a PowerShell script reliably by writing to a temp .ps1 file.
 * This avoids ALL quoting/escaping issues with exec().
 */
function runPS(script, timeoutMs = 15000) {
    return new Promise((resolve) => {
        const tmpFile = path.join(os.tmpdir(), `hawknine_ps_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.ps1`);
        try {
            fs.writeFileSync(tmpFile, script, 'utf8');
        } catch (e) {
            console.error('[PrintMonitor] Failed to write temp PS1:', e.message);
            resolve('');
            return;
        }

        execFile('powershell.exe', [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy', 'Bypass',
            '-File', tmpFile
        ], { timeout: timeoutMs, maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
            // Cleanup temp file
            try { fs.unlinkSync(tmpFile); } catch (e) { /* ignore */ }

            if (error) {
                // Only log if it's not a timeout or empty result
                if (error.killed) {
                    console.error('[PrintMonitor] PowerShell timed out after', timeoutMs, 'ms');
                } else if (stderr && stderr.trim()) {
                    console.error('[PrintMonitor] PowerShell stderr:', stderr.trim().substring(0, 200));
                }
                resolve('');
                return;
            }
            resolve(stdout || '');
        });
    });
}

/**
 * Get detailed printer information with color capabilities
 */
async function getPrinterCapabilities(printerName) {
    if (printerCache.has(printerName)) {
        return printerCache.get(printerName);
    }

    // Query Windows for printer info AND its actual color configuration
    const script = `
try {
    $p = Get-Printer -Name "${printerName}" -ErrorAction Stop
    $colorCapable = $false
    try {
        $config = Get-PrintConfiguration -PrinterName "${printerName}" -ErrorAction Stop
        # Check if Color property VALUE indicates color support (not just existence)
        if ($config.Color -eq $true -or [string]$config.Color -eq 'True') {
            $colorCapable = $true
        }
    } catch {}
    $obj = @{
        Name = $p.Name
        DriverName = $p.DriverName
        PortName = $p.PortName
        PrinterStatus = $p.PrinterStatus
        Type = [string]$p.Type
        ColorCapable = $colorCapable
    }
    $obj | ConvertTo-Json
} catch {
    '{"error":"not found"}'
}
`;
    const stdout = await runPS(script);
    if (!stdout || stdout.trim() === '' || stdout.includes('"error"')) {
        return { isColor: false, capabilities: 'unknown' };
    }

    try {
        const info = JSON.parse(stdout);
        const driverLower = (info.DriverName || '').toLowerCase();
        const nameLower = (info.Name || '').toLowerCase();
        // Use Windows-reported color capability first, fall back to heuristic
        const isColor = info.ColorCapable === true || detectColorCapability(nameLower, driverLower);

        const result = {
            isColor,
            driver: info.DriverName,
            port: info.PortName,
            status: info.PrinterStatus,
            type: info.Type
        };

        printerCache.set(printerName, result);
        return result;
    } catch (e) {
        return { isColor: false, capabilities: 'unknown' };
    }
}

/**
 * Detect if a printer supports color based on name and driver keywords.
 * This is a universal heuristic fallback — no model-specific hardcoding.
 * The primary detection is via Windows PrintConfiguration (see getPrinterCapabilities & getInstalledPrinters).
 */
function detectColorCapability(nameLower, driverLower) {
    const combined = (nameLower + ' ' + driverLower);

    // Known B&W only technology keywords (check first to override)
    const bwKeywords = ['mono', 'monochrome', 'grayscale', 'greyscale'];
    for (const kw of bwKeywords) {
        if (combined.includes(kw)) return false;
    }

    // Generic color technology keywords (works for any brand/model)
    const colorKeywords = [
        'color', 'colour',          // Explicit color in name/driver
        'inkjet', 'ink jet',        // Inkjet printers are almost always color
        'deskjet', 'officejet',     // HP inkjet lines
        'photosmart', 'envy',       // HP color lines
        'pixma',                    // Canon inkjet
        'ecotank', 'eco tank',      // Epson EcoTank (all color)
        'workforce',                // Epson WorkForce (color)
        'expression',               // Epson Expression (color)
        'mfc-j',                    // Brother inkjet MFC series
        'stylus',                   // Epson Stylus (color inkjet)
        'supertank',                // Various brands refillable
        'megatank',                 // Canon refillable
    ];
    for (const kw of colorKeywords) {
        if (combined.includes(kw)) return true;
    }

    return false; // Default: unknown = treat as B&W (safer for billing)
}

/**
 * Infer paper size from document name and size bytes
 */
function inferPaperSize(documentName, sizeBytes) {
    const docLower = (documentName || '').toLowerCase();
    if (docLower.includes('a3')) return 'A3';
    if (docLower.includes('a4')) return 'A4';
    if (docLower.includes('a5')) return 'A5';
    if (docLower.includes('legal')) return 'Legal';
    if (docLower.includes('letter')) return 'Letter';
    if (docLower.includes('photo') || docLower.includes('4x6')) return '4x6 Photo';
    if (docLower.includes('envelope') || docLower.includes('env')) return 'Envelope';
    return 'A4';
}

/**
 * Get print quality from document name hints
 */
function inferPrintQuality(documentName, driverName) {
    const docLower = (documentName || '').toLowerCase();
    const driverLower = (driverName || '').toLowerCase();
    if (docLower.includes('draft') || docLower.includes('low')) return 'Draft';
    if (docLower.includes('photo') || docLower.includes('high') || docLower.includes('best')) return 'High Quality';
    if (driverLower.includes('photo')) return 'Photo Quality';
    return 'Normal';
}

/**
 * Detect if the print job is color or B&W based on multiple signals.
 * 
 * Priority order:
 * 1. Per-job DEVMODE color setting (JobColor) - this is what the user actually selected
 * 2. Document name heuristics as secondary signal
 * 3. Printer capability as final fallback
 * 
 * IMPORTANT: job.Color from Get-PrintConfiguration is the PRINTER DEFAULT, not per-job.
 * job.JobColor from Win32_PrintJob DEVMODE is the ACTUAL per-job setting.
 */
function detectPrintType(job) {
    const driverLower = (job.DriverName || job.printerDriver || '').toLowerCase();
    const printerNameLower = (job.PrinterName || job.printer || '').toLowerCase();
    const docNameLower = (job.DocumentName || job.document || '').toLowerCase();

    // 1. Per-job DEVMODE color setting (most reliable - this is what user actually chose)
    // Values: 1 = Monochrome/B&W, 2 = Color (from DEVMODE dmColor field)
    if (job.JobColor !== undefined && job.JobColor !== null && job.JobColor !== 'Unknown') {
        const jobColorVal = typeof job.JobColor === 'string' ? job.JobColor.toLowerCase().trim() : job.JobColor;
        if (jobColorVal === 1 || jobColorVal === '1' || jobColorVal === 'monochrome' ||
            jobColorVal === 'grayscale' || jobColorVal === 'false') {
            return 'bw';
        }
        if (jobColorVal === 2 || jobColorVal === '2' || jobColorVal === 'color' || jobColorVal === 'true') {
            return 'color';
        }
    }

    // 2. If Color field explicitly indicates monochrome/false, it's B&W
    // NOTE: job.Color from Get-PrintConfiguration is the printer default - only trust explicit B&W indicators
    if (job.Color === false || (typeof job.Color === 'string' &&
        (job.Color.toLowerCase() === 'false' || job.Color.toLowerCase() === 'monochrome' || job.Color.toLowerCase() === 'grayscale'))) {
        return 'bw';
    }

    // 3. Check if the printer even supports color
    const isColorPrinter = detectColorCapability(printerNameLower, driverLower);
    if (!isColorPrinter) return 'bw';

    // 4. Document name heuristics
    const bwDocIndicators = ['text', 'draft', 'invoice', 'receipt', 'contract', 'form',
        'memo', 'report', 'spreadsheet', 'b&w', 'bw', 'black', 'mono', 'grayscale',
        'blueprint', 'schematic', 'diagram', 'outline', 'notes', 'resume', 'cv'];
    const bwExtensions = ['.txt', '.csv', '.log'];

    const isBWDocument = bwDocIndicators.some(kw => docNameLower.includes(kw)) ||
        bwExtensions.some(ext => docNameLower.includes(ext));
    if (isBWDocument) return 'bw';

    const colorDocIndicators = ['color', 'photo', 'image', 'poster', 'flyer', 'banner',
        'brochure', 'certificate', 'presentation', 'slide'];
    const colorExtensions = ['.jpg', '.png', '.jpeg', '.bmp', '.tiff', '.gif', '.pptx', '.ppt'];

    const isColorDocument = colorDocIndicators.some(kw => docNameLower.includes(kw)) ||
        colorExtensions.some(ext => docNameLower.includes(ext));
    if (isColorDocument) return 'color';

    // 5. If printer default is color (from Get-PrintConfiguration) AND no other signals, 
    //    default to B&W to be safe for billing. Only tag as color when we have positive evidence.
    return 'bw';
}

/**
 * Fetches detailed print jobs from the local Windows Spooler
 * Includes color detection, paper size, and comprehensive job details
 */
async function getRecentPrintJobs() {
    const script = `
$results = @()
try {
    $allPrinters = Get-Printer -ErrorAction Stop

    # Get per-job color info from WMI Win32_PrintJob (DEVMODE-level, per-job accuracy)
    $wmiJobs = @{}
    try {
        $wmiPrintJobs = Get-WmiObject Win32_PrintJob -ErrorAction Stop
        foreach ($wj in $wmiPrintJobs) {
            # Key: PrinterName + JobId
            $jobKey = "$($wj.Name)"
            $wmiJobs[$jobKey] = @{
                Color = $wj.Color
                Document = $wj.Document
                PagesPrinted = $wj.PagesPrinted
                TotalPages = $wj.TotalPages
            }
        }
    } catch {}

    foreach ($printer in $allPrinters) {
        $printerConfig = $null
        try {
            $printerConfig = Get-PrintConfiguration -PrinterName $printer.Name -ErrorAction Stop
        } catch {}

        $jobs = @()
        try {
            $jobs = @(Get-PrintJob -PrinterName $printer.Name -ErrorAction Stop)
        } catch {}

        foreach ($job in $jobs) {
            $paperSize = "Unknown"
            $duplexMode = "Unknown"
            $colorMode = "Unknown"
            $jobColorMode = "Unknown"
            $collate = $false

            if ($printerConfig -ne $null) {
                $paperSize = [string]$printerConfig.PaperSize
                $duplexMode = [string]$printerConfig.DuplexingMode
                $colorMode = [string]$printerConfig.Color
                $collate = [bool]$printerConfig.Collate
            }

            # Try to find per-job color info from WMI DEVMODE
            # Win32_PrintJob.Name format is "PrinterName, JobId"
            $wmiKey = "$($printer.Name), $($job.Id)"
            if ($wmiJobs.ContainsKey($wmiKey)) {
                $wmiColor = $wmiJobs[$wmiKey].Color
                if ($wmiColor -ne $null) {
                    # DEVMODE dmColor: 1 = Monochrome, 2 = Color
                    $jobColorMode = [string]$wmiColor
                }
            }

            $results += [PSCustomObject]@{
                Id = $job.Id
                PrinterName = $printer.Name
                PrinterType = [string]$printer.Type
                PrinterStatus = $printer.PrinterStatus
                DriverName = $printer.DriverName
                PortName = $printer.PortName
                PrinterLocation = $printer.Location
                DocumentName = $job.DocumentName
                JobStatus = [string]$job.JobStatus
                TotalPages = $job.TotalPages
                PagesPrinted = $job.PagesPrinted
                Size = $job.Size
                SubmittedTime = [string]$job.SubmittedTime
                UserName = $job.UserName
                Priority = $job.Priority
                PaperSize = $paperSize
                DuplexingMode = $duplexMode
                Color = $colorMode
                JobColor = $jobColorMode
                Collate = $collate
            }
        }
    }
} catch {
    Write-Error $_.Exception.Message
}

if ($results.Count -eq 0) {
    "[]"
} else {
    $results | ConvertTo-Json -Depth 3
}
`;

    const stdout = await runPS(script);
    if (!stdout || stdout.trim() === '' || stdout.trim() === '[]') {
        return [];
    }

    try {
        const parsed = JSON.parse(stdout);
        const jobs = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);

        return jobs.filter(job => job && job.Id).map(job => {
            const printType = detectPrintType(job);
            const isColorPrinter = detectColorCapability(
                (job.PrinterName || '').toLowerCase(),
                (job.DriverName || '').toLowerCase()
            );
            const sizeKB = job.Size ? Math.round(job.Size / 1024) : 0;

            let paperSize = job.PaperSize || 'Unknown';
            if (paperSize === 'Unknown' || !paperSize) {
                paperSize = inferPaperSize(job.DocumentName, job.Size);
            }

            let duplexMode = 'Single-sided';
            if (job.DuplexingMode) {
                const duplex = job.DuplexingMode.toString().toLowerCase();
                if (duplex.includes('twosided') || duplex.includes('duplex') || duplex.includes('both')) {
                    duplexMode = 'Double-sided';
                } else if (duplex.includes('longedge')) {
                    duplexMode = 'Double-sided (Long Edge)';
                } else if (duplex.includes('shortedge')) {
                    duplexMode = 'Double-sided (Short Edge)';
                }
            }

            const printQuality = inferPrintQuality(job.DocumentName, job.DriverName);

            return {
                id: job.Id,
                jobId: `${job.PrinterName}-${job.Id}`,
                printer: job.PrinterName || 'Unknown',
                printerType: job.PrinterType || 'Local',
                printerDriver: job.DriverName || 'Unknown',
                printerPort: job.PortName || 'Unknown',
                printerLocation: job.PrinterLocation || '',
                printerStatus: job.PrinterStatus || 'Unknown',
                document: job.DocumentName || 'Untitled',
                documentName: job.DocumentName || 'Untitled',
                status: job.JobStatus || 'Spooling',
                totalPages: job.TotalPages || 1,
                pagesPrinted: job.PagesPrinted || 0,
                printType: printType,
                isColorPrinter: isColorPrinter,
                isColorPrint: printType === 'color',
                paperSize: paperSize,
                duplexMode: duplexMode,
                printQuality: printQuality,
                collate: job.Collate || false,
                sizeKB: sizeKB,
                sizeBytes: job.Size || 0,
                submitted: job.SubmittedTime,
                user: job.UserName || 'Unknown',
                priority: job.Priority || 'Normal',
                timestamp: new Date().toISOString()
            };
        });
    } catch (e) {
        console.error('[PrintMonitor] Print job parse error:', e.message);
        return [];
    }
}

/**
 * Enable Windows Print Service Operational Logging
 * Required for history tracking of completed jobs
 */
function enablePrintLogging() {
    execFile('wevtutil', ['sl', 'Microsoft-Windows-PrintService/Operational', '/e:true'], (err) => {
        if (err) {
            console.error('[PrintMonitor] Failed to enable print logging (may need admin):', err.message);
        } else {
            console.log('[PrintMonitor] Print Service Operational logging enabled');
        }
    });
}

/**
 * Get print history from Windows Event Log (completed jobs)
 * This captures jobs that have already finished printing
 */
async function getPrintHistory(hoursBack = 24) {
    const script = `
$results = @()
try {
    $events = Get-WinEvent -FilterHashtable @{
        LogName = 'Microsoft-Windows-PrintService/Operational'
        ID = 307
        StartTime = (Get-Date).AddHours(-${hoursBack})
    } -ErrorAction Stop

    foreach ($evt in ($events | Select-Object -First 50)) {
        $id = 0
        $doc = "Unknown"
        $user = "Unknown"
        $printer = "Unknown"
        $pages = 0
        $sizeBytes = 0

        try {
            $xml = [xml]$evt.ToXml()
            $userData = $xml.Event.UserData.DocumentPrinted
            if ($userData) {
                $id = $userData.Param1
                $doc = $userData.Param2
                $user = $userData.Param3
                $printer = $userData.Param4
                $sizeBytes = $userData.Param6
                $pages = $userData.Param7
            }
        } catch {
            $msg = $evt.Message
            if ($msg -match 'Document (\\d+), (.+?) owned') {
                $id = [int]$Matches[1]
                $doc = $Matches[2]
            }
            if ($msg -match 'owned by (.+?) on') { $user = $Matches[1] }
            if ($msg -match 'printed on (.+?) through') { $printer = $Matches[1] }
            if ($msg -match 'pages printed: (\\d+)') { $pages = [int]$Matches[1] }
        }

        $results += [PSCustomObject]@{
            TimeCreated = [string]$evt.TimeCreated
            Id = $id
            Document = $doc
            User = $user
            Printer = $printer
            Pages = $pages
            SizeBytes = $sizeBytes
        }
    }
} catch {
    # No events found or log not enabled - this is normal
}

if ($results.Count -eq 0) {
    "[]"
} else {
    $results | ConvertTo-Json -Depth 2
}
`;

    const stdout = await runPS(script);
    if (!stdout || stdout.trim() === '' || stdout.trim() === '[]') {
        return [];
    }

    try {
        const parsed = JSON.parse(stdout);
        const history = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);

        return history.filter(h => h).map(h => {
            const printType = detectPrintType({
                PrinterName: h.Printer,
                DocumentName: h.Document,
                DriverName: ''
            });

            let enhancedPrintType = printType;
            if (printerCache.has(h.Printer)) {
                const cached = printerCache.get(h.Printer);
                if (!cached.isColor) {
                    enhancedPrintType = 'bw';
                }
            }

            return {
                id: h.Id || 0,
                jobId: h.Id ? `${h.Printer}-${h.Id}` : null,
                timestamp: h.TimeCreated ? new Date(h.TimeCreated).toISOString() : new Date().toISOString(),
                document: h.Document,
                user: h.User,
                printer: h.Printer,
                pages: parseInt(h.Pages || 1),
                totalPages: parseInt(h.Pages || 1),
                sizeBytes: parseInt(h.SizeBytes || 0),
                printType: enhancedPrintType,
                isColorPrint: enhancedPrintType === 'color',
                status: 'completed'
            };
        });
    } catch (e) {
        console.error('[PrintMonitor] Print History Parse Error:', e.message);
        return [];
    }
}

/**
 * Get list of installed printers with their capabilities and page counters
 * Uses temp .ps1 file execution for reliability on any Windows machine
 */
async function getInstalledPrinters() {
    const script = `
$allPrinters = @()

$modernPrinters = @()
try {
    $modernPrinters = @(Get-Printer -ErrorAction Stop | Select-Object Name, Type, DriverName, PortName, Shared, Published, DeviceType, PrinterStatus)
} catch {}

$wmiPrinters = @()
try {
    $wmiPrinters = @(Get-WmiObject Win32_Printer -ErrorAction Stop | Select-Object Name, DriverName, PortName, Shared, WorkOffline, PrinterStatus, PrinterState, PrintProcessor, Comment, Location, Default, Network, Local, SpoolEnabled, JobCountSinceLastReset, AveragePagesPerMinute)
} catch {}

$perfCounters = @()
try {
    $perfCounters = @(Get-WmiObject Win32_PerfFormattedData_Spooler_PrintQueue -ErrorAction Stop | Select-Object Name, TotalPagesPrinted, TotalJobsPrinted, BytesPrintedPersec, JobErrors)
} catch {}

$perfLookup = @{}
foreach ($perf in $perfCounters) {
    if ($perf.Name -and $perf.Name -ne '_Total') {
        $perfLookup[$perf.Name] = @{
            TotalPagesPrinted = [int]$perf.TotalPagesPrinted
            TotalJobsPrinted = [int]$perf.TotalJobsPrinted
            JobErrors = [int]$perf.JobErrors
        }
    }
}

$wmiLookup = @{}
foreach ($p in $wmiPrinters) {
    if ($p.Name) {
        $wmiLookup[$p.Name] = $p
    }
}

foreach ($p in $modernPrinters) {
    $wmi = $null
    $perf = $null
    if ($wmiLookup.ContainsKey($p.Name)) { $wmi = $wmiLookup[$p.Name] }
    if ($perfLookup.ContainsKey($p.Name)) { $perf = $perfLookup[$p.Name] }

    $status = $p.PrinterStatus
    $isOnline = ($status -eq 0 -or $status -eq 3)
    if ($wmi -ne $null -and $wmi.WorkOffline) { $isOnline = $false }

    $colorCapable = $false
    try {
        $config = Get-PrintConfiguration -PrinterName $p.Name -ErrorAction Stop
        # Check if the Color VALUE is True, not just if the property exists
        if ($config.Color -eq $true -or [string]$config.Color -eq 'True') { $colorCapable = $true }
    } catch {}

    $commentVal = ""
    $locationVal = ""
    $isDefaultVal = $false
    $isNetworkVal = $false
    $isLocalVal = $true
    $spoolVal = $true
    $printProcVal = ""
    $jobCountVal = 0
    $avgPagesVal = 0

    if ($wmi -ne $null) {
        $commentVal = [string]$wmi.Comment
        $locationVal = [string]$wmi.Location
        $isDefaultVal = [bool]$wmi.Default
        $isNetworkVal = [bool]$wmi.Network
        $isLocalVal = [bool]$wmi.Local
        $spoolVal = [bool]$wmi.SpoolEnabled
        $printProcVal = [string]$wmi.PrintProcessor
        $jobCountVal = [int]$wmi.JobCountSinceLastReset
        $avgPagesVal = [int]$wmi.AveragePagesPerMinute
    }

    $totalPagesVal = 0
    $totalJobsVal = 0
    $jobErrorsVal = 0
    if ($perf -ne $null) {
        $totalPagesVal = [int]$perf.TotalPagesPrinted
        $totalJobsVal = [int]$perf.TotalJobsPrinted
        $jobErrorsVal = [int]$perf.JobErrors
    }

    $allPrinters += [PSCustomObject]@{
        Name = $p.Name
        Type = [string]$p.Type
        DriverName = $p.DriverName
        PortName = $p.PortName
        Shared = [bool]$p.Shared
        Status = $status
        IsOnline = $isOnline
        ColorCapable = $colorCapable
        Source = "Modern"
        Comment = $commentVal
        Location = $locationVal
        IsDefault = $isDefaultVal
        IsNetwork = $isNetworkVal
        IsLocal = $isLocalVal
        SpoolEnabled = $spoolVal
        PrintProcessor = $printProcVal
        JobCountSinceLastReset = $jobCountVal
        AveragePagesPerMinute = $avgPagesVal
        TotalPagesPrinted = $totalPagesVal
        TotalJobsPrinted = $totalJobsVal
        JobErrors = $jobErrorsVal
    }
}

foreach ($p in $wmiPrinters) {
    $alreadyExists = $false
    foreach ($mp in $modernPrinters) {
        if ($mp.Name -eq $p.Name) { $alreadyExists = $true; break }
    }

    if (-not $alreadyExists) {
        $perf = $null
        if ($perfLookup.ContainsKey($p.Name)) { $perf = $perfLookup[$p.Name] }

        $statusVal = 0
        if ($p.WorkOffline) { $statusVal = 8 }

        $totalPagesVal = 0
        $totalJobsVal = 0
        $jobErrorsVal = 0
        if ($perf -ne $null) {
            $totalPagesVal = [int]$perf.TotalPagesPrinted
            $totalJobsVal = [int]$perf.TotalJobsPrinted
            $jobErrorsVal = [int]$perf.JobErrors
        }

        $colorCapable = $false
        try {
            $config = Get-PrintConfiguration -PrinterName $p.Name -ErrorAction Stop
            # Check if the Color VALUE is True, not just if the property exists
            if ($config.Color -eq $true -or [string]$config.Color -eq 'True') { $colorCapable = $true }
        } catch {}

        $allPrinters += [PSCustomObject]@{
            Name = $p.Name
            Type = "Local"
            DriverName = $p.DriverName
            PortName = $p.PortName
            Shared = [bool]$p.Shared
            Status = $statusVal
            IsOnline = (-not $p.WorkOffline)
            ColorCapable = $colorCapable
            Source = "WMI"
            Comment = [string]$p.Comment
            Location = [string]$p.Location
            IsDefault = [bool]$p.Default
            IsNetwork = [bool]$p.Network
            IsLocal = [bool]$p.Local
            SpoolEnabled = [bool]$p.SpoolEnabled
            PrintProcessor = [string]$p.PrintProcessor
            JobCountSinceLastReset = [int]$p.JobCountSinceLastReset
            AveragePagesPerMinute = [int]$p.AveragePagesPerMinute
            TotalPagesPrinted = $totalPagesVal
            TotalJobsPrinted = $totalJobsVal
            JobErrors = $jobErrorsVal
        }
    }
}

if ($allPrinters.Count -eq 0) {
    "[]"
} else {
    @($allPrinters) | ConvertTo-Json -Depth 2
}
`;

    const stdout = await runPS(script, 20000);
    if (!stdout || stdout.trim() === '' || stdout.trim() === '[]') {
        console.log('[PrintMonitor] No printers found');
        return [];
    }

    try {
        const parsed = JSON.parse(stdout);
        const printers = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);

        const result = printers.map(p => {
            const driverLower = (p.DriverName || '').toLowerCase();
            const nameLower = (p.Name || '').toLowerCase();
            // Use Windows-reported ColorCapable first, fall back to name heuristic
            const isColor = p.ColorCapable === true || detectColorCapability(nameLower, driverLower);

            // Cache printer capabilities for use by print history
            printerCache.set(p.Name, {
                isColor,
                driver: p.DriverName,
                port: p.PortName,
                status: p.Status,
                type: p.Type
            });

            return {
                name: p.Name,
                type: p.Type,
                driver: p.DriverName,
                port: p.PortName,
                shared: p.Shared,
                status: typeof p.Status === 'number' ? getPrinterStatusText(p.Status) : (p.Status || 'Unknown'),
                statusCode: p.Status,
                isColor: isColor,
                isOnline: p.IsOnline === true || p.Status === 0 || p.Status === 3,
                isDefault: p.IsDefault || false,
                isNetwork: p.IsNetwork || false,
                isLocal: p.IsLocal !== false,
                location: p.Location || '',
                comment: p.Comment || '',
                printProcessor: p.PrintProcessor || '',
                spoolEnabled: p.SpoolEnabled !== false,
                totalPagesPrinted: p.TotalPagesPrinted || 0,
                totalJobsPrinted: p.TotalJobsPrinted || 0,
                jobCountSinceLastReset: p.JobCountSinceLastReset || 0,
                averagePagesPerMinute: p.AveragePagesPerMinute || 0,
                jobErrors: p.JobErrors || 0
            };
        });

        console.log(`[PrintMonitor] Found ${result.length} printer(s):`, result.map(p => p.name).join(', '));
        return result;
    } catch (e) {
        console.error('[PrintMonitor] Printer List Parse Error:', e.message);
        return [];
    }
}

/**
 * Get a comprehensive snapshot of all printer data including page counts
 * from both spooler-level counters and event log history analysis
 */
async function getAllPrinterData() {
    try {
        const [printers, recentJobs, history] = await Promise.all([
            getInstalledPrinters(),
            getRecentPrintJobs(),
            getPrintHistory(24)
        ]);

        // Aggregate page counts from event log history per printer
        const printerHistoryStats = {};
        for (const job of history) {
            const printerName = job.printer || 'Unknown';
            if (!printerHistoryStats[printerName]) {
                printerHistoryStats[printerName] = {
                    totalPages: 0, bwPages: 0, colorPages: 0,
                    totalJobs: 0, bwJobs: 0, colorJobs: 0
                };
            }
            const pages = job.pages || job.totalPages || 1;
            printerHistoryStats[printerName].totalPages += pages;
            printerHistoryStats[printerName].totalJobs += 1;

            if (job.printType === 'color') {
                printerHistoryStats[printerName].colorPages += pages;
                printerHistoryStats[printerName].colorJobs += 1;
            } else {
                printerHistoryStats[printerName].bwPages += pages;
                printerHistoryStats[printerName].bwJobs += 1;
            }
        }

        // Merge history stats into printer data
        const enrichedPrinters = printers.map(printer => {
            const historyStats = printerHistoryStats[printer.name] || {
                totalPages: 0, bwPages: 0, colorPages: 0,
                totalJobs: 0, bwJobs: 0, colorJobs: 0
            };

            return {
                ...printer,
                last24h: historyStats,
                activeJobs: recentJobs.filter(j => j.printer === printer.name).length
            };
        });

        return {
            printers: enrichedPrinters,
            activeJobs: recentJobs,
            recentHistory: history,
            summary: {
                totalPrinters: printers.length,
                onlinePrinters: printers.filter(p => p.isOnline).length,
                colorPrinters: printers.filter(p => p.isColor).length,
                totalActiveJobs: recentJobs.length,
                last24h: {
                    totalPages: Object.values(printerHistoryStats).reduce((sum, s) => sum + s.totalPages, 0),
                    bwPages: Object.values(printerHistoryStats).reduce((sum, s) => sum + s.bwPages, 0),
                    colorPages: Object.values(printerHistoryStats).reduce((sum, s) => sum + s.colorPages, 0),
                    totalJobs: history.length
                }
            }
        };
    } catch (e) {
        console.error('[PrintMonitor] getAllPrinterData error:', e);
        return {
            printers: [],
            activeJobs: [],
            recentHistory: [],
            summary: {
                totalPrinters: 0, onlinePrinters: 0, colorPrinters: 0,
                totalActiveJobs: 0,
                last24h: { totalPages: 0, bwPages: 0, colorPages: 0, totalJobs: 0 }
            }
        };
    }
}

/**
 * Convert printer status code to text
 */
function getPrinterStatusText(code) {
    const statusMap = {
        0: 'Ready',
        1: 'Paused',
        2: 'Error',
        3: 'Pending Deletion',
        4: 'Paper Jam',
        5: 'Paper Out',
        6: 'Manual Feed Required',
        7: 'Paper Problem',
        8: 'Offline',
        9: 'IO Active',
        10: 'Busy',
        11: 'Printing',
        12: 'Output Bin Full',
        13: 'Not Available',
        14: 'Waiting',
        15: 'Processing',
        16: 'Initializing',
        17: 'Warming Up',
        18: 'Toner Low',
        19: 'No Toner',
        20: 'Page Punt',
        21: 'User Intervention Required',
        22: 'Out of Memory',
        23: 'Door Open',
        24: 'Server Unknown',
        25: 'Power Save'
    };
    return statusMap[code] || 'Unknown';
}

/**
 * Clear the printer cache (call when printers might have changed)
 */
function clearPrinterCache() {
    printerCache.clear();
    printerPageCounterCache = { data: null, timestamp: 0 };
}

module.exports = {
    getRecentPrintJobs,
    getPrintHistory,
    getInstalledPrinters,
    getPrinterCapabilities,
    getAllPrinterData,
    clearPrinterCache,
    enablePrintLogging,
    detectPrintType,
    detectColorCapability
};
