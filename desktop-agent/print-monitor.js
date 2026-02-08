const { exec } = require('child_process');

// Track processed jobs to avoid duplicates
let processedJobIds = new Set();
// Cache printer capabilities
let printerCache = new Map();

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

                const isColor =
                    driverLower.includes('color') ||
                    driverLower.includes('colour') ||
                    nameLower.includes('color') ||
                    nameLower.includes('colour') ||
                    driverLower.includes('hp laserjet pro') ||
                    driverLower.includes('officejet') ||
                    driverLower.includes('photosmart') ||
                    driverLower.includes('deskjet');

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
    if (docLower.includes('photo') || docLower.includes('4x6') || docLower.includes('4"x6"')) return '4x6 Photo';
    if (docLower.includes('5x7')) return '5x7 Photo';
    if (docLower.includes('8x10')) return '8x10 Photo';
    if (docLower.includes('envelope') || docLower.includes('env')) return 'Envelope';
    if (docLower.includes('label')) return 'Label';

    // Infer from file size (rough estimate based on typical document sizes)
    // These are very rough estimates and paper size really can't be determined from file size alone
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
                    // Detect if color based on printer driver and document name
                    const driverLower = (job.DriverName || '').toLowerCase();
                    const printerNameLower = (job.PrinterName || '').toLowerCase();
                    const docNameLower = (job.DocumentName || '').toLowerCase();

                    let printType = 'bw'; // Default to B&W

                    // Check printer capabilities
                    const isColorPrinter =
                        driverLower.includes('color') ||
                        driverLower.includes('colour') ||
                        printerNameLower.includes('color') ||
                        printerNameLower.includes('colour') ||
                        driverLower.includes('hp laserjet pro') ||
                        driverLower.includes('officejet') ||
                        driverLower.includes('photosmart') ||
                        driverLower.includes('deskjet');

                    // Check document name hints for color content
                    const isColorDocument =
                        docNameLower.includes('color') ||
                        docNameLower.includes('photo') ||
                        docNameLower.includes('image') ||
                        docNameLower.includes('.jpg') ||
                        docNameLower.includes('.png') ||
                        docNameLower.includes('.jpeg') ||
                        docNameLower.includes('.bmp') ||
                        docNameLower.includes('.tiff');

                    // Check job's color configuration from printer settings
                    if (job.Color === true || (typeof job.Color === 'string' && job.Color.toLowerCase() === 'true')) {
                        printType = 'color';
                    } else if (isColorPrinter && isColorDocument) {
                        printType = 'color';
                    }

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
 * Get print history from Windows Event Log (completed jobs)
 * This captures jobs that have already finished printing
 */
function getPrintHistory(hoursBack = 24) {
    return new Promise((resolve) => {
        const psCommand = `
            Get-WinEvent -FilterHashtable @{
                LogName = 'Microsoft-Windows-PrintService/Operational'
                ID = 307
                StartTime = (Get-Date).AddHours(-${hoursBack})
            } -ErrorAction SilentlyContinue | 
            Select-Object -First 50 TimeCreated, Message |
            ForEach-Object {
                $msg = $_.Message
                $doc = if ($msg -match 'Document (.+?) owned') { $Matches[1] } else { 'Unknown' }
                $user = if ($msg -match 'owned by (.+?) was') { $Matches[1] } else { 'Unknown' }
                $printer = if ($msg -match 'printed on (.+?) through') { $Matches[1] } else { 'Unknown' }
                $pages = if ($msg -match '(\\d+) page') { [int]$Matches[1] } else { 0 }
                $size = if ($msg -match '(\\d+) bytes') { [int]$Matches[1] } else { 0 }
                
                [PSCustomObject]@{
                    TimeCreated = $_.TimeCreated
                    Document = $doc
                    User = $user
                    Printer = $printer
                    Pages = $pages
                    SizeBytes = $size
                }
            } | ConvertTo-Json
        `;

        exec(`powershell -Command "${psCommand.replace(/\n/g, ' ')}"`, { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
            if (error || !stdout || stdout.trim() === '') {
                resolve([]);
                return;
            }

            try {
                const parsed = JSON.parse(stdout);
                const history = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);

                const normalized = history.filter(h => h).map(h => {
                    const printerLower = (h.Printer || '').toLowerCase();
                    const docLower = (h.Document || '').toLowerCase();

                    let printType = 'bw';
                    if (printerLower.includes('color') || docLower.includes('color') || docLower.includes('photo')) {
                        printType = 'color';
                    }

                    return {
                        timestamp: h.TimeCreated,
                        document: h.Document,
                        user: h.User,
                        printer: h.Printer,
                        pages: h.Pages || 1,
                        sizeBytes: h.SizeBytes || 0,
                        printType: printType,
                        status: 'completed'
                    };
                });

                resolve(normalized);
            } catch (e) {
                resolve([]);
            }
        });
    });
}

/**
 * Get list of installed printers with their capabilities
 */
function getInstalledPrinters() {
    return new Promise((resolve) => {
        const psCommand = `
            Get-Printer | Select-Object Name, Type, DriverName, PortName, Shared, Published, DeviceType, PrinterStatus |
            ConvertTo-Json
        `;

        exec(`powershell -Command "${psCommand}"`, (error, stdout, stderr) => {
            if (error || !stdout || stdout.trim() === '') {
                resolve([]);
                return;
            }

            try {
                const parsed = JSON.parse(stdout);
                const printers = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);

                resolve(printers.map(p => {
                    const driverLower = (p.DriverName || '').toLowerCase();
                    const nameLower = (p.Name || '').toLowerCase();

                    const isColor =
                        driverLower.includes('color') ||
                        driverLower.includes('colour') ||
                        nameLower.includes('color') ||
                        nameLower.includes('colour') ||
                        driverLower.includes('officejet') ||
                        driverLower.includes('photosmart') ||
                        driverLower.includes('deskjet');

                    return {
                        name: p.Name,
                        type: p.Type,
                        driver: p.DriverName,
                        port: p.PortName,
                        shared: p.Shared,
                        status: getPrinterStatusText(p.PrinterStatus),
                        statusCode: p.PrinterStatus,
                        isColor: isColor,
                        isOnline: p.PrinterStatus === 0 || p.PrinterStatus === 3
                    };
                }));
            } catch (e) {
                resolve([]);
            }
        });
    });
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
    clearPrinterCache
};
