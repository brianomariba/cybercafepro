const { exec } = require('child_process');

// Track processed jobs to avoid duplicates
let processedJobIds = new Set();
// Cache printer capabilities
let printerCache = new Map();
// Cache printer page counters to avoid redundant calls
let printerPageCounterCache = { data: null, timestamp: 0 };
const PAGE_COUNTER_CACHE_TTL = 30000; // 30 seconds

/**
 * Get detailed printer information with color capabilities
 */
async function getPrinterCapabilities(printerName) {
    if (printerCache.has(printerName)) {
        return printerCache.get(printerName);
    }

    return new Promise((resolve) => {
        const psCommand = `
            Get-Printer -Name "${printerName}" | Select-Object Name, DriverName, PortName, PrinterStatus, Type |
            ConvertTo-Json
        `;

        exec(`powershell -Command "${psCommand}"`, (error, stdout) => {
            if (error || !stdout) {
                resolve({ isColor: false, capabilities: 'unknown' });
                return;
            }

            try {
                const info = JSON.parse(stdout);
                const driverLower = (info.DriverName || '').toLowerCase();
                const nameLower = (info.Name || '').toLowerCase();

                const isColor = detectColorCapability(nameLower, driverLower);

                const result = {
                    isColor,
                    driver: info.DriverName,
                    port: info.PortName,
                    status: info.PrinterStatus,
                    type: info.Type
                };

                printerCache.set(printerName, result);
                resolve(result);
            } catch (e) {
                resolve({ isColor: false, capabilities: 'unknown' });
            }
        });
    });
}

/**
 * Detect if a printer supports color based on name and driver
 */
function detectColorCapability(nameLower, driverLower) {
    // Known color keywords
    const colorKeywords = ['color', 'colour', 'officejet', 'photosmart', 'deskjet',
        'inkjet', 'envy', 'pixma', 'workforce', 'ecotank', 'mfc-j', 'mfc-l3',
        'brother hl-l3', 'xerox workcentre', 'xerox versalink c', 'canon imageclass mf6'];
    // Known B&W only keywords (override color detection)
    const bwKeywords = ['mono', 'laserjet pro m1', 'laserjet pro m4', 'laserjet p1',
        'laserjet p2', 'laserjet 1', 'laserjet 4', 'brother hl-l2'];

    const combined = (nameLower + ' ' + driverLower);

    // Check B&W overrides first
    for (const kw of bwKeywords) {
        if (combined.includes(kw)) return false;
    }

    // Check color indicators
    for (const kw of colorKeywords) {
        if (combined.includes(kw)) return true;
    }

    // HP LaserJet Pro with CP, CM or color model numbers
    if (combined.includes('hp laserjet') && (combined.includes('cp') || combined.includes('cm'))) return true;

    return false;
}

/**
 * Infer paper size from document name and size bytes
 */
function inferPaperSize(documentName, sizeBytes) {
    const docLower = (documentName || '').toLowerCase();

    // Check document name hints first
    if (docLower.includes('a3')) return 'A3';
    if (docLower.includes('a4')) return 'A4';
    if (docLower.includes('a5')) return 'A5';
    if (docLower.includes('legal')) return 'Legal';
    if (docLower.includes('letter')) return 'Letter';
    if (docLower.includes('photo') || docLower.includes('4x6') || docLower.includes('4\"x6\"')) return '4x6 Photo';
    if (docLower.includes('5x7')) return '5x7 Photo';
    if (docLower.includes('8x10')) return '8x10 Photo';
    if (docLower.includes('envelope') || docLower.includes('env')) return 'Envelope';
    if (docLower.includes('label')) return 'Label';

    // Default to A4 which is most common
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
 * Detect if the print job is color or B&W based on multiple signals
 */
function detectPrintType(job) {
    const driverLower = (job.DriverName || job.printerDriver || '').toLowerCase();
    const printerNameLower = (job.PrinterName || job.printer || '').toLowerCase();
    const docNameLower = (job.DocumentName || job.document || '').toLowerCase();

    // 1. Check job's explicit color configuration from printer settings
    if (job.Color === true || (typeof job.Color === 'string' && job.Color.toLowerCase() === 'true')) {
        return 'color';
    }

    // 2. Check if explicitly set to grayscale/mono
    if (job.Color === false || (typeof job.Color === 'string' &&
        (job.Color.toLowerCase() === 'false' || job.Color.toLowerCase() === 'monochrome' || job.Color.toLowerCase() === 'grayscale'))) {
        return 'bw';
    }

    // 3. Check printer capabilities
    const isColorPrinter = detectColorCapability(printerNameLower, driverLower);

    // 4. Check document name hints for color content
    const colorDocIndicators = ['color', 'photo', 'image', 'poster', 'flyer', 'banner',
        'brochure', 'certificate', 'presentation', 'slide'];
    const colorExtensions = ['.jpg', '.png', '.jpeg', '.bmp', '.tiff', '.gif', '.pptx', '.ppt'];

    const isColorDocument = colorDocIndicators.some(kw => docNameLower.includes(kw)) ||
        colorExtensions.some(ext => docNameLower.includes(ext));

    // 5. B&W document indicators
    const bwDocIndicators = ['text', 'draft', 'invoice', 'receipt', 'contract', 'form',
        'memo', 'report', 'spreadsheet', 'b&w', 'bw', 'black', 'mono', 'grayscale'];
    const bwExtensions = ['.txt', '.csv', '.log'];

    const isBWDocument = bwDocIndicators.some(kw => docNameLower.includes(kw)) ||
        bwExtensions.some(ext => docNameLower.includes(ext));

    if (isBWDocument) return 'bw';
    if (isColorPrinter && isColorDocument) return 'color';
    if (!isColorPrinter) return 'bw';

    // Default: if color printer but no clear signal, use 'bw' (safer for billing)
    return 'bw';
}

/**
 * Fetches detailed print jobs from the local Windows Spooler
 * Includes color detection, paper size, and comprehensive job details
 */
function getRecentPrintJobs() {
    return new Promise((resolve) => {
        // Enhanced PowerShell command to get more print job details including paper size
        const psCommand = `
            Get-Printer | ForEach-Object {
                $printer = $_
                $printerConfig = Get-PrintConfiguration -PrinterName $_.Name -ErrorAction SilentlyContinue
                Get-PrintJob -PrinterName $_.Name -ErrorAction SilentlyContinue | ForEach-Object {
                    [PSCustomObject]@{
                        Id = $_.Id
                        PrinterName = $printer.Name
                        PrinterType = $printer.Type
                        PrinterStatus = $printer.PrinterStatus
                        DriverName = $printer.DriverName
                        PortName = $printer.PortName
                        PrinterLocation = $printer.Location
                        DocumentName = $_.DocumentName
                        JobStatus = $_.JobStatus
                        TotalPages = $_.TotalPages
                        PagesPrinted = $_.PagesPrinted
                        Size = $_.Size
                        SubmittedTime = $_.SubmittedTime
                        UserName = $_.UserName
                        Priority = $_.Priority
                        PaperSize = if ($printerConfig) { $printerConfig.PaperSize } else { 'Unknown' }
                        DuplexingMode = if ($printerConfig) { $printerConfig.DuplexingMode } else { 'Unknown' }
                        Color = if ($printerConfig) { $printerConfig.Color } else { 'Unknown' }
                        Collate = if ($printerConfig) { $printerConfig.Collate } else { $false }
                    }
                }
            } | ConvertTo-Json -Depth 3
        `;

        exec(`powershell -Command "${psCommand.replace(/\n/g, ' ')}"`, { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
            if (error || !stdout || stdout.trim() === '') {
                resolve([]);
                return;
            }

            try {
                const parsed = JSON.parse(stdout);
                const jobs = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);

                const normalizedJobs = jobs.filter(job => job && job.Id).map(job => {
                    const printType = detectPrintType(job);
                    const isColorPrinter = detectColorCapability(
                        (job.PrinterName || '').toLowerCase(),
                        (job.DriverName || '').toLowerCase()
                    );

                    // Calculate size in KB
                    const sizeKB = job.Size ? Math.round(job.Size / 1024) : 0;

                    // Determine paper size
                    let paperSize = job.PaperSize || 'Unknown';
                    if (paperSize === 'Unknown' || !paperSize) {
                        paperSize = inferPaperSize(job.DocumentName, job.Size);
                    }

                    // Determine duplex mode
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

                    // Infer print quality
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
                        printType: printType, // 'bw' or 'color'
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

                resolve(normalizedJobs);
            } catch (e) {
                console.error('Print job parse error:', e.message);
                resolve([]);
            }
        });
    });
}

/**
 * Enable Windows Print Service Operational Logging
 * Required for history tracking of completed jobs
 */
function enablePrintLogging() {
    exec('wevtutil sl Microsoft-Windows-PrintService/Operational /e:true', (req, res) => {
        // Silently fail or succeed
    });
}

/**
 * Get print history from Windows Event Log (completed jobs)
 * This captures jobs that have already finished printing
 * Enhanced with cross-referencing printer capabilities for better color detection
 */
function getPrintHistory(hoursBack = 24) {
    return new Promise((resolve) => {
        const psCommand = `
            # Get Event 307 (Print Job Completed) from PrintService/Operational
            $events = Get-WinEvent -FilterHashtable @{
                LogName = 'Microsoft-Windows-PrintService/Operational'
                ID = 307
                StartTime = (Get-Date).AddHours(-${hoursBack})
            } -ErrorAction SilentlyContinue 

            if (-not $events) { return @() }

            $events | Select-Object -First 50 | ForEach-Object {
                $evt = $_
                # Convert to XML to safeguard against locale differences in Message
                $xml = [xml]$evt.ToXml()
                $userData = $xml.Event.UserData.DocumentPrinted
                
                # Fallback values
                $id = 0
                $doc = "Unknown"
                $user = "Unknown"
                $printer = "Unknown"
                $pages = 0
                $size = 0

                # Try to extract from XML UserData (Reliable)
                if ($userData) {
                    $id = $userData.Param1
                    $doc = $userData.Param2
                    $user = $userData.Param3
                    $printer = $userData.Param4
                    $server = $userData.Param5 
                    $size = $userData.Param6
                    $pages = $userData.Param7
                } else {
                    # Fallback to Message Regex (Legacy/Simple)
                    $msg = $evt.Message
                    if ($msg -match 'Document (\\d+), (.+?) owned') {
                        $id = [int]$Matches[1]
                        $doc = $Matches[2]
                    }
                    if ($msg -match 'owned by (.+?) on') { $user = $Matches[1] }
                    if ($msg -match 'printed on (.+?) through') { $printer = $Matches[1] }
                    if ($msg -match 'pages printed: (\\d+)') { $pages = [int]$Matches[1] }
                }

                [PSCustomObject]@{
                    TimeCreated = $evt.TimeCreated
                    Id = $id
                    Document = $doc
                    User = $user
                    Printer = $printer
                    Pages = $pages
                    SizeBytes = $size
                }
            } | ConvertTo-Json
        `;

        exec(`powershell -Command "${psCommand.replace(/\n/g, ' ').replace(/"/g, '\\\\"')}"`, { maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
            if (error || !stdout || stdout.trim() === '') {
                resolve([]);
                return;
            }

            try {
                // Parse JSON output
                const parsed = JSON.parse(stdout);
                const history = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);

                const normalized = history.filter(h => h).map(h => {
                    const printerNameLower = (h.Printer || '').toLowerCase();
                    const docLower = (h.Document || '').toLowerCase();

                    // Use the enhanced detectPrintType with available data
                    const printType = detectPrintType({
                        PrinterName: h.Printer,
                        DocumentName: h.Document,
                        DriverName: '' // We don't have driver from event log, but printer name often suffices
                    });

                    // Cross-reference with cached printer capabilities for better detection
                    let enhancedPrintType = printType;
                    if (printerCache.has(h.Printer)) {
                        const cached = printerCache.get(h.Printer);
                        if (!cached.isColor) {
                            enhancedPrintType = 'bw'; // Force B&W if printer doesn't support color
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

                resolve(normalized);
            } catch (e) {
                console.error('Print History Parse Error:', e);
                resolve([]);
            }
        });
    });
}

/**
 * Get list of installed printers with their capabilities and page counters
 * Enhanced: includes total pages printed (lifetime counters from WMI)
 */
function getInstalledPrinters() {
    return new Promise((resolve) => {
        const psCommand = `
            # Get all printers with modern cmdlet
            $modernPrinters = try {
                Get-Printer -ErrorAction Stop | Select-Object Name, Type, DriverName, PortName, Shared, Published, DeviceType, PrinterStatus
            } catch {
                @()
            }

            # Get WMI data for page counts and additional details
            $wmiPrinters = try {
                Get-WmiObject Win32_Printer -ErrorAction Stop | Select-Object Name, DriverName, PortName, Shared, WorkOffline, PrinterStatus, PrinterState, PrintProcessor, Comment, Location, Default, Network, Local, SpoolEnabled, JobCountSinceLastReset, AveragePagesPerMinute
            } catch {
                @()
            }

            # Get print queue performance counters for total pages and bytes
            $perfCounters = try {
                Get-WmiObject Win32_PerfFormattedData_Spooler_PrintQueue -ErrorAction Stop | Select-Object Name, TotalPagesPrinted, TotalJobsPrinted, BytesPrintedPersec, JobErrors
            } catch {
                @()
            }

            # Build lookup for perf data
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

            # Build lookup for WMI data
            $wmiLookup = @{}
            foreach ($p in $wmiPrinters) {
                $wmiLookup[$p.Name] = $p
            }

            # Merge data - use modern printers as the base, enhance with WMI and perf data
            $allPrinters = @()

            foreach ($p in $modernPrinters) {
                $wmi = $wmiLookup[$p.Name]
                $perf = $perfLookup[$p.Name]

                # Status from modern cmdlet (numeric) or WMI
                $status = $p.PrinterStatus
                $isOnline = ($status -eq 0 -or $status -eq 3)

                if ($wmi) {
                    if ($wmi.WorkOffline) { $isOnline = $false }
                }

                $printerObj = @{
                    Name = $p.Name
                    Type = $p.Type
                    DriverName = $p.DriverName
                    PortName = $p.PortName
                    Shared = $p.Shared
                    Status = $status
                    IsOnline = $isOnline
                    Source = 'Modern'
                    Comment = if ($wmi) { $wmi.Comment } else { '' }
                    Location = if ($wmi) { $wmi.Location } else { '' }
                    IsDefault = if ($wmi) { $wmi.Default } else { $false }
                    IsNetwork = if ($wmi) { $wmi.Network } else { $false }
                    IsLocal = if ($wmi) { $wmi.Local } else { $true }
                    SpoolEnabled = if ($wmi) { $wmi.SpoolEnabled } else { $true }
                    PrintProcessor = if ($wmi) { $wmi.PrintProcessor } else { '' }
                    JobCountSinceLastReset = if ($wmi) { [int]$wmi.JobCountSinceLastReset } else { 0 }
                    AveragePagesPerMinute = if ($wmi) { [int]$wmi.AveragePagesPerMinute } else { 0 }
                    TotalPagesPrinted = if ($perf) { $perf.TotalPagesPrinted } else { 0 }
                    TotalJobsPrinted = if ($perf) { $perf.TotalJobsPrinted } else { 0 }
                    JobErrors = if ($perf) { $perf.JobErrors } else { 0 }
                }

                $allPrinters += $printerObj
            }

            # Add any WMI-only printers not in modern list
            foreach ($p in $wmiPrinters) {
                $exists = $modernPrinters | Where-Object { $_.Name -eq $p.Name }
                if (-not $exists) {
                    $perf = $perfLookup[$p.Name]
                    $status = 0
                    if ($p.WorkOffline) { $status = 8 }

                    $allPrinters += @{
                        Name = $p.Name
                        Type = 'Local'
                        DriverName = $p.DriverName
                        PortName = $p.PortName
                        Shared = $p.Shared
                        Status = $status
                        IsOnline = -not $p.WorkOffline
                        Source = 'WMI'
                        Comment = $p.Comment
                        Location = $p.Location
                        IsDefault = $p.Default
                        IsNetwork = $p.Network
                        IsLocal = $p.Local
                        SpoolEnabled = $p.SpoolEnabled
                        PrintProcessor = $p.PrintProcessor
                        JobCountSinceLastReset = [int]$p.JobCountSinceLastReset
                        AveragePagesPerMinute = [int]$p.AveragePagesPerMinute
                        TotalPagesPrinted = if ($perf) { $perf.TotalPagesPrinted } else { 0 }
                        TotalJobsPrinted = if ($perf) { $perf.TotalJobsPrinted } else { 0 }
                        JobErrors = if ($perf) { $perf.JobErrors } else { 0 }
                    }
                }
            }

            @($allPrinters) | ConvertTo-Json -Depth 2
        `;

        exec(`powershell -Command "${psCommand.replace(/\n/g, ' ')}"`, { maxBuffer: 1024 * 1024 * 2 }, (error, stdout, stderr) => {
            if (error || !stdout || stdout.trim() === '') {
                resolve([]);
                return;
            }

            try {
                const parsed = JSON.parse(stdout);
                const printers = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);

                const result = printers.map(p => {
                    const driverLower = (p.DriverName || '').toLowerCase();
                    const nameLower = (p.Name || '').toLowerCase();

                    const isColor = detectColorCapability(nameLower, driverLower);

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
                        // Page counters
                        totalPagesPrinted: p.TotalPagesPrinted || 0,
                        totalJobsPrinted: p.TotalJobsPrinted || 0,
                        jobCountSinceLastReset: p.JobCountSinceLastReset || 0,
                        averagePagesPerMinute: p.AveragePagesPerMinute || 0,
                        jobErrors: p.JobErrors || 0
                    };
                });

                resolve(result);
            } catch (e) {
                console.error('Printer List Parse Error:', e);
                resolve([]);
            }
        });
    });
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
                    totalPages: 0,
                    bwPages: 0,
                    colorPages: 0,
                    totalJobs: 0,
                    bwJobs: 0,
                    colorJobs: 0
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
                // Stats from event log (last 24 hours)
                last24h: historyStats,
                // Active jobs currently in the spooler
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
        console.error('getAllPrinterData error:', e);
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
