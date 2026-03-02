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
 * Generate a consistent composite key for a print job.
 * This ensures the SAME physical print job produces the SAME key
 * regardless of whether it's captured from spooler, event log, or history.
 * Format: "PrinterName-JobId" (same across all sources)
 */
function generatePrintJobKey(printerName, jobId, documentName, timestamp) {
    // Primary key: printer + job ID (always unique per printer per job)
    if (printerName && jobId && jobId !== 0 && jobId !== '0') {
        return `${printerName}-${jobId}`;
    }
    // Fallback: printer + document name + rough timestamp (within 60s window)
    if (printerName && documentName) {
        const ts = timestamp ? new Date(timestamp).getTime() : Date.now();
        const timeBucket = Math.floor(ts / 60000); // 1-minute buckets
        return `${printerName}-${documentName}-${timeBucket}`;
    }
    return null;
}

/**
 * Compute the total number of paper sheets actually consumed.
 * Accounts for copies and duplex (double-sided) mode.
 */
function computeTotalSheets(totalPages, copies, duplexMode) {
    const pages = totalPages || 1;
    const numCopies = copies || 1;
    const totalPrintedPages = pages * numCopies;

    // If duplex (double-sided), each sheet holds 2 pages
    if (duplexMode && typeof duplexMode === 'string') {
        const d = duplexMode.toLowerCase();
        if (d.includes('double') || d.includes('twosided') || d.includes('duplex') || d.includes('both') ||
            d.includes('longedge') || d.includes('shortedge')) {
            return Math.ceil(totalPrintedPages / 2);
        }
    }
    return totalPrintedPages;
}

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
 * Infer media/paper type from driver media type string and document name.
 * Handles both human-readable names AND raw DEVMODE values from Get-PrintJob.
 */
function inferMediaType(mediaTypeStr, documentName) {
    const media = (mediaTypeStr || '').toLowerCase().trim();
    const doc = (documentName || '').toLowerCase();

    // Skip empty/default/generic driver values (these mean "use printer default")
    const isGenericDefault = !media || media === '0' || media === 'default' ||
        media === 'autoselect' || media === 'auto' || media === 'stationery' ||
        media === 'unknown' || media === 'unspecified';

    if (!isGenericDefault) {
        // Driver-reported media types
        if (media.includes('glossy')) return 'Glossy';
        if (media.includes('matte')) return 'Matte';
        if (media.includes('photo')) return 'Photo Paper';
        if (media.includes('cardstock') || media.includes('card stock')) return 'Cardstock';
        if (media.includes('envelope')) return 'Envelope';
        if (media.includes('transparency') || media.includes('ohp')) return 'Transparency';
        if (media.includes('label')) return 'Labels';
        if (media.includes('recycled')) return 'Recycled';
        if (media.includes('bond')) return 'Bond';
        if (media.includes('vellum')) return 'Vellum';
        if (media.includes('heavy') || media.includes('thick')) return 'Heavyweight';
        if (media.includes('thin') || media.includes('light')) return 'Lightweight';
        if (media.includes('plain')) return 'Plain Paper';
        if (media.includes('premium')) return 'Premium Paper';
        if (media.includes('cotton')) return 'Cotton Paper';
        if (media.includes('letterhead')) return 'Letterhead';
        if (media.includes('colored') || media.includes('colour')) return 'Colored Paper';
        if (media.includes('preprinted')) return 'Pre-printed';
    }

    // Document name heuristics as fallback
    if (doc.includes('glossy')) return 'Glossy';
    if (doc.includes('matte')) return 'Matte';
    if (doc.includes('photo')) return 'Photo Paper';
    if (doc.includes('label')) return 'Labels';
    if (doc.includes('envelope')) return 'Envelope';
    if (doc.includes('card')) return 'Cardstock';

    return 'Plain Paper';
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
 * KEY INSIGHT: The DEVMODE dmColor field (JobColor) reflects the PRINTER DRIVER SETTING,
 * not the actual document content. On color printers like Epson L3250, dmColor is 
 * almost always 2 (Color) because that's the default driver setting. This does NOT mean
 * the document actually contains color content.
 * 
 * Strategy:
 * 1. If user explicitly chose Monochrome (dmColor=1) → B&W (trust user choice)
 * 2. If printer is NOT color-capable → B&W (hardware limitation)
 * 3. Use document type/extension/name analysis to determine actual content type
 * 4. Default to B&W for billing safety (only tag color with positive evidence)
 */
function detectPrintType(job) {
    const driverLower = (job.DriverName || job.printerDriver || '').toLowerCase();
    const printerNameLower = (job.PrinterName || job.printer || '').toLowerCase();
    const docNameLower = (job.DocumentName || job.document || '').toLowerCase();

    // 1. If user explicitly selected Monochrome/Grayscale in print dialog → definitely B&W
    // DEVMODE dmColor: 1 = Monochrome (user chose B&W), 2 = Color (default on color printers)
    if (job.JobColor !== undefined && job.JobColor !== null && job.JobColor !== 'Unknown') {
        const jobColorVal = typeof job.JobColor === 'string' ? job.JobColor.toLowerCase().trim() : job.JobColor;
        if (jobColorVal === 1 || jobColorVal === '1' || jobColorVal === 'monochrome' ||
            jobColorVal === 'grayscale' || jobColorVal === 'false') {
            return 'bw'; // User explicitly chose B&W - trust this
        }
        // NOTE: JobColor=2 means driver is in color mode (default for color printers).
        // This does NOT mean content is color. Fall through to content analysis.
    }

    // 2. If printer Color config is explicitly false/monochrome → B&W
    if (job.Color === false || (typeof job.Color === 'string' &&
        (job.Color.toLowerCase() === 'false' || job.Color.toLowerCase() === 'monochrome' || job.Color.toLowerCase() === 'grayscale'))) {
        return 'bw';
    }

    // 3. Check if the printer even supports color
    const isColorPrinter = detectColorCapability(printerNameLower, driverLower);
    if (!isColorPrinter) return 'bw';

    // 4. Content-based analysis: determine if the DOCUMENT is likely color or B&W
    // This is the primary discriminator since printer DEVMODE typically just reflects defaults

    // --- Definite B&W: document types that are almost never color ---
    const bwDocIndicators = [
        'text', 'draft', 'invoice', 'receipt', 'contract', 'form',
        'memo', 'spreadsheet', 'b&w', 'bw', 'black', 'mono', 'grayscale',
        'blueprint', 'schematic', 'outline', 'notes', 'resume', 'cv',
        'letter', 'fax', 'statement', 'agreement', 'affidavit', 'deed',
        'transcript', 'manuscript', 'thesis', 'essay', 'assignment', 'exam',
        'test print', 'notepad'
    ];
    const bwExtensions = ['.txt', '.csv', '.log', '.rtf', '.xml', '.json', '.html', '.htm'];

    if (bwDocIndicators.some(kw => docNameLower.includes(kw)) ||
        bwExtensions.some(ext => docNameLower.endsWith(ext))) {
        return 'bw';
    }

    // --- B&W by application: standard document apps produce mostly B&W ---
    // "Microsoft Word - document.docx" or "Print document - Word"
    const bwAppPatterns = [
        'microsoft word', 'word -', '- word',
        'microsoft excel', 'excel -', '- excel',
        'notepad', 'wordpad',
        'adobe reader', 'adobe acrobat',  // PDFs are usually B&W text docs
        'chrome', 'firefox', 'edge', 'brave', 'opera', // Web pages printed from browsers
        'mozilla', 'internet explorer',
        'libreoffice writer', 'libreoffice calc',
        'openoffice', 'wps office',
        '.doc', '.docx', '.xls', '.xlsx', '.pdf', '.odt', '.ods'
    ];

    if (bwAppPatterns.some(kw => docNameLower.includes(kw))) {
        // Even from these apps, check if document name has explicit color hints
        const hasColorHint = ['photo', 'image', 'color', 'poster', 'flyer', 'banner',
            'brochure', 'certificate', 'glossy', 'picture', 'artwork']
            .some(kw => docNameLower.includes(kw));
        if (!hasColorHint) return 'bw';
    }

    // --- Definite Color: file types that are almost always color ---
    const colorExtensions = ['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif',
        '.gif', '.psd', '.ai', '.svg', '.webp', '.heic', '.raw',
        '.pptx', '.ppt', '.key'];
    const colorDocIndicators = ['photo', 'image', 'picture', 'poster', 'flyer', 'banner',
        'brochure', 'certificate', 'presentation', 'slide', 'artwork',
        'design', 'illustration', 'graphic', 'chart', 'infographic',
        'color', 'colour', 'cover', 'catalog', 'magazine', 'comic',
        'calendar', 'postcard', 'greeting card', 'invitation', 'label design'];

    if (colorExtensions.some(ext => docNameLower.endsWith(ext)) ||
        colorDocIndicators.some(kw => docNameLower.includes(kw))) {
        return 'color';
    }

    // 5. Default: B&W for billing safety
    // Most cybercafe prints are documents/assignments/forms — overwhelmingly B&W content
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

    # Get per-job details from WMI Win32_PrintJob (DEVMODE-level, accurate pages)
    $wmiJobs = @{}
    try {
        $wmiPrintJobs = Get-CimInstance Win32_PrintJob -ErrorAction Stop
        foreach ($wj in $wmiPrintJobs) {
            $jobKey = "$($wj.Name)"
            $wmiJobs[$jobKey] = @{
                Color = $wj.Color
                Document = $wj.Document
                PagesPrinted = [int]$wj.PagesPrinted
                TotalPages = [int]$wj.TotalPages
                Size = [long]$wj.Size
                Copies = 1
            }
            # Extract copies from NumberUp or StatusMask if possible
            try {
                if ($wj.Parameters -match 'Copies=(\d+)') {
                    $wmiJobs[$jobKey].Copies = [int]$Matches[1]
                }
            } catch {}
        }
    } catch {
        # Fallback to older WMI
        try {
            $wmiPrintJobs = Get-WmiObject Win32_PrintJob -ErrorAction Stop
            foreach ($wj in $wmiPrintJobs) {
                $jobKey = "$($wj.Name)"
                $wmiJobs[$jobKey] = @{
                    Color = $wj.Color
                    Document = $wj.Document
                    PagesPrinted = [int]$wj.PagesPrinted
                    TotalPages = [int]$wj.TotalPages
                    Size = [long]$wj.Size
                    Copies = 1
                }
            }
        } catch {}
    }

    foreach ($printer in $allPrinters) {
        $printerConfig = $null
        $mediaType = "Plain Paper"
        try {
            $printerConfig = Get-PrintConfiguration -PrinterName $printer.Name -ErrorAction Stop
            # Try to get media type from print configuration
            try {
                if ($printerConfig.MediaType) {
                    $mediaType = [string]$printerConfig.MediaType
                }
            } catch {}
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
            $copies = 1
            $wmiTotalPages = 0
            $wmiPagesPrinted = 0

            if ($printerConfig -ne $null) {
                $paperSize = [string]$printerConfig.PaperSize
                $duplexMode = [string]$printerConfig.DuplexingMode
                $colorMode = [string]$printerConfig.Color
                $collate = [bool]$printerConfig.Collate
            }

            # Get accurate page count and color from WMI
            $wmiKey = "$($printer.Name), $($job.Id)"
            if ($wmiJobs.ContainsKey($wmiKey)) {
                $wmiData = $wmiJobs[$wmiKey]
                $wmiColor = $wmiData.Color
                if ($wmiColor -ne $null) {
                    $jobColorMode = [string]$wmiColor
                }
                # WMI often has more accurate page count
                $wmiTotalPages = [int]$wmiData.TotalPages
                $wmiPagesPrinted = [int]$wmiData.PagesPrinted
                if ($wmiData.Copies -gt 1) { $copies = [int]$wmiData.Copies }
            }

            # CRITICAL FIX: If TotalPages is still 0, wait up to 2s for spooler to update.
            # Multi-page docs often report 0 during initial spooling.
            $bestTotalPages = 0
            if ($wmiTotalPages -gt 0) {
                $bestTotalPages = $wmiTotalPages
            } elseif ($job.TotalPages -gt 0) {
                $bestTotalPages = [int]$job.TotalPages
            }
            
            if ($bestTotalPages -le 0) {
                # Wait and re-query for this specific job
                for ($retry = 0; $retry -lt 4; $retry++) {
                    Start-Sleep -Milliseconds 500
                    try {
                        $retryJob = Get-PrintJob -PrinterName $printer.Name -ID $job.Id -ErrorAction Stop
                        if ($retryJob.TotalPages -gt 0) {
                            $bestTotalPages = [int]$retryJob.TotalPages
                            break
                        }
                    } catch { break } # Job completed already, will be captured by Event Log 307
                    # Also re-check WMI
                    try {
                        $retryWmi = Get-CimInstance Win32_PrintJob -Filter "Name='$wmiKey'" -ErrorAction Stop
                        if ($retryWmi -and $retryWmi.TotalPages -gt 0) {
                            $bestTotalPages = [int]$retryWmi.TotalPages
                            if ($retryWmi.PagesPrinted -gt 0) { $wmiPagesPrinted = [int]$retryWmi.PagesPrinted }
                            break
                        }
                    } catch {}
                }
                if ($bestTotalPages -le 0) { $bestTotalPages = 1 }
            }

            # Also try to get copies from Get-PrintJob if WMI didn't have it
            if ($copies -le 1) {
                try {
                    # Some Get-PrintJob implementations expose Copies
                    if ($job.PSObject.Properties['NumberOfCopies'] -and $job.NumberOfCopies -gt 1) {
                        $copies = [int]$job.NumberOfCopies
                    }
                } catch {}
            }

            $bestPagesPrinted = 0
            if ($wmiPagesPrinted -gt 0) {
                $bestPagesPrinted = $wmiPagesPrinted
            } elseif ($job.PagesPrinted -gt 0) {
                $bestPagesPrinted = [int]$job.PagesPrinted
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
                TotalPages = $bestTotalPages
                PagesPrinted = $bestPagesPrinted
                Copies = $copies
                Size = $job.Size
                SubmittedTime = [string]$job.SubmittedTime
                UserName = $job.UserName
                Priority = $job.Priority
                PaperSize = $paperSize
                DuplexingMode = $duplexMode
                Color = $colorMode
                JobColor = $jobColorMode
                Collate = $collate
                MediaType = $mediaType
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
            const mediaType = inferMediaType(job.MediaType, job.DocumentName);
            const copies = job.Copies || 1;
            const totalPages = job.TotalPages || 1;
            const totalSheets = computeTotalSheets(totalPages, copies, duplexMode);

            // Use consistent job key for deduplication across all sources
            const jobKey = generatePrintJobKey(job.PrinterName, job.Id, job.DocumentName, job.SubmittedTime);

            return {
                id: job.Id,
                jobId: jobKey || `${job.PrinterName}-${job.Id}`,
                printer: job.PrinterName || 'Unknown',
                printerType: job.PrinterType || 'Local',
                printerDriver: job.DriverName || 'Unknown',
                printerPort: job.PortName || 'Unknown',
                printerLocation: job.PrinterLocation || '',
                printerStatus: job.PrinterStatus || 'Unknown',
                document: job.DocumentName || 'Untitled',
                documentName: job.DocumentName || 'Untitled',
                status: job.JobStatus || 'Spooling',
                totalPages: totalPages,
                pagesPrinted: job.PagesPrinted || 0,
                copies: copies,
                totalSheets: totalSheets,
                printType: printType,
                isColorPrinter: isColorPrinter,
                isColorPrint: printType === 'color',
                paperSize: paperSize,
                mediaType: mediaType,
                duplexMode: duplexMode,
                printQuality: printQuality,
                collate: job.Collate || false,
                sizeKB: sizeKB,
                sizeBytes: job.Size || 0,
                submitted: job.SubmittedTime,
                user: job.UserName || 'Unknown',
                priority: job.Priority || 'Normal',
                timestamp: new Date().toISOString(),
                source: 'spooler_queue'
            };
        });
    } catch (e) {
        console.error('[PrintMonitor] Print job parse error:', e.message);
        return [];
    }
}

/**
 * Enable Windows Print Service Operational Logging
 * Required for history tracking of completed jobs.
 * IMPORTANT: This requires admin privileges. We use PowerShell Start-Process -Verb RunAs
 * to elevate. If the user is already an admin, this runs silently.
 */
function enablePrintLogging() {
    // First try without elevation (works if already running as admin)
    execFile('wevtutil', ['sl', 'Microsoft-Windows-PrintService/Operational', '/e:true'], (err) => {
        if (err) {
            console.log('[PrintMonitor] Direct enable failed, trying with elevation...');
            // Try with PowerShell elevation — this shows a UAC prompt if needed
            const { exec } = require('child_process');
            exec('powershell -NoProfile -Command "Start-Process wevtutil -ArgumentList \'sl\',\'Microsoft-Windows-PrintService/Operational\',\'/e:true\' -Verb RunAs -Wait -WindowStyle Hidden"',
                { timeout: 15000 },
                (err2) => {
                    if (err2) {
                        console.error('[PrintMonitor] Failed to enable print logging even with elevation:', err2.message);
                    } else {
                        console.log('[PrintMonitor] Print Service Operational logging enabled (elevated)');
                    }
                }
            );
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

    foreach ($evt in ($events | Select-Object -First 100)) {
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
                $printer = $userData.Param5
                $sizeBytes = $userData.Param7
                $pages = $userData.Param8
            }
        } catch {
            # Fallback: try Properties array (some Windows versions use this)
            try {
                if ($evt.Properties -and $evt.Properties.Count -ge 8) {
                    $id = $evt.Properties[0].Value
                    $doc = [string]$evt.Properties[1].Value
                    $user = [string]$evt.Properties[2].Value
                    $printer = [string]$evt.Properties[4].Value
                    $sizeBytes = $evt.Properties[6].Value
                    $pages = $evt.Properties[7].Value
                }
            } catch {}
        }

        # Fallback: parse from message text
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

        # Ensure pages is at least 1 for any completed print
        if ([int]$pages -le 0) { $pages = 1 }

        $results += [PSCustomObject]@{
            TimeCreated = [string]$evt.TimeCreated
            Id = [int]$id
            Document = [string]$doc
            User = [string]$user
            Printer = [string]$printer
            Pages = [int]$pages
            SizeBytes = [long]$sizeBytes
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

            const pageCount = parseInt(h.Pages) || 1;
            const copies = parseInt(h.Copies) || 1;
            const mediaType = inferMediaType('', h.Document);
            const totalSheets = computeTotalSheets(pageCount, copies, null);

            // Use consistent dedup key
            const jobKey = generatePrintJobKey(h.Printer, h.Id, h.Document, h.TimeCreated);

            return {
                id: h.Id || 0,
                jobId: jobKey || (h.Id ? `${h.Printer}-${h.Id}` : null),
                timestamp: h.TimeCreated ? new Date(h.TimeCreated).toISOString() : new Date().toISOString(),
                document: h.Document,
                user: h.User,
                printer: h.Printer,
                pages: pageCount,
                totalPages: pageCount,
                copies: copies,
                totalSheets: totalSheets,
                sizeBytes: parseInt(h.SizeBytes || 0),
                printType: enhancedPrintType,
                isColorPrint: enhancedPrintType === 'color',
                mediaType: mediaType,
                status: 'completed'
            };
        });
    } catch (e) {
        console.error('[PrintMonitor] Print History Parse Error:', e.message);
        return [];
    }
}

/**
 * Get recently completed print jobs from Event Log 307 (last N seconds).
 * This is the PRIMARY source for accurate real-time print job data.
 * Unlike the spooler queue (Get-PrintJob), Event 307 records the ACTUAL
 * page count after the job finishes, which is always correct.
 *
 * Also queries the printer's current DEVMODE for media type and paper size.
 */
async function getRecentCompletedJobs(secondsBack = 30) {
    const script = `
$results = @()
try {
    $events = Get-WinEvent -FilterHashtable @{
        LogName = 'Microsoft-Windows-PrintService/Operational'
        ID = 307
        StartTime = (Get-Date).AddSeconds(-${secondsBack})
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
`;

    const stdout = await runPS(script, 15000);
    if (!stdout || stdout.trim() === '' || stdout.trim() === '[]') {
        return [];
    }

    try {
        const parsed = JSON.parse(stdout);
        const jobs = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);

        return jobs.filter(j => j).map(j => {
            const pageCount = parseInt(j.Pages) || 1;
            const printType = detectPrintType({
                PrinterName: j.Printer,
                DocumentName: j.Document,
                DriverName: j.DriverName || '',
                JobColor: null,
                Color: j.ColorMode || null
            });

            let enhancedPrintType = printType;
            if (printerCache.has(j.Printer)) {
                const cached = printerCache.get(j.Printer);
                if (!cached.isColor) enhancedPrintType = 'bw';
            }

            const mediaType = inferMediaType(j.MediaType, j.Document);
            let paperSize = j.PaperSize || 'A4';
            if (paperSize === 'Unknown' || !paperSize) {
                paperSize = inferPaperSize(j.Document, j.SizeBytes);
            }

            let duplexMode = 'Single-sided';
            if (j.DuplexMode) {
                const d = j.DuplexMode.toString().toLowerCase();
                if (d.includes('twosided') || d.includes('duplex') || d.includes('both')) {
                    duplexMode = 'Double-sided';
                } else if (d.includes('longedge')) {
                    duplexMode = 'Double-sided (Long Edge)';
                } else if (d.includes('shortedge')) {
                    duplexMode = 'Double-sided (Short Edge)';
                }
            }

            const copies = parseInt(j.Copies) || 1;
            const totalSheets = computeTotalSheets(pageCount, copies, duplexMode);

            // Use consistent dedup key
            const jobKey = generatePrintJobKey(j.Printer, j.Id, j.Document, j.TimeCreated);

            return {
                id: j.Id || 0,
                jobId: jobKey || (j.Id ? `${j.Printer}-${j.Id}` : null),
                timestamp: j.TimeCreated ? new Date(j.TimeCreated).toISOString() : new Date().toISOString(),
                document: j.Document,
                documentName: j.Document,
                user: j.User,
                printer: j.Printer,
                printerDriver: j.DriverName || '',
                pages: pageCount,
                totalPages: pageCount,
                copies: copies,
                totalSheets: totalSheets,
                sizeBytes: parseInt(j.SizeBytes || 0),
                sizeKB: Math.round((parseInt(j.SizeBytes || 0)) / 1024),
                printType: enhancedPrintType,
                isColorPrint: enhancedPrintType === 'color',
                mediaType: mediaType,
                paperSize: paperSize,
                duplexMode: duplexMode,
                printQuality: inferPrintQuality(j.Document, j.DriverName),
                status: 'Printed',
                source: 'event_log_307'
            };
        });
    } catch (e) {
        console.error('[PrintMonitor] Recent completed jobs parse error:', e.message);
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

/**
 * ENHANCED: Get page counts AND per-job DEVMODE settings from Win32_PrintJob.
 * This captures paper size, media type, duplex, and color mode from the
 * ACTUAL JOB (not printer defaults). These settings are ONLY available
 * while the job is actively in the spooler queue.
 * 
 * Returns: [{ jobKey, printer, jobId, document, totalPages, copies,
 *             paperSize, mediaType, duplexMode, colorMode }]
 */
async function getSpoolerJobsFast() {
    const script = `
$results = @()
try {
    $jobs = Get-CimInstance Win32_PrintJob -ErrorAction Stop
    foreach ($j in $jobs) {
        $nameParts = $j.Name -split ', '
        $printerName = $nameParts[0]
        $jobId = if ($nameParts.Length -gt 1) { $nameParts[1] } else { '0' }
        
        $totalPages = [int]$j.TotalPages
        $pagesPrinted = [int]$j.PagesPrinted
        $copies = 1
        
        # Try to extract copies from Parameters
        try {
            if ($j.Parameters -match 'Copies=(\\d+)') {
                $copies = [int]$Matches[1]
            }
        } catch {}

        # Per-job DEVMODE settings (paper size, media type, duplex, color)
        # These come from the APPLICATION that submitted the print job,
        # not from the printer defaults. This is the ONLY window to capture them.
        $paperSize = ""
        $mediaType = ""
        $duplexMode = ""
        $colorMode = ""
        try {
            $pj = Get-PrintJob -PrinterName $printerName -ID ([int]$jobId) -ErrorAction Stop
            if ($pj) {
                # PrintJob object exposes per-job DEVMODE fields
                if ($pj.PaperSize) { $paperSize = [string]$pj.PaperSize }
                if ($pj.MediaType) { $mediaType = [string]$pj.MediaType }
                if ($pj.DuplexingMode) { $duplexMode = [string]$pj.DuplexingMode }
                if ($pj.Color -ne $null) { $colorMode = [string]$pj.Color }
                # Also try to get copies from PrintJob if not found in Parameters
                if ($copies -le 1 -and $pj.Copies -gt 1) {
                    $copies = [int]$pj.Copies
                }
                # If WMI TotalPages was 0, try Get-PrintJob's value
                if ($totalPages -le 0 -and $pj.TotalPages -gt 0) {
                    $totalPages = [int]$pj.TotalPages
                }
            }
        } catch {}

        $results += [PSCustomObject]@{
            Printer = [string]$printerName
            JobId = [string]$jobId
            Document = [string]$j.Document
            TotalPages = $totalPages
            PagesPrinted = $pagesPrinted
            Copies = $copies
            Size = [long]$j.Size
            PaperSize = $paperSize
            MediaType = $mediaType
            DuplexMode = $duplexMode
            ColorMode = $colorMode
        }
    }
} catch {}

if ($results.Count -eq 0) { "[]" }
else { $results | ConvertTo-Json -Depth 2 }
`;

    try {
        const stdout = await runPS(script, 8000);
        if (!stdout || stdout.trim() === '' || stdout.trim() === '[]') return [];

        const parsed = JSON.parse(stdout);
        const jobs = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);

        return jobs.filter(j => j && j.Printer).map(j => {
            const jobKey = generatePrintJobKey(j.Printer, j.JobId, j.Document, null);
            return {
                jobKey: jobKey,
                printer: j.Printer,
                jobId: j.JobId,
                document: j.Document,
                totalPages: parseInt(j.TotalPages) || 0,
                pagesPrinted: parseInt(j.PagesPrinted) || 0,
                copies: parseInt(j.Copies) || 1,
                sizeBytes: parseInt(j.Size) || 0,
                paperSize: j.PaperSize || '',
                mediaType: j.MediaType || '',
                duplexMode: j.DuplexMode || '',
                colorMode: j.ColorMode || ''
            };
        });
    } catch (e) {
        return [];
    }
}

/**
 * FALLBACK: Query WMI for a specific print job's page count.
 * Used when Event Log 307 fires but the spooler cache missed the job.
 * The job might still be briefly registered in WMI after completion.
 */
async function getJobPageCount(printerName, jobId) {
    const wmiName = `${printerName}, ${jobId}`;
    const script = `
try {
    $j = Get-CimInstance Win32_PrintJob -Filter "Name='${wmiName}'" -ErrorAction Stop
    if ($j) {
        [PSCustomObject]@{
            TotalPages = [int]$j.TotalPages
            PagesPrinted = [int]$j.PagesPrinted
            Copies = 1
        } | ConvertTo-Json
    } else { "{}" }
} catch { "{}" }
`;

    try {
        const stdout = await runPS(script, 3000);
        if (!stdout || stdout.trim() === '' || stdout.trim() === '{}') return null;
        const data = JSON.parse(stdout);
        return {
            totalPages: parseInt(data.TotalPages) || 0,
            copies: parseInt(data.Copies) || 1
        };
    } catch (e) {
        return null;
    }
}

/**
 * REAL-TIME SPOOLER WATCHER
 * 
 * Runs a persistent PowerShell process that uses WMI event subscription
 * to get INSTANT notification when a print job enters the spooler.
 * 
 * Unlike polling (which checks every 1.5s), this fires within milliseconds
 * of the job appearing — giving us time to read the full DEVMODE before
 * the job completes and the settings are lost.
 * 
 * The watcher emits JSON lines to stdout, one per detected job.
 * The caller provides an onJob callback to handle each job.
 * 
 * Returns a control object with stop() method.
 */
function startSpoolerWatcher(onJob) {
    let psProcess = null;
    let running = false;
    let restartTimer = null;
    let buffer = '';

    const WATCHER_SCRIPT = `
# Real-Time Print Job Watcher using WMI Event Subscription
# + System.Printing.PrintTicket for EXACT user-selected settings
#
# PrintTicket is the XML representation of what the user picked
# in the print dialog. It contains EVERY setting — not filtered
# by the driver, not defaults. The actual selections.

$ErrorActionPreference = 'SilentlyContinue'

# Load System.Printing assembly for PrintTicket access
Add-Type -AssemblyName System.Printing
Add-Type -AssemblyName ReachFramework

$query = "SELECT * FROM __InstanceCreationEvent WITHIN 1 WHERE TargetInstance ISA 'Win32_PrintJob'"

try {
    # Register the event
    $watcher = New-Object System.Management.ManagementEventWatcher($query)
    $watcher.Options.Timeout = [System.Management.ManagementOptions]::InfiniteTimeout

    # Signal that the watcher is ready
    Write-Output '{"__status":"ready"}'
    [Console]::Out.Flush()

    while ($true) {
        try {
            # Wait for next print job event (blocks until a job appears)
            $event = $watcher.WaitForNextEvent()
            $job = $event.TargetInstance

            if ($job -eq $null) { continue }

            $nameParts = $job.Name -split ', '
            $printerName = $nameParts[0]
            $jobId = if ($nameParts.Length -gt 1) { $nameParts[1] } else { '0' }

            $totalPages = [int]$job.TotalPages
            $pagesPrinted = [int]$job.PagesPrinted
            $copies = 1
            $document = [string]$job.Document
            $sizeBytes = [long]$job.Size
            $owner = [string]$job.Owner

            # Try to extract copies from Parameters
            try {
                $params = [string]$job.Parameters
                if ($params -match 'Copies=(\\d+)') {
                    $copies = [int]$Matches[1]
                }
            } catch {}

            # Default values
            $paperSize = ""
            $mediaType = ""
            $duplexMode = ""
            $colorMode = ""

            # ===== READ PRINTTICKET — the EXACT user-selected settings =====
            # System.Printing gives us the PrintTicket XML which is the
            # definitive record of what the user chose in the print dialog.
            try {
                $server = New-Object System.Printing.LocalPrintServer
                $queue = $server.GetPrintQueue($printerName)
                if ($queue) {
                    $jobs = $queue.GetPrintJobInfoCollection()
                    foreach ($pj in $jobs) {
                        if ($pj.JobIdentifier -eq [int]$jobId) {
                            # Get the PrintTicket XML
                            $ticket = $pj.JobTicket
                            if ($ticket -eq $null) { $ticket = $pj.PrintTicket }

                            if ($ticket) {
                                $xml = $ticket.GetXmlStream()
                                $reader = New-Object System.IO.StreamReader($xml)
                                $ticketXml = $reader.ReadToEnd()
                                $reader.Close()

                                # Parse the PrintTicket XML for user's actual selections
                                [xml]$doc = $ticketXml
                                $ns = New-Object System.Xml.XmlNamespaceManager($doc.NameTable)
                                $ns.AddNamespace("psf", "http://schemas.microsoft.com/windows/2003/08/printing/printschemaframework")
                                $ns.AddNamespace("psk", "http://schemas.microsoft.com/windows/2003/08/printing/printschemakeywords")

                                # Paper Size (e.g., psk:ISOA4, psk:NorthAmericaLetter)
                                $sizeNode = $doc.SelectSingleNode("//psf:Feature[@name='psk:PageMediaSize']/psf:Option", $ns)
                                if ($sizeNode) {
                                    $rawSize = $sizeNode.GetAttribute("name")
                                    if ($rawSize) {
                                        $paperSize = $rawSize -replace '^psk:', '' -replace '^ns0000:', ''
                                    }
                                }

                                # Paper/Media Type (e.g., psk:Plain, psk:PhotographicGlossy)
                                $mediaNode = $doc.SelectSingleNode("//psf:Feature[@name='psk:PageMediaType']/psf:Option", $ns)
                                if ($mediaNode) {
                                    $rawMedia = $mediaNode.GetAttribute("name")
                                    if ($rawMedia) {
                                        $mediaType = $rawMedia -replace '^psk:', '' -replace '^ns0000:', ''
                                    }
                                }

                                # Color Mode (psk:Color or psk:Monochrome or psk:Grayscale)
                                $colorNode = $doc.SelectSingleNode("//psf:Feature[@name='psk:PageOutputColor']/psf:Option", $ns)
                                if ($colorNode) {
                                    $rawColor = $colorNode.GetAttribute("name")
                                    if ($rawColor) {
                                        $colorMode = $rawColor -replace '^psk:', '' -replace '^ns0000:', ''
                                    }
                                }

                                # Copies
                                $copiesNode = $doc.SelectSingleNode("//psf:ParameterInit[@name='psk:JobCopiesAllDocuments']/psf:Value", $ns)
                                if ($copiesNode -and $copiesNode.InnerText) {
                                    $parsedCopies = [int]$copiesNode.InnerText
                                    if ($parsedCopies -gt 0) { $copies = $parsedCopies }
                                }

                                # Duplex (psk:OneSided, psk:TwoSidedLongEdge, psk:TwoSidedShortEdge)
                                $duplexNode = $doc.SelectSingleNode("//psf:Feature[@name='psk:JobDuplexAllDocumentsContiguously']/psf:Option", $ns)
                                if ($duplexNode) {
                                    $rawDuplex = $duplexNode.GetAttribute("name")
                                    if ($rawDuplex) {
                                        $duplexMode = $rawDuplex -replace '^psk:', '' -replace '^ns0000:', ''
                                    }
                                }
                            }

                            # Also get page count from PrintSystemJobInfo if WMI reported 0
                            if ($totalPages -le 0 -and $pj.NumberOfPages -gt 0) {
                                $totalPages = [int]$pj.NumberOfPages
                            }
                            break
                        }
                    }
                    $queue.Dispose()
                }
                $server.Dispose()
            } catch {}

            # If TotalPages is still 0, the job is still spooling — retry
            if ($totalPages -le 0) {
                for ($retry = 0; $retry -lt 3; $retry++) {
                    Start-Sleep -Milliseconds 500
                    try {
                        $retryJob = Get-PrintJob -PrinterName $printerName -ID ([int]$jobId) -ErrorAction Stop
                        if ($retryJob -and $retryJob.TotalPages -gt 0) {
                            $totalPages = [int]$retryJob.TotalPages
                            if ($copies -le 1 -and $retryJob.Copies -gt 1) { $copies = [int]$retryJob.Copies }
                            break
                        }
                    } catch { break }
                }
            }

            # Output the captured job as a JSON line
            $result = [PSCustomObject]@{
                Printer = $printerName
                JobId = [string]$jobId
                Document = $document
                TotalPages = $totalPages
                PagesPrinted = $pagesPrinted
                Copies = $copies
                Size = $sizeBytes
                Owner = $owner
                PaperSize = $paperSize
                MediaType = $mediaType
                DuplexMode = $duplexMode
                ColorMode = $colorMode
                CapturedAt = (Get-Date -Format 'o')
            }
            $json = $result | ConvertTo-Json -Compress
            Write-Output $json
            [Console]::Out.Flush()
        } catch {
            # Individual event processing error — log and continue
            Write-Output ('{"__error":"' + $_.Exception.Message.Replace('"','\\"') + '"}')
            [Console]::Out.Flush()
        }
    }
} catch {
    Write-Output ('{"__fatal":"' + $_.Exception.Message.Replace('"','\\"') + '"}')
    [Console]::Out.Flush()
} finally {
    if ($watcher) { $watcher.Stop(); $watcher.Dispose() }
}
`;

    function start() {
        if (running) return;

        const tmpFile = path.join(os.tmpdir(), 'hawknine_spooler_watcher.ps1');
        try {
            fs.writeFileSync(tmpFile, WATCHER_SCRIPT, 'utf8');
        } catch (e) {
            console.error('[SpoolerWatcher] Failed to write watcher script:', e.message);
            return;
        }

        running = true;
        console.log('[SpoolerWatcher] Starting real-time print job watcher...');

        psProcess = execFile('powershell.exe', [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy', 'Bypass',
            '-File', tmpFile
        ], { maxBuffer: 1024 * 1024 * 10, timeout: 0 }); // No timeout — runs forever

        psProcess.stdout.on('data', (chunk) => {
            buffer += chunk.toString();
            // Process complete JSON lines
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Keep incomplete last line in buffer

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;

                try {
                    const data = JSON.parse(trimmed);

                    // Handle status messages
                    if (data.__status === 'ready') {
                        console.log('[SpoolerWatcher] ✅ Real-time watcher is active');
                        continue;
                    }
                    if (data.__error) {
                        console.warn('[SpoolerWatcher] Event error:', data.__error);
                        continue;
                    }
                    if (data.__fatal) {
                        console.error('[SpoolerWatcher] Fatal error:', data.__fatal);
                        continue;
                    }

                    // Process captured print job
                    if (data.Printer && data.JobId) {
                        const jobKey = generatePrintJobKey(data.Printer, data.JobId, data.Document, null);
                        const jobData = {
                            jobKey: jobKey,
                            printer: data.Printer,
                            jobId: data.JobId,
                            document: data.Document || 'Unknown',
                            totalPages: parseInt(data.TotalPages) || 0,
                            pagesPrinted: parseInt(data.PagesPrinted) || 0,
                            copies: parseInt(data.Copies) || 1,
                            sizeBytes: parseInt(data.Size) || 0,
                            owner: data.Owner || '',
                            paperSize: data.PaperSize || '',
                            mediaType: data.MediaType || '',
                            duplexMode: data.DuplexMode || '',
                            colorMode: data.ColorMode || '',
                            capturedAt: data.CapturedAt || new Date().toISOString(),
                            source: 'wmi_event_realtime'
                        };

                        console.log(`[SpoolerWatcher] 🖨️ Instant capture: "${jobData.document}" - ${jobData.totalPages} pages, ${jobData.copies} copies, paper=${jobData.paperSize || 'default'}, media=${jobData.mediaType || 'default'}, color=${jobData.colorMode || 'unknown'}`);

                        if (typeof onJob === 'function') {
                            onJob(jobData);
                        }
                    }
                } catch (parseErr) {
                    // Ignore unparseable lines (PowerShell noise)
                }
            }
        });

        psProcess.stderr.on('data', (data) => {
            const msg = data.toString().trim();
            if (msg && !msg.includes('TerminatingError')) {
                console.warn('[SpoolerWatcher] stderr:', msg.substring(0, 200));
            }
        });

        psProcess.on('close', (code) => {
            running = false;
            console.log(`[SpoolerWatcher] Process exited with code ${code}`);
            // Cleanup temp file
            try { fs.unlinkSync(tmpFile); } catch (e) { /* ignore */ }

            // Auto-restart after 5 seconds unless explicitly stopped
            if (!psProcess._stopped) {
                console.log('[SpoolerWatcher] Auto-restarting in 5 seconds...');
                restartTimer = setTimeout(() => start(), 5000);
            }
        });

        psProcess.on('error', (err) => {
            console.error('[SpoolerWatcher] Process error:', err.message);
            running = false;
        });
    }

    function stop() {
        if (restartTimer) {
            clearTimeout(restartTimer);
            restartTimer = null;
        }
        if (psProcess) {
            psProcess._stopped = true;
            try {
                psProcess.kill();
            } catch (e) { /* ignore */ }
            psProcess = null;
        }
        running = false;
        console.log('[SpoolerWatcher] Stopped');
    }

    // Start immediately
    start();

    return { stop, isRunning: () => running };
}

module.exports = {
    getRecentPrintJobs,
    getRecentCompletedJobs,
    getPrintHistory,
    getInstalledPrinters,
    getPrinterCapabilities,
    getAllPrinterData,
    clearPrinterCache,
    enablePrintLogging,
    detectPrintType,
    detectColorCapability,
    generatePrintJobKey,
    computeTotalSheets,
    getSpoolerJobsFast,
    getJobPageCount,
    startSpoolerWatcher
};
