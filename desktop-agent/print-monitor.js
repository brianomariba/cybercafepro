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
 * Extract a meaningful document name from a window title.
 * When applications print with a generic name like "Print Document",
 * the window title usually contains the actual document name.
 * 
 * Common window title patterns:
 *   "report.pdf - Google Chrome"
 *   "Assignment.docx - Microsoft Word"
 *   "photo.jpg - Windows Photo Viewer"
 *   "Budget 2026.xlsx - Excel"
 *   "Untitled - Notepad"
 *   "file.pdf (page 1 of 3)"
 *   "Print Preview - file.pdf"
 */
function extractDocNameFromTitle(windowTitle) {
    if (!windowTitle || typeof windowTitle !== 'string') return null;
    const title = windowTitle.trim();
    if (!title) return null;

    // Skip system/print dialog windows
    const skipPatterns = [
        /^print$/i, /^printing$/i, /^print\s*dialog/i, /^save\s/i, /^open\s/i,
        /^hawknine/i, /^task\s*(bar|manager)/i, /^desktop$/i,
        /^microsoft\s+store/i, /^settings$/i, /^file\s+explorer/i
    ];
    for (const pat of skipPatterns) {
        if (pat.test(title)) return null;
    }

    // Known file extensions to look for
    const extPattern = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|rtf|odt|ods|odp|csv|html|htm|xml|jpg|jpeg|png|gif|bmp|tiff|tif|svg|webp|eml|msg)/i;

    // Strategy 1: Find a segment that contains a file extension
    // Split by common delimiters: " - ", " — ", " | ", " · "
    const segments = title.split(/\s+[-–—|·]\s+/);
    for (const seg of segments) {
        const trimSeg = seg.trim();
        if (extPattern.test(trimSeg)) {
            // Clean up: remove leading/trailing brackets, page info, asterisks
            let cleaned = trimSeg
                .replace(/^\[|\]$/g, '')
                .replace(/\s*\(page\s+\d+.*?\)/i, '')
                .replace(/\s*-\s*\d+%$/i, '')
                .replace(/^\*\s*/, '')
                .replace(/\s*\*$/, '')
                .trim();
            if (cleaned.length > 0 && cleaned.length < 200) {
                return cleaned;
            }
        }
    }

    // Strategy 2: Look for "filename.ext" pattern anywhere in the title
    const fileMatch = title.match(/([^\\/:"*?<>|]+\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|rtf|odt|csv|jpg|jpeg|png|gif|bmp|tif|tiff|svg|webp|html|htm))/i);
    if (fileMatch && fileMatch[1]) {
        return fileMatch[1].trim();
    }

    // Strategy 3: If title has " - AppName" format, use the first part
    // but only if it looks like a meaningful document name (not too short, not an app name)
    const appSuffixes = [
        /\s*-\s*(google\s+chrome|microsoft\s+edge|firefox|opera|brave|vivaldi|safari)$/i,
        /\s*-\s*(microsoft\s+)?(word|excel|powerpoint|onenote|outlook|visio|publisher|access)$/i,
        /\s*-\s*(notepad\+*\+*|sublime\s+text|visual\s+studio|vs\s+code|atom|brackets)$/i,
        /\s*-\s*(adobe\s+)?(acrobat|reader|photoshop|illustrator|indesign)$/i,
        /\s*-\s*(windows\s+)?(photo\s+viewer|photos|paint|media\s+player)$/i,
        /\s*-\s*(libre\s*office\s+)?(writer|calc|impress|draw|base)$/i,
        /\s*-\s*(wps\s+)?(writer|spreadsheets|presentation)$/i
    ];
    for (const suffix of appSuffixes) {
        if (suffix.test(title)) {
            let docPart = title.replace(suffix, '').trim();
            // Remove common prefixes
            docPart = docPart.replace(/^(print\s+preview\s*[-–—:]\s*)/i, '');
            if (docPart.length >= 2 && docPart.length < 200 && !/^(untitled|new\s+document|document\s*\d*|sheet\s*\d*|presentation\s*\d*)$/i.test(docPart)) {
                return docPart;
            }
        }
    }

    return null;
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
 * Fallback paper size when no Windows data is available.
 * ZERO GUESSWORK — no document name analysis.
 * The actual paper size is captured from PrintTicket (psk:PageMediaSize)
 * or Get-PrintConfiguration by the SpoolerWatcher. This function is only
 * called when all Windows sources failed (should be very rare).
 */
function inferPaperSize(documentName, sizeBytes) {
    return 'A4'; // Default when Windows didn't report any size
}

/**
 * Resolve media/paper type from Windows-reported driver media type string.
 * ZERO GUESSWORK — only trusts what the printer driver / PrintTicket reports.
 * Handles both human-readable names AND raw DEVMODE/PrintTicket values.
 * Returns 'Plain Paper' when no data (the most common real-world default).
 */
function inferMediaType(mediaTypeStr, documentName) {
    const media = (mediaTypeStr || '').toLowerCase().trim();

    // Skip empty/default/generic driver values (these mean "use printer default" = Plain Paper)
    const isGenericDefault = !media || media === '0' || media === 'default' ||
        media === 'autoselect' || media === 'auto' || media === 'stationery' ||
        media === 'unknown' || media === 'unspecified';

    if (!isGenericDefault) {
        // Driver/PrintTicket reported media types — trust these
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

    // No guessing from document names — default to Plain Paper
    return 'Plain Paper';
}

/**
 * Fallback print quality — defaults to Normal.
 * Actual quality is captured from PrintTicket when available.
 */
function inferPrintQuality(documentName, driverName) {
    return 'Normal';
}

/**
 * Detect if the print job is color or B&W.
 * 
 * ZERO GUESSWORK — only trusts Windows-reported per-job color settings.
 * No filename heuristics, no document name guessing.
 * 
 * Data sources (in priority order):
 *   1. job.JobColor — per-job DEVMODE/PrintTicket (from SpoolerWatcher or WMI)
 *      Values: 'Color', 'Monochrome', 'Grayscale', 1 (mono), 2 (color)
 *   2. job.Color — printer-level config (ONLY used to check if printer can do color)
 *      Values: true/false, 'True'/'False' — this is NOT per-job!
 * 
 * Logic:
 *   - If we have per-job color data → use it (definitive, no guessing)
 *   - If printer is NOT color-capable → B&W (can't print color regardless)
 *   - If no per-job data available → B&W (safe default for billing)
 */
function detectPrintType(job) {
    // 1. Per-job color setting — the DEFINITIVE answer
    // Comes from: PrintTicket XML (psk:PageOutputColor), WMI Win32_PrintJob.Color,
    //             Get-PrintJob per-job Color, or DEVMODE dmColor
    if (job.JobColor !== undefined && job.JobColor !== null && job.JobColor !== 'Unknown' && job.JobColor !== '') {
        const jobColorVal = typeof job.JobColor === 'string' ? job.JobColor.toLowerCase().trim() : job.JobColor;

        // B&W / Grayscale
        if (jobColorVal === 1 || jobColorVal === '1' || jobColorVal === 'monochrome' ||
            jobColorVal === 'grayscale' || jobColorVal === 'false') {
            return 'bw';
        }
        // Color
        if (jobColorVal === 2 || jobColorVal === '2' || jobColorVal === 'color' || jobColorVal === 'true') {
            return 'color';
        }
    }

    // 2. If the printer is NOT color-capable, every job is B&W regardless
    const printerName = job.PrinterName || job.printer || '';
    const driverLower = (job.DriverName || job.printerDriver || '').toLowerCase();
    const printerNameLower = printerName.toLowerCase();

    let isColorPrinter = false;
    if (printerCache.has(printerName)) {
        isColorPrinter = printerCache.get(printerName).isColor === true;
    } else if (typeof job.Color === 'string' && job.Color.toLowerCase() === 'true') {
        isColorPrinter = true;
    } else if (job.Color === true) {
        isColorPrinter = true;
    } else if (job.Color === false || (typeof job.Color === 'string' &&
        ['false', 'monochrome', 'grayscale'].includes(job.Color.toLowerCase()))) {
        isColorPrinter = false;
    } else {
        isColorPrinter = detectColorCapability(printerNameLower, driverLower);
    }

    if (!isColorPrinter) return 'bw';

    // 3. Printer CAN do color, but we have NO per-job color data.
    // Default to B&W — without proof from Windows that the user selected color,
    // we don't assume it. The SpoolerWatcher should capture this for every job;
    // if it didn't, B&W is the safe billing default.
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
        $jobColorMode = ""
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

        # Try to get per-job DEVMODE settings from WMI (job may still be briefly in spooler)
        # Win32_PrintJob has Color (per-job DEVMODE) and Parameters (paper info)
        try {
            $wmiJobName2 = "$printer, $id"
            $wmiJob2 = Get-CimInstance Win32_PrintJob -Filter "Name='$wmiJobName2'" -ErrorAction Stop
            if ($wmiJob2) {
                # CRITICAL: Get per-job Color from WMI — this is the DEVMODE dmColor
                # NOT the printer default. Values: 'Color' or 'Monochrome'
                if ($wmiJob2.Color) { $jobColorMode = [string]$wmiJob2.Color }
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

        # If WMI didn't capture per-job color, try Get-PrintJob fallback
        if ($jobColorMode -eq '') {
            try {
                $pjFb2 = Get-PrintJob -PrinterName $printer -ID ([int]$id) -ErrorAction Stop
                if ($pjFb2 -and $pjFb2.Color -ne $null) {
                    $c2 = [string]$pjFb2.Color
                    if ($c2 -eq 'True') { $jobColorMode = 'Color' }
                    elseif ($c2 -eq 'False') { $jobColorMode = 'Monochrome' }
                    elseif ($c2 -ne '') { $jobColorMode = $c2 }
                }
            } catch {}
        }
        # If printer is definitively B&W-only, set Monochrome
        if ($jobColorMode -eq '' -and $colorMode -ne 'Unknown' -and $colorMode -eq 'False') {
            $jobColorMode = 'Monochrome'
        }

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
            JobColorMode = [string]$jobColorMode
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
                JobColor: j.JobColorMode || null,  // Per-job DEVMODE color (from WMI)
                Color: j.ColorMode || null          // Printer config color (capability only)
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
# + Foreground window title capture for real document names
#
# PrintTicket is the XML representation of what the user picked
# in the print dialog. It contains EVERY setting — not filtered
# by the driver, not defaults. The actual selections.

$ErrorActionPreference = 'SilentlyContinue'

# Load System.Printing assembly for PrintTicket access
Add-Type -AssemblyName System.Printing
Add-Type -AssemblyName ReachFramework

# Add Win32 API for getting the foreground window title
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class ForegroundWindow {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    public static string GetTitle() {
        IntPtr handle = GetForegroundWindow();
        StringBuilder sb = new StringBuilder(512);
        GetWindowText(handle, sb, sb.Capacity);
        return sb.ToString();
    }
}
"@

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

            # Capture the foreground window title — this often contains the real document name
            # when the application submits a generic name like "Print Document"
            $windowTitle = ""
            try {
                $windowTitle = [ForegroundWindow]::GetTitle()
            } catch {}

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

            # ===== ENSURE colorMode IS CAPTURED — no guesswork allowed =====
            # If PrintTicket didn't give us colorMode, try other Windows sources.
            if ($colorMode -eq '') {
                # Fallback 1: Get-PrintJob per-job Color property
                try {
                    $pjFb = Get-PrintJob -PrinterName $printerName -ID ([int]$jobId) -ErrorAction Stop
                    if ($pjFb -and $pjFb.Color -ne $null) {
                        $fbColor = [string]$pjFb.Color
                        if ($fbColor -eq 'True') { $colorMode = 'Color' }
                        elseif ($fbColor -eq 'False') { $colorMode = 'Monochrome' }
                        elseif ($fbColor -ne '') { $colorMode = $fbColor }
                    }
                } catch {}
            }

            if ($colorMode -eq '') {
                # Fallback 2: WMI Win32_PrintJob.Color (per-job DEVMODE dmColor)
                try {
                    $wmiCJob = Get-CimInstance Win32_PrintJob -Filter "Name='$printerName, $jobId'" -ErrorAction Stop
                    if ($wmiCJob -and $wmiCJob.Color) { $colorMode = [string]$wmiCJob.Color }
                } catch {}
            }

            if ($colorMode -eq '') {
                # Fallback 3: If printer is NOT color-capable, set Monochrome
                try {
                    $pcfg = Get-PrintConfiguration -PrinterName $printerName -ErrorAction Stop
                    if ($pcfg.Color -eq $false) { $colorMode = 'Monochrome' }
                } catch {}
            }

            # Output the captured job as a JSON line
            $result = [PSCustomObject]@{
                Printer = $printerName
                JobId = [string]$jobId
                Document = $document
                WindowTitle = [string]$windowTitle
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

                        // Resolve document name: use window title if the spooler name is generic
                        let resolvedDocName = data.Document || 'Unknown';
                        const genericNames = ['print document', 'untitled', 'unknown', 'document', 'local print'];
                        if (genericNames.includes(resolvedDocName.toLowerCase().trim())) {
                            const betterName = extractDocNameFromTitle(data.WindowTitle || '');
                            if (betterName) {
                                resolvedDocName = betterName;
                            }
                        }

                        const jobData = {
                            jobKey: jobKey,
                            printer: data.Printer,
                            jobId: data.JobId,
                            document: resolvedDocName,
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

                        console.log(`[SpoolerWatcher] 🖨️ Instant capture: "${jobData.document}" (raw: "${data.Document}", window: "${(data.WindowTitle || '').substring(0, 80)}") - ${jobData.totalPages} pages, ${jobData.copies} copies, paper=${jobData.paperSize || 'default'}, media=${jobData.mediaType || 'default'}, color=${jobData.colorMode || 'unknown'}`);

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
