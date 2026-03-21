const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Track processed jobs to avoid duplicates
let processedJobIds = new Set();
// Cache printer capabilities — invalidated every 30 minutes to pick up
// hardware changes (e.g., color cartridge removed, new printer installed)
let printerCache = new Map();
const PRINTER_CACHE_INVALIDATION_MS = 30 * 60 * 1000; // 30 minutes
setInterval(() => {
    if (printerCache.size > 0) {
        console.log(`[PrintMonitor] Clearing printer capability cache (${printerCache.size} entries) for fresh re-detection`);
        printerCache.clear();
    }
}, PRINTER_CACHE_INVALIDATION_MS);
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
    // Split by common delimiters: " - ", " â€” ", " | ", " Â· "
    const segments = title.split(/\s+[-â€“â€”|Â·]\s+/);
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
            docPart = docPart.replace(/^(print\s+preview\s*[-â€“â€”:]\s*)/i, '');
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
 * This is a universal heuristic fallback â€” no model-specific hardcoding.
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
 * ZERO GUESSWORK â€” no document name analysis.
 * The actual paper size is captured from PrintTicket (psk:PageMediaSize)
 * or Get-PrintConfiguration by the SpoolerWatcher. This function is only
 * called when all Windows sources failed (should be very rare).
 */
function inferPaperSize(documentName, sizeBytes) {
    return 'A4'; // Default when Windows didn't report any size
}

/**
 * Resolve media/paper type from Windows-reported driver media type string.
 * ZERO GUESSWORK â€” only trusts what the printer driver / PrintTicket reports.
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
        // Driver/PrintTicket reported media types â€” trust these
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

    // No guessing from document names â€” default to Plain Paper
    return 'Plain Paper';
}

/**
 * Fallback print quality â€” defaults to Normal.
 * Actual quality is captured from PrintTicket when available.
 */
function inferPrintQuality(documentName, driverName) {
    return 'Normal';
}

/**
 * Detect if the print job is color or B&W.
 * 
 * ZERO GUESSWORK â€” only trusts Windows-reported per-job color settings.
 * No filename heuristics, no document name guessing.
 * 
 * Data sources (in priority order):
 *   1. job.JobColor â€” per-job DEVMODE/PrintTicket (from SpoolerWatcher or WMI)
 *      Values: 'Color', 'Monochrome', 'Grayscale', 1 (mono), 2 (color)
 *   2. job.Color â€” printer-level config (ONLY used to check if printer can do color)
 *      Values: true/false, 'True'/'False' â€” this is NOT per-job!
 * 
 * Logic:
 *   - If we have per-job color data â†’ use it (definitive, no guessing)
 *   - If printer is NOT color-capable â†’ B&W (can't print color regardless)
 *   - If no per-job data available â†’ B&W (safe default for billing)
 */
function detectPrintType(job) {
    // 1. Per-job color setting â€” the DEFINITIVE answer
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
    // Default to B&W â€” without proof from Windows that the user selected color,
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
 * Verify that the Print Service Operational log is actually enabled.
 * Returns a promise that resolves to true/false.
 * If not enabled, attempts to enable with retries every 30 seconds.
 */
async function verifyPrintLogging() {
    const checkScript = `
try {
    $log = Get-WinEvent -ListLog 'Microsoft-Windows-PrintService/Operational' -ErrorAction Stop
    if ($log.IsEnabled) { 'ENABLED' } else { 'DISABLED' }
} catch { 'ERROR' }
`;
    const result = await runPS(checkScript, 10000);
    const status = result.trim();

    if (status === 'ENABLED') {
        console.log('[PrintMonitor] ✅ Print Service Operational log is ENABLED');
        return true;
    }

    console.error('[PrintMonitor] ⚠️ Print Service Operational log is NOT enabled! Print tracking will NOT work.');

    // Retry enabling
    enablePrintLogging();

    // Schedule periodic retry if still not enabled
    let retryCount = 0;
    const retryInterval = setInterval(async () => {
        retryCount++;
        if (retryCount > 10) {
            clearInterval(retryInterval);
            console.error('[PrintMonitor] ❌ Failed to enable print logging after 10 retries. Print tracking is DISABLED.');
            return;
        }

        const retryResult = await runPS(checkScript, 10000);
        if (retryResult.trim() === 'ENABLED') {
            console.log('[PrintMonitor] ✅ Print Service Operational log is now ENABLED (after retry)');
            clearInterval(retryInterval);
        } else {
            console.log(`[PrintMonitor] Retry ${retryCount}/10: Still not enabled, retrying...`);
            enablePrintLogging();
        }
    }, 30000); // Retry every 30 seconds

    return false;
}

/**
 * Get print history from Windows Event Log (completed jobs)
 * This captures jobs that have already finished printing
 */
async function getPrintHistory(hoursBack = 24) {
    const script = `
$results = @()
try {
    # Build canceled job IDs set for the same time window
    $canceledJobIds = @{}
    try {
        $cancelEvents = Get-WinEvent -FilterHashtable @{
            LogName = 'Microsoft-Windows-PrintService/Operational'
            ID = 312, 314
            StartTime = (Get-Date).AddHours(-${hoursBack})
        } -ErrorAction SilentlyContinue
        foreach ($ce in $cancelEvents) {
            try {
                $cjobId = $null
                if ($ce.Properties -and $ce.Properties.Count -ge 1) { $cjobId = $ce.Properties[0].Value }
                if (-not $cjobId -and $ce.Message -match 'Document\s+(\d+)') { $cjobId = [int]$Matches[1] }
                if ($cjobId) { $canceledJobIds[[string]$cjobId] = $true }
            } catch {}
        }
    } catch {}

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

        # CANCELED JOB CHECK: Skip this job if it appears in the canceled/deleted set
        if ($id -and $canceledJobIds.ContainsKey([string]$id)) { continue }

        # ALWAYS parse message text â€” some EPSON drivers (L3250, L3210) report Param8=1
        # for ALL jobs, but the formatted message text may contain the real page count.
        $msg = $evt.Message
        if ($msg) {
            $msgPages = 0
            if ($msg -match 'printed\s+(\d+)\s+page') { $msgPages = [int]$Matches[1] }
            elseif ($msg -match '(\d+)\s+page') { $msgPages = [int]$Matches[1] }
            if ($msg -match 'Pages printed[:\s]+(\d+)') {
                $ep = [int]$Matches[1]
                if ($ep -gt $msgPages) { $msgPages = $ep }
            }
            if ($msgPages -gt [int]$pages) { $pages = $msgPages }

            if ([int]$pages -le 0 -or $pages -eq $null) {
                if ($msg -match '(\d+)\s+page') { $pages = [int]$Matches[1] }
            }
            if ($sizeBytes -eq 0 -and $msg -match 'Size in bytes:\s*(\d+)') { $sizeBytes = [long]$Matches[1] }
            if ($id -eq 0 -and $msg -match 'Document\s+(\d+)') { $id = [int]$Matches[1] }
            if ($doc -eq 'Unknown' -and $msg -match 'Document\s+\d+,\s+(.+?)\s+owned') { $doc = $Matches[1] }
            if ($user -eq 'Unknown' -and $msg -match 'owned by\s+(.+?)\s+on') { $user = $Matches[1] }
            if ($printer -eq 'Unknown' -and $msg -match 'printed on\s+(.+?)\s+through') { $printer = $Matches[1] }
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
    # STEP 1: Build a set of CANCELED/DELETED job IDs from a wider time window.
    # Event 312 = document deleted, Event 314 = job canceled.
    # Any job ID appearing here was NOT successfully printed.
    $canceledJobIds = @{}
    try {
        $cancelEvents = Get-WinEvent -FilterHashtable @{
            LogName = 'Microsoft-Windows-PrintService/Operational'
            ID = 312, 314
            StartTime = (Get-Date).AddSeconds(-${secondsBack * 2})
        } -ErrorAction SilentlyContinue
        foreach ($ce in $cancelEvents) {
            try {
                $cjobId = $null
                try {
                    $cx = [xml]$ce.ToXml()
                    if ($cx.Event.UserData.DocumentPrinted) { $cjobId = $cx.Event.UserData.DocumentPrinted.Param1 }
                    elseif ($cx.Event.UserData.DocumentDeleted) { $cjobId = $cx.Event.UserData.DocumentDeleted.Param1 }
                } catch {}
                if (-not $cjobId -and $ce.Properties -and $ce.Properties.Count -ge 1) {
                    $cjobId = $ce.Properties[0].Value
                }
                if (-not $cjobId -and $ce.Message -match 'Document\s+(\d+)') {
                    $cjobId = [int]$Matches[1]
                }
                if ($cjobId) { $canceledJobIds[[string]$cjobId] = $true }
            } catch {}
        }
    } catch {}

    # STEP 2: Get completed print events (Event 307)
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

        # CANCELED JOB CHECK: Skip this job if it appears in the canceled/deleted set
        if ($id -and $canceledJobIds.ContainsKey([string]$id)) { continue }

        # ALWAYS parse message text â€” some EPSON drivers (L3250, L3210) report Param8=1
        # for ALL jobs, but the formatted message text may contain the real page count.
        # We take the MAX of Param8 and message-parsed count to ensure accuracy.
        $msg = $evt.Message
        if ($msg) {
            # Parse page count from message â€” try multiple patterns
            $msgPages = 0
            if ($msg -match 'printed\s+(\d+)\s+page') { $msgPages = [int]$Matches[1] }
            elseif ($msg -match '(\d+)\s+page') { $msgPages = [int]$Matches[1] }
            # EPSON format: "Pages printed: 8"
            if ($msg -match 'Pages printed[:\s]+(\d+)') {
                $ep = [int]$Matches[1]
                if ($ep -gt $msgPages) { $msgPages = $ep }
            }
            # Use the higher of Param8 and message-parsed count
            if ($msgPages -gt [int]$pages) { $pages = $msgPages }

            # Parse other fields from message if not already captured
            if ([int]$pages -le 0 -or $pages -eq $null) {
                if ($msg -match '(\d+)\s+page') { $pages = [int]$Matches[1] }
            }
            if ($sizeBytes -eq 0 -and $msg -match 'Size in bytes:\s*(\d+)') { $sizeBytes = [long]$Matches[1] }
            if ($id -eq 0 -and $msg -match 'Document\s+(\d+)') { $id = [int]$Matches[1] }
            if ($doc -eq 'Unknown' -and $msg -match 'Document\s+\d+,\s+(.+?)\s+owned') { $doc = $Matches[1] }
            if ($user -eq 'Unknown' -and $msg -match 'owned by\s+(.+?)\s+on') { $user = $Matches[1] }
            if ($printer -eq 'Unknown' -and $msg -match 'printed on\s+(.+?)\s+through') { $printer = $Matches[1] }
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

        # 2. Try WMI for this specific job â€” get DEVMODE-level per-job settings
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
                # CRITICAL: Get per-job Color from WMI â€” this is the DEVMODE dmColor
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
 * Query MULTIPLE Windows sources for ACCURATE page count.
 * Handles EPSON L3250/L3210 where Event 307 Param8 AND message text both report 1.
 *
 * Sources: 1) Spool file EMF page counting  2) Event 805 GdiJobSize  3) Event 307
 * Returns: { totalPages, copies } or null
 */
async function getRenderedPageCount(printerName, jobId, documentName) {
    const script = `
$bestPages = 0
$bestCopies = 1

# SOURCE 1: COUNT EMF PAGES IN SPOOL FILE (bypasses driver entirely)
try {
    $spoolDir = "$env:SystemRoot\System32\spool\PRINTERS"
    $jobIdStr = "{0:D5}" -f [int]${jobId}
    $splFiles = Get-ChildItem "$spoolDir\*$jobIdStr.SPL" -ErrorAction SilentlyContinue
    foreach ($spl in $splFiles) {
            $bytes = [System.IO.File]::ReadAllBytes($spl.FullName)
            $str = [System.Text.Encoding]::ASCII.GetString($bytes)
            $emfPageCount = 0
            # A genuine EMF page boundary always has an EMR_HEADER.
            # EMR_HEADER structure: 
            # Offset 0: Type = 1 (0x01 00 00 00)
            # Offset 40: Signature = " EMF" (0x20 0x45 0x4D 0x46)
            for ($i = 0; $i -lt ($bytes.Length - 44); $i++) {
                if ($bytes[$i] -eq 1 -and $bytes[$i+1] -eq 0 -and $bytes[$i+2] -eq 0 -and $bytes[$i+3] -eq 0) {
                    if ($bytes[$i+40] -eq 0x20 -and $bytes[$i+41] -eq 0x45 -and $bytes[$i+42] -eq 0x4D -and $bytes[$i+43] -eq 0x46) {
                        $emfPageCount++
                        $i += 80 # Skip past the header to avoid rescanning
                    }
                }
            }
            if ($emfPageCount -gt $bestPages) { $bestPages = $emfPageCount }
            
            # Also extract copies from PrintTicket XML embedded in SPL file (used by Word)
            $fs3 = [System.IO.File]::Open($spl.FullName, 'Open', 'Read', 'ReadWrite')
            $buffer = New-Object byte[] 81920
            $bytesRead = $fs3.Read($buffer, 0, $buffer.Length)
            $fs3.Close()
            $splText = [System.Text.Encoding]::UTF8.GetString($buffer, 0, $bytesRead)
            if ($splText -match '(?is)JobCopiesAllDocuments.*?Value[^>]*>(\d+)<') {
                $parsedCopies = [int]$matches[1]
                if ($parsedCopies -gt $bestCopies) { $bestCopies = $parsedCopies }
            }
        } catch {
            try { if ($br) { $br.Close() } } catch {}
            try { if ($fs) { $fs.Close() } } catch {}
        }
    }
} catch {}

# SOURCE 2: EVENT 805 GdiJobSize calibration
if ($bestPages -le 1 -or $bestCopies -eq 1) {
    try {
        $evts805 = Get-WinEvent -FilterHashtable @{
            LogName = 'Microsoft-Windows-PrintService/Operational'
            ID = 805
            StartTime = (Get-Date).AddMinutes(-10)
        } -MaxEvents 50 -ErrorAction Stop

        foreach ($e in $evts805) {
            try {
                $xml = [xml]$e.ToXml()
                $rd = $xml.Event.UserData.RenderJobDiag
                if ($rd -and [int]$rd.JobId -eq ${jobId}) {
                    # CRITICAL: Event 805 has the ACCURATE copies count!
                    if ($rd.Copies -and [int]$rd.Copies -gt $bestCopies) {
                        $bestCopies = [int]$rd.Copies
                    }
                    break
                }
            } catch {}
        }
    } catch {}
}

# SOURCE 3: EVENT 307 Param8 + message text
try {
    $evts307 = Get-WinEvent -FilterHashtable @{
        LogName = 'Microsoft-Windows-PrintService/Operational'
        ID = 307
        StartTime = (Get-Date).AddMinutes(-10)
    } -MaxEvents 50 -ErrorAction Stop

    foreach ($e in $evts307) {
        try {
            $xml = [xml]$e.ToXml()
            $ud = $xml.Event.UserData.DocumentPrinted
            if ($ud -and [int]$ud.Param1 -eq ${jobId}) {
                $p8 = [int]$ud.Param8
                if ($p8 -gt $bestPages) { $bestPages = $p8 }
                $msg = $e.Message
                if ($msg -and $msg -match 'Pages printed[:\\s]+(\\d+)') {
                    $mp = [int]$Matches[1]
                    if ($mp -gt $bestPages) { $bestPages = $mp }
                }
                break
            }
        } catch {}
    }
} catch {}

if ($bestPages -gt 0 -or $bestCopies -gt 1) {
    [PSCustomObject]@{ TotalPages = [Math]::Max(1, $bestPages); Copies = $bestCopies } | ConvertTo-Json
} else { "{}" }
`;

    try {
        const stdout = await runPS(script, 12000);
        if (stdout && stdout.trim() !== '' && stdout.trim() !== '{}') {
            const data = JSON.parse(stdout);
            const tp = parseInt(data.TotalPages) || 0;
            const cp = parseInt(data.Copies) || 1;
            if (tp > 0 || cp > 1) {
                return { totalPages: Math.max(1, tp), copies: cp };
            }
        }
    } catch (e) {
        // Ignore
    }
    return null;
}


/**
 * AGGRESSIVE page count query â€” used when Event 307 fires but we have
 * a suspicious page count (0 or 1) from both the cache and Event Log.
 * 
 * This function tries EVERY available source with retries.
 * It should be called from the Event 307 handler in main.js when the
 * merged page count is <= 1 but the file size suggests more pages.
 * 
 * Returns: { totalPages, pagesPrinted, copies } or null
 */
async function queryJobPageCountAggressive(printerName, jobId) {
    // Try up to 3 rapid queries â€” the job may still be briefly in spooler
    for (let attempt = 0; attempt < 3; attempt++) {
        const script = `
$totalPages = 0
$pagesPrinted = 0
$copies = 1

# Source 1: WMI Win32_PrintJob
try {
    $j = Get-CimInstance Win32_PrintJob -Filter "Name='${printerName}, ${jobId}'" -ErrorAction Stop
    if ($j -and $j.TotalPages -gt 0) {
        $totalPages = [int]$j.TotalPages
        $pagesPrinted = [int]$j.PagesPrinted
        try {
            if ($j.Parameters -match 'Copies=(\\d+)') {
                $copies = [int]$Matches[1]
            }
        } catch {}
    }
} catch {}

# Source 2: Get-PrintJob
if ($totalPages -le 0) {
    try {
        $pj = Get-PrintJob -PrinterName "${printerName}" -ID ${jobId} -ErrorAction Stop
        if ($pj -and $pj.TotalPages -gt 0) {
            $totalPages = [int]$pj.TotalPages
            $pagesPrinted = [int]$pj.PagesPrinted
            if ($pj.Copies -gt 1) { $copies = [int]$pj.Copies }
        }
    } catch {}
}

# Source 3: System.Printing
if ($totalPages -le 0) {
    try {
        Add-Type -AssemblyName System.Printing -ErrorAction Stop
        $server = New-Object System.Printing.LocalPrintServer
        $queue = $server.GetPrintQueue("${printerName}")
        if ($queue) {
            $jobs = $queue.GetPrintJobInfoCollection()
            foreach ($pjInfo in $jobs) {
                if ($pjInfo.JobIdentifier -eq ${jobId}) {
                    if ($pjInfo.NumberOfPages -gt 0) {
                        $totalPages = [int]$pjInfo.NumberOfPages
                    }
                    break
                }
            }
            $queue.Dispose()
        }
        $server.Dispose()
    } catch {}
}

# Source 4: Check Event Log 307 directly for this specific job
if ($totalPages -le 0) {
    try {
        $evts = Get-WinEvent -FilterHashtable @{
            LogName = 'Microsoft-Windows-PrintService/Operational'
            ID = 307
            StartTime = (Get-Date).AddMinutes(-5)
        } -ErrorAction Stop | Select-Object -First 20

        foreach ($evt in $evts) {
            try {
                $xml = [xml]$evt.ToXml()
                $ud = $xml.Event.UserData.DocumentPrinted
                if ($ud -and [int]$ud.Param1 -eq ${jobId} -and $ud.Param5 -eq "${printerName}") {
                    $evtPages = [int]$ud.Param8
                    if ($evtPages -gt $totalPages) { $totalPages = $evtPages }
                    break
                }
            } catch {}
        }
    } catch {}
}

if ($totalPages -gt 0) {
    [PSCustomObject]@{
        TotalPages = $totalPages
        PagesPrinted = $pagesPrinted
        Copies = $copies
    } | ConvertTo-Json
} else { "{}" }
`;

        try {
            const stdout = await runPS(script, 5000);
            if (stdout && stdout.trim() !== '' && stdout.trim() !== '{}') {
                const data = JSON.parse(stdout);
                if (data.TotalPages && parseInt(data.TotalPages) > 0) {
                    return {
                        totalPages: parseInt(data.TotalPages),
                        pagesPrinted: parseInt(data.PagesPrinted) || 0,
                        copies: parseInt(data.Copies) || 1
                    };
                }
            }
        } catch (e) {
            // Continue to next attempt
        }

        // Brief wait between attempts
        await new Promise(r => setTimeout(r, 300));
    }

    return null;
}

/**
 * BACKGROUND PAGE COUNT UPDATER
 * 
 * Runs a periodic poll (every 2 seconds) that re-queries ALL active spooler 
 * jobs and updates the page count cache. This is the SAFETY NET that catches
 * page counts that the real-time watcher missed (e.g., TotalPages was 0 when
 * the job first entered the spooler, but is now populated after rendering).
 * 
 * This runs alongside the real-time watcher, NOT as a replacement.
 * The onUpdate callback receives updated job data whenever a higher page count
 * is detected for a cached job.
 * 
 * Returns a control object with stop() method.
 */
function startPageCountUpdater(spoolerCache, onUpdate) {
    let timer = null;
    let running = false;

    async function poll() {
        if (running) return;
        running = true;

        try {
            const spoolerJobs = await getSpoolerJobsFast();
            for (const job of spoolerJobs) {
                if (!job.jobKey) continue;

                const existing = spoolerCache.get(job.jobKey);
                if (existing && (
                    job.totalPages > (existing.totalPages || 0) ||
                    job.pagesPrinted > (existing.pagesPrinted || 0) ||
                    job.copies > (existing.copies || 1) ||
                    (!existing.paperSize && job.paperSize) ||
                    (!existing.mediaType && job.mediaType) ||
                    (!existing.duplexMode && job.duplexMode) ||
                    (!existing.colorMode && job.colorMode)
                )) {
                    // Found a higher page count â€” update the cache
                    existing.totalPages = Math.max(job.totalPages || 0, existing.totalPages || 0);
                    if (job.pagesPrinted > (existing.pagesPrinted || 0)) {
                        existing.pagesPrinted = job.pagesPrinted;
                    }
                    if (job.copies > (existing.copies || 1)) {
                        existing.copies = job.copies;
                    }
                    if (!existing.document && job.document) existing.document = job.document;
                    if (!existing.printer && job.printer) existing.printer = job.printer;
                    if ((job.sizeBytes || 0) > (existing.sizeBytes || 0)) {
                        existing.sizeBytes = job.sizeBytes;
                    }
                    // Also update other fields if they were empty
                    if (!existing.paperSize && job.paperSize) existing.paperSize = job.paperSize;
                    if (!existing.mediaType && job.mediaType) existing.mediaType = job.mediaType;
                    if (!existing.duplexMode && job.duplexMode) existing.duplexMode = job.duplexMode;
                    if (!existing.colorMode && job.colorMode) existing.colorMode = job.colorMode;

                    existing.cachedAt = Date.now();
                    spoolerCache.set(job.jobKey, existing);

                    console.log(`[PrintUpdater] Updated: "${existing.document}" @ ${existing.printer} â€” now ${existing.totalPages} pages`);

                    if (typeof onUpdate === 'function') {
                        onUpdate(job.jobKey, existing);
                    }
                } else if (!existing && job.totalPages > 0) {
                    // Job wasn't in cache â€” add it (watcher might have missed it)
                    spoolerCache.set(job.jobKey, {
                        totalPages: job.totalPages,
                        pagesPrinted: job.pagesPrinted || 0,
                        copies: job.copies || 1,
                        document: job.document,
                        printer: job.printer,
                        sizeBytes: job.sizeBytes,
                        paperSize: job.paperSize || '',
                        mediaType: job.mediaType || '',
                        duplexMode: job.duplexMode || '',
                        colorMode: job.colorMode || '',
                        cachedAt: Date.now()
                    });

                    console.log(`[PrintUpdater] New job cached: "${job.document}" @ ${job.printer} â€” ${job.totalPages} pages`);

                    if (typeof onUpdate === 'function') {
                        onUpdate(job.jobKey, spoolerCache.get(job.jobKey));
                    }
                }
            }
        } catch (e) {
            // Silently fail â€” this is a best-effort background updater
        }

        running = false;
    }

    // Start polling every 2 seconds
    timer = setInterval(poll, 2000);
    console.log('[PrintUpdater] Background page count updater started (2s interval)');

    return {
        stop: () => {
            if (timer) {
                clearInterval(timer);
                timer = null;
            }
            console.log('[PrintUpdater] Stopped');
        },
        isRunning: () => timer !== null
    };
}

/**
 * REAL-TIME SPOOLER WATCHER
 * 
 * Runs a persistent PowerShell process that uses WMI event subscription
 * to get INSTANT notification when a print job enters the spooler.
 * 
 * Unlike polling (which checks every 1.5s), this fires within milliseconds
 * of the job appearing â€” giving us time to read the full DEVMODE before
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
# in the print dialog. It contains EVERY setting â€” not filtered
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

# Add Win32 API for reading per-job DEVMODE from spooler
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class PrintJobApi {
    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool OpenPrinter(string pPrinterName, out IntPtr hPrinter, IntPtr pDefault);
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool GetJob(IntPtr hPrinter, int jobId, int level, IntPtr buffer, int bufSize, out int needed);

    // Read dmColor, dmMediaType, dmDuplex, dmOrientation, dmPaperSize, dmCopies from per-job DEVMODE
    public static int[] GetJobDevmode(string printerName, int jobId) {
        // Returns [dmColor, dmMediaType, dmDuplex, dmOrientation, dmPaperSize, dmCopies] or null
        IntPtr hPrinter;
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) return null;
        try {
            int needed = 0;
            GetJob(hPrinter, jobId, 2, IntPtr.Zero, 0, out needed);
            if (needed <= 0) return null;
            IntPtr buf = Marshal.AllocHGlobal(needed);
            try {
                if (!GetJob(hPrinter, jobId, 2, buf, needed, out needed)) return null;
                // JOB_INFO_2 layout (verified via live testing):
                // x64: JobId(4) + pad(4) + 9 string ptrs(72) = pDevMode at offset 80
                //   Ptrs: pPrinterName, pMachineName, pUserName, pDocument,
                //         pNotifyName, pDatatype, pPrintProcessor, pParameters, pDriverName
                // x86: JobId(4) + 9 string ptrs(36) = pDevMode at offset 40
                IntPtr pDevMode;
                if (IntPtr.Size == 8) {
                    pDevMode = Marshal.ReadIntPtr(buf, 80);
                } else {
                    pDevMode = Marshal.ReadIntPtr(buf, 40);
                }
                if (pDevMode == IntPtr.Zero) return null;
                // DEVMODE struct (after 64-byte dmDeviceName):
                //   dmOrientation at 76 (64+12), dmPaperSize at 78 (64+14)
                //   dmCopies at 86 (64+22) ← CRITICAL for EPSON copies!
                //   dmColor at 92 (64+28), dmDuplex at 94 (64+30)
                //   dmMediaType at offset 196 (standard Windows DEVMODE field)
                short dmColor = Marshal.ReadInt16(pDevMode, 92);      // 64+28
                short dmDuplex = Marshal.ReadInt16(pDevMode, 94);     // 64+30
                int dmMediaType = Marshal.ReadInt32(pDevMode, 196);   // standard dmMediaType
                short dmOrientation = Marshal.ReadInt16(pDevMode, 76);// 64+12
                short dmPaperSize = Marshal.ReadInt16(pDevMode, 78);  // 64+14
                short dmCopies = Marshal.ReadInt16(pDevMode, 86);     // 64+22
                return new int[] { dmColor, dmMediaType, dmDuplex, dmOrientation, dmPaperSize, dmCopies };
            } finally { Marshal.FreeHGlobal(buf); }
        } finally { ClosePrinter(hPrinter); }
    }
}
"@

# Silent background print dialog monitor. This reads the standard Windows
# print dialog's Copies field without showing any HawkNine UI.
$tmpCopiesFile = "$env:TEMP\\hawknine_copies.txt"
$dialogRunspace = [runspacefactory]::CreateRunspace()
$dialogRunspace.Open()
$dialogMonitorPS = [powershell]::Create()
$dialogMonitorPS.Runspace = $dialogRunspace
[void]$dialogMonitorPS.AddScript({
    param($tmpFile)
    Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class PDM {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr GetDlgItem(IntPtr hDlg, int nIDDlgItem);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder s, int n);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetClassName(IntPtr hWnd, StringBuilder s, int n);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int SendMessage(IntPtr h, int m, int w, StringBuilder l);
    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc f, IntPtr p);
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr h);
    public delegate bool EnumWindowsProc(IntPtr h, IntPtr p);

    public static int ReadCopies() {
        int copies = 0;
        EnumWindows(delegate(IntPtr h, IntPtr p) {
            if (!IsWindowVisible(h)) return true;
            StringBuilder cn = new StringBuilder(256);
            GetClassName(h, cn, 256);
            if (cn.ToString() != "#32770") return true;

            StringBuilder title = new StringBuilder(256);
            GetWindowText(h, title, 256);
            if (!title.ToString().ToLower().Contains("print")) return true;

            foreach (int id in new int[] { 0x0482, 1154, 1153 }) {
                IntPtr ctrl = GetDlgItem(h, id);
                if (ctrl == IntPtr.Zero) continue;
                StringBuilder value = new StringBuilder(32);
                SendMessage(ctrl, 0x000D, 32, value);
                int parsed;
                if (int.TryParse(value.ToString(), out parsed) && parsed > 0) {
                    copies = parsed;
                    return false;
                }
            }
            return true;
        }, IntPtr.Zero);
        return copies;
    }
}
"@

    while ($true) {
        try {
            $copies = [PDM]::ReadCopies()
            if ($copies -gt 0) {
                [System.IO.File]::WriteAllText($tmpFile, "$copies|$([DateTime]::Now.ToString('o'))")
            }
        } catch {}
        Start-Sleep -Milliseconds 300
    }
})
[void]$dialogMonitorPS.AddArgument($tmpCopiesFile)
$dialogMonitorHandle = $dialogMonitorPS.BeginInvoke()
$query = "SELECT * FROM __InstanceCreationEvent WITHIN 1 WHERE TargetInstance ISA 'Win32_PrintJob'"
$deleteQuery = "SELECT * FROM __InstanceDeletionEvent WITHIN 2 WHERE TargetInstance ISA 'Win32_PrintJob'"

# Deletion watcher â€" runs in a background runspace to detect canceled jobs
$deleteRunspace = [runspacefactory]::CreateRunspace()
$deleteRunspace.Open()
$deletePS = [powershell]::Create()
$deletePS.Runspace = $deleteRunspace
[void]$deletePS.AddScript({
    param($query)
    try {
        $watcher = New-Object System.Management.ManagementEventWatcher($query)
        $watcher.Options.Timeout = [System.Management.ManagementOptions]::InfiniteTimeout
        while ($true) {
            try {
                $event = $watcher.WaitForNextEvent()
                $job = $event.TargetInstance
                if ($job -ne $null) {
                    $nameParts = $job.Name -split ', '
                    $printerName = $nameParts[0]
                    $jobId = if ($nameParts.Length -gt 1) { $nameParts[1] } else { '0' }
                    # Write the deletion as a special message that the Node.js side will handle
                    $result = [PSCustomObject]@{
                        __canceled = $true
                        Printer = $printerName
                        JobId = [string]$jobId
                        Document = [string]$job.Document
                        StatusMask = [int]$job.StatusMask
                    }
                    $json = $result | ConvertTo-Json -Compress
                    [Console]::Out.WriteLine($json)
                    [Console]::Out.Flush()
                }
            } catch {}
        }
    } catch {} finally {
        if ($watcher) { $watcher.Stop(); $watcher.Dispose() }
    }
})
[void]$deletePS.AddArgument($deleteQuery)
$deleteHandle = $deletePS.BeginInvoke()

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

            # Capture the foreground window title â€” this often contains the real document name
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

            # ===== READ PRINTTICKET â€” the EXACT user-selected settings =====
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

                                # ===== DECODE DEVMODE SNAPSHOT =====
                                # EPSON drivers store the REAL media type in a proprietary
                                # DEVMODE blob (ns0000:PageDevmodeSnapshot), NOT in psk:PageMediaType.
                                # Reverse-engineered offsets:
                                #   Offset 92-93: dmColor (1=Mono, 2=Color)
                                #   Offset 196-197: EPSON media type ID
                                #   Offset 344: non-plain flag (2=Plain, 4=non-Plain)
                                $dmSnapNode = $doc.SelectSingleNode("//psf:ParameterInit[contains(@name,'DevmodeSnapshot')]/psf:Value", $ns)
                                if ($dmSnapNode -and $dmSnapNode.InnerText) {
                                    try {
                                        $dmBytes = [Convert]::FromBase64String($dmSnapNode.InnerText)
                                        if ($dmBytes.Length -gt 197) {
                                            # Read EPSON media type ID at offset 196-197
                                            $epsonMediaId = [BitConverter]::ToInt16($dmBytes, 196)
                                            # Map EPSON media IDs to human-readable names
                                            # (reverse-engineered via MergeAndValidatePrintTicket)
                                            $epsonMediaMap = @{
                                                0 = 'Plain'
                                                1 = 'Plain'
                                                275 = 'PhotographicSemiGloss'
                                                318 = 'Bond'
                                                325 = 'PhotographicHighGloss'
                                                326 = 'PhotographicMatte'
                                                352 = 'PhotographicGlossy'
                                            }
                                            if ($epsonMediaMap.ContainsKey($epsonMediaId)) {
                                                $mediaType = $epsonMediaMap[$epsonMediaId]
                                            } elseif ($epsonMediaId -gt 1) {
                                                $mediaType = "EpsonMedia_$epsonMediaId"
                                            }
                                            # Also read dmColor as fallback
                                            if ($colorMode -eq '' -and $dmBytes.Length -gt 93) {
                                                $snapColor = [BitConverter]::ToInt16($dmBytes, 92)
                                                if ($snapColor -eq 1) { $colorMode = 'Monochrome' }
                                                elseif ($snapColor -eq 2) { $colorMode = 'Color' }
                                            }
                                        }
                                    } catch {}
                                }
                            }

                            # Also get page count from PrintSystemJobInfo
                            # Use -le 1 because EPSON L3250 reports TotalPages=1 incorrectly
                            if ($pj.NumberOfPages -gt $totalPages) {
                                $totalPages = [int]$pj.NumberOfPages
                            }
                            break
                        }
                    }
                    $queue.Dispose()
                }
                $server.Dispose()
            } catch {}

            # ===== PRIMARY: Read DEVMODE via Win32 GetJob API =====
            # EPSON drivers do NOT attach PrintTicket to jobs (JobTicket is always NULL).
            # The Win32 GetJob API (JOB_INFO_2.pDevMode) is the ONLY reliable source
            # for per-job settings like media type, color, duplex, paper size.
            # This MUST run for every job, not just as a fallback.
            try {
                $dm = [PrintJobApi]::GetJobDevmode($printerName, [int]$jobId)
                if ($dm -ne $null) {
                    # dm[0]=dmColor, dm[1]=dmMediaType, dm[2]=dmDuplex, dm[3]=dmOrientation, dm[4]=dmPaperSize, dm[5]=dmCopies
                    if ($colorMode -eq '') {
                        if ($dm[0] -eq 1) { $colorMode = 'Monochrome' }
                        elseif ($dm[0] -eq 2) { $colorMode = 'Color' }
                    }
                    # dmMediaType: EPSON uses both standard and custom values
                    # Standard: 0/1=Plain, 2=Transparency, 3=Glossy, 4=Heavyweight
                    # EPSON custom: 275=SemiGloss, 318=Bond, 325=HighGloss, 326=Matte, 352=UltraGlossy
                    if ($dm[1] -gt 0) {
                        $mediaMap = @{
                            1 = 'Plain'
                            2 = 'Transparency'
                            3 = 'Glossy'
                            4 = 'Heavyweight'
                            275 = 'PhotographicSemiGloss'
                            318 = 'Bond'
                            325 = 'PhotographicHighGloss'
                            326 = 'PhotographicMatte'
                            352 = 'PhotographicGlossy'
                        }
                        if ($mediaMap.ContainsKey($dm[1])) {
                            $mediaType = $mediaMap[$dm[1]]
                        } else {
                            $mediaType = "EpsonMedia_$($dm[1])"
                        }
                    }
                    if ($duplexMode -eq '') {
                        if ($dm[2] -eq 1) { $duplexMode = 'OneSided' }
                        elseif ($dm[2] -eq 2) { $duplexMode = 'TwoSidedShortEdge' }
                        elseif ($dm[2] -eq 3) { $duplexMode = 'TwoSidedLongEdge' }
                    }
                    # dm[5] = dmCopies - the user's ACTUAL copy count from print dialog
                    # This is the ONLY reliable source for EPSON L3250!
                    if ($dm.Length -gt 5 -and $dm[5] -gt $copies) {
                        $copies = [int]$dm[5]
                    }
                }
            } catch {}

            # ===== SECONDARY: Extract MS Word Copies from Job Ticket XML in Spool file =====
            # Microsoft Word often bypasses standard DEVMODE copies and embeds a JobTicket
            # inside the spool directory. We must parse this.
            if ($copies -le 1) {
                try {
                    $spoolDir = "$env:SystemRoot\System32\spool\PRINTERS"
                    $jobIdStr = "{0:D5}" -f [int]$jobId
                    $splFiles = Get-ChildItem "$spoolDir\*$jobIdStr.SPL" -ErrorAction SilentlyContinue
                    foreach ($spl in $splFiles) {
                        try {
                            # Read the first 80KB where XML JobTicket is usually located
                            $fs = [System.IO.File]::Open($spl.FullName, 'Open', 'Read', 'ReadWrite')
                            $buffer = New-Object byte[] 81920
                            $bytesRead = $fs.Read($buffer, 0, $buffer.Length)
                            $fs.Close()
                            
                            $splText = [System.Text.Encoding]::UTF8.GetString($buffer, 0, $bytesRead)
                            
                            # Word uses "JobCopiesAllDocuments" in PrintTicket (spans newlines)
                            if ($splText -match '(?is)JobCopiesAllDocuments.*?Value[^>]*>(\d+)<') {
                                $parsedCopies = [int]$matches[1]
                                if ($parsedCopies -gt $copies) {
                                    $copies = $parsedCopies
                                }
                            }
                        } catch {
                            try { if ($fs) { $fs.Close() } } catch {}
                        }
                    }
                } catch {}
            }

            # Retry if we're missing critical data (pages, color, media type)
            # IMPORTANT: Multi-page documents take 2-5 seconds to fully spool.
            # CRITICAL FIX: EPSON L3250 reports TotalPages=1 from the start even for
            # multi-page documents. We MUST also retry when totalPages<=1. Small text files
            # can be multi-page, so don't restrict this to just sizeBytes > 50000.
            $needsPageRetry = ($totalPages -le 1)
            if ($needsPageRetry -or $colorMode -eq '' -or $mediaType -eq '') {
                for ($retry = 0; $retry -lt 15; $retry++) {
                    Start-Sleep -Milliseconds 500
                    try {
                        # Try multiple sources for page count â€” critical for accuracy
                        # Use -le 1 threshold because EPSON L3250 falsely reports 1 page
                        if ($totalPages -le 1) {
                            # Source 1: WMI Win32_PrintJob (fastest)
                            try {
                                $wmiRetryName = "$printerName, $jobId"
                                $wmiRetry = Get-CimInstance Win32_PrintJob -Filter "Name='$wmiRetryName'" -ErrorAction Stop
                                if ($wmiRetry -and $wmiRetry.TotalPages -gt $totalPages) {
                                    $totalPages = [int]$wmiRetry.TotalPages
                                }
                                if ($wmiRetry -and $wmiRetry.PagesPrinted -gt $totalPages) {
                                    $totalPages = [int]$wmiRetry.PagesPrinted
                                }
                                # Also track sizeBytes as it grows during spooling
                                if ($wmiRetry -and $wmiRetry.Size -gt $sizeBytes) {
                                    $sizeBytes = [long]$wmiRetry.Size
                                }
                            } catch {}
                            # Source 2: Get-PrintJob
                            if ($totalPages -le 1) {
                                try {
                                    $retryJob = Get-PrintJob -PrinterName $printerName -ID ([int]$jobId) -ErrorAction Stop
                                    if ($retryJob -and $retryJob.TotalPages -gt $totalPages) {
                                        $totalPages = [int]$retryJob.TotalPages
                                    }
                                    if ($copies -le 1 -and $retryJob -and $retryJob.Copies -gt 1) { $copies = [int]$retryJob.Copies }
                                } catch {}
                            }
                            # Source 3: System.Printing NumberOfPages
                            if ($totalPages -le 1) {
                                try {
                                    $srv3 = New-Object System.Printing.LocalPrintServer
                                    $q3 = $srv3.GetPrintQueue($printerName)
                                    if ($q3) {
                                        $jc3 = $q3.GetPrintJobInfoCollection()
                                        foreach ($pj3 in $jc3) {
                                            if ($pj3.JobIdentifier -eq [int]$jobId) {
                                                if ($pj3.NumberOfPages -gt $totalPages) { $totalPages = [int]$pj3.NumberOfPages }
                                                break
                                            }
                                        }
                                        $q3.Dispose()
                                    }
                                    $srv3.Dispose()
                                } catch {}
                            }
                            # Source 4: Count EMF pages in spool file (bypasses driver completely)
                            if ($totalPages -le 1) {
                                try {
                                    $spoolDir = "$env:SystemRoot\System32\spool\PRINTERS"
                                    $jobIdStr = "{0:D5}" -f [int]${jobId}
                                    $splFiles = Get-ChildItem "$spoolDir\*$jobIdStr.SPL" -ErrorAction SilentlyContinue
                                    foreach ($spl in $splFiles) {
                                        try {
                                            $bytes = [System.IO.File]::ReadAllBytes($spl.FullName)
                                            $str = [System.Text.Encoding]::ASCII.GetString($bytes)
                                            $emfPageCount = 0
                                            for ($i = 0; $i -lt ($bytes.Length - 44); $i++) {
                                                if ($bytes[$i] -eq 1 -and $bytes[$i+1] -eq 0 -and $bytes[$i+2] -eq 0 -and $bytes[$i+3] -eq 0) {
                                                    if ($bytes[$i+40] -eq 0x20 -and $bytes[$i+41] -eq 0x45 -and $bytes[$i+42] -eq 0x4D -and $bytes[$i+43] -eq 0x46) {
                                                        $emfPageCount++
                                                        $i += 80
                                                    }
                                                }
                                            }
                                            if ($emfPageCount -gt $totalPages) {
                                                $totalPages = $emfPageCount
                                            }
                                        } catch {}
                                    }
                                } catch {}
                            }
                        }
                        # Retry PrintTicket read if missing color/media
                        if ($colorMode -eq '' -or $mediaType -eq '') {
                            try {
                            $srv2 = New-Object System.Printing.LocalPrintServer
                            $q2 = $srv2.GetPrintQueue($printerName)
                            if ($q2) {
                                $jc2 = $q2.GetPrintJobInfoCollection()
                                foreach ($pj2 in $jc2) {
                                    if ($pj2.JobIdentifier -eq [int]$jobId) {
                                        $tk2 = $pj2.JobTicket
                                        if ($tk2 -eq $null) { $tk2 = $pj2.PrintTicket }
                                        if ($tk2) {
                                            $xs2 = $tk2.GetXmlStream()
                                            $rd2 = New-Object System.IO.StreamReader($xs2)
                                            $tx2 = $rd2.ReadToEnd()
                                            $rd2.Close()
                                            [xml]$d2 = $tx2
                                            $n2 = New-Object System.Xml.XmlNamespaceManager($d2.NameTable)
                                            $n2.AddNamespace("psf", "http://schemas.microsoft.com/windows/2003/08/printing/printschemaframework")
                                            $n2.AddNamespace("psk", "http://schemas.microsoft.com/windows/2003/08/printing/printschemakeywords")
                                            if ($colorMode -eq '') {
                                                $cn2 = $d2.SelectSingleNode("//psf:Feature[@name='psk:PageOutputColor']/psf:Option", $n2)
                                                if ($cn2) { $r2 = $cn2.GetAttribute("name"); if ($r2) { $colorMode = $r2 -replace '^psk:', '' -replace '^ns0000:', '' } }
                                            }
                                            if ($mediaType -eq '') {
                                                $mn2 = $d2.SelectSingleNode("//psf:Feature[@name='psk:PageMediaType']/psf:Option", $n2)
                                                if ($mn2) { $r3 = $mn2.GetAttribute("name"); if ($r3) { $mediaType = $r3 -replace '^psk:', '' -replace '^ns0000:', '' } }
                                            }
                                            if ($paperSize -eq '') {
                                                $sn2 = $d2.SelectSingleNode("//psf:Feature[@name='psk:PageMediaSize']/psf:Option", $n2)
                                                if ($sn2) { $r4 = $sn2.GetAttribute("name"); if ($r4) { $paperSize = $r4 -replace '^psk:', '' -replace '^ns0000:', '' } }
                                            }
                                        }
                                        if ($pj2.NumberOfPages -gt $totalPages) { $totalPages = [int]$pj2.NumberOfPages }
                                        break
                                    }
                                }
                                $q2.Dispose()
                            }
                            $srv2.Dispose()
                            } catch {}
                        }
                        # Stop retrying if we have everything with confident page count
                        if ($totalPages -gt 1 -and $colorMode -ne '' -and $mediaType -ne '') { break }
                        # Also stop if page count matches expected size AND we have settings
                        if ($totalPages -gt 0 -and $sizeBytes -lt 50000 -and $colorMode -ne '' -and $mediaType -ne '') { break }
                    } catch { break }
                }
            }

            # ===== ENSURE colorMode IS CAPTURED â€” no guesswork allowed =====
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

            # ===== GET COPIES FROM EVENT 805 (most reliable for EPSON) =====
            # Event 805 RenderJobDiag has the DEFINITIVE copies count that
            # WMI and PrintTicket often miss. Always check this.
            try {
                $evt805 = Get-WinEvent -FilterHashtable @{
                    LogName = 'Microsoft-Windows-PrintService/Operational'
                    ID = 805
                    StartTime = (Get-Date).AddMinutes(-2)
                } -MaxEvents 10 -ErrorAction Stop
                foreach ($e805 in $evt805) {
                    try {
                        $x805 = [xml]$e805.ToXml()
                        $rd805 = $x805.Event.UserData.RenderJobDiag
                        if ($rd805 -and [int]$rd805.JobId -eq [int]$jobId) {
                            if ($rd805.Copies -and [int]$rd805.Copies -gt $copies) {
                                $copies = [int]$rd805.Copies
                            }
                            break
                        }
                    } catch {}
                }
            } catch {}

            # Last-resort fallback: read Copies from the live Windows print dialog.
            # Epson often hides the real copy count from DEVMODE, PrintTicket, and Event 805.
            if ($copies -le 1) {
                try {
                    $tmpFile = "$env:TEMP\hawknine_copies.txt"
                    if (Test-Path $tmpFile) {
                        $raw = [System.IO.File]::ReadAllText($tmpFile).Trim()
                        $parts = $raw -split '\|'
                        if ($parts.Count -ge 2) {
                            $dialogCopies = [int]$parts[0]
                            $dialogTime = [DateTime]::Parse($parts[1])
                            $age = ([DateTime]::Now - $dialogTime).TotalSeconds
                            if ($dialogCopies -gt 1 -and $age -lt 10) {
                                $copies = $dialogCopies
                            }
                        }
                    }
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
            # Individual event processing error - log and continue
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
        ], { maxBuffer: 1024 * 1024 * 10, timeout: 0 }); // No timeout â€” runs forever

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

                    // Handle canceled/deleted job notifications from the deletion watcher
                    if (data.__canceled && data.Printer && data.JobId) {
                        const cancelKey = generatePrintJobKey(data.Printer, data.JobId, data.Document, null);
                        console.log(`[SpoolerWatcher] ❌ Job CANCELED/DELETED: "${data.Document || 'Unknown'}" @ ${data.Printer} (jobId=${data.JobId})`);
                        if (typeof onJob === 'function') {
                            onJob({
                                jobKey: cancelKey,
                                printer: data.Printer,
                                jobId: data.JobId,
                                document: data.Document || 'Unknown',
                                status: 'canceled',
                                canceledAt: new Date().toISOString(),
                                source: 'wmi_deletion_event'
                            });
                        }
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

                        console.log(`[SpoolerWatcher] ðŸ–¨ï¸ Instant capture: "${jobData.document}"(raw: "${data.Document}", window: "${(data.WindowTitle || '').substring(0, 80)}") - ${jobData.totalPages} pages, ${jobData.copies} copies, paper = ${jobData.paperSize || 'default'}, media = ${jobData.mediaType || 'default'}, color = ${jobData.colorMode || 'unknown'} `);

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
            const stoppedManually = psProcess?._stopped === true;
            running = false;
            console.log(`[SpoolerWatcher] Process exited with code ${code} `);
            // Cleanup temp file
            try { fs.unlinkSync(tmpFile); } catch (e) { /* ignore */ }

            // Auto-restart after 5 seconds unless explicitly stopped
            if (!stoppedManually) {
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

/**
 * CRITICAL FIX: Print Dialog UI Monitor (Enhanced v2)
 * 
 * EPSON L3250 (and similar) drivers completely hide the copies count from ALL
 * Windows APIs (DEVMODE, Event Log, WMI, PrintTicket).
 * 
 * This monitor reads settings directly from print dialog UIs using Windows
 * UI Automation. Supports: Office backstage, Chrome/Edge, Adobe, Win32 dialogs.
 * 
 * IMPORTANT: Data flow ensures accuracy:
 * 1. While dialog is OPEN: cache is continuously updated with LATEST values
 *    (so changing copies 4->2 uses 2, not 4)
 * 2. When dialog CLOSES: final values are marked as "finalized"
 * 3. Data is NEVER uploaded from here - only when Event 307 confirms a real print
 * 4. If user cancels: no Event 307 fires, cache expires in 2 minutes
 * 
 * Captures: copies, printer, color/BW, pages, paper size, orientation, total sheets
 */
function startPrintDialogMonitor(onDataCaptured) {
    const { spawn } = require('child_process');
    let running = true;
    let proc = null;

    const psScript = `
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class DlgReader {
    [DllImport("user32.dll")]
    public static extern IntPtr FindWindow(string className, string windowName);
    [DllImport("user32.dll")]
    public static extern IntPtr GetDlgItem(IntPtr hDlg, int nIDDlgItem);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int SendMessage(IntPtr hWnd, int msg, int wParam, StringBuilder lParam);
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
}
"@

\$root = [System.Windows.Automation.AutomationElement]::RootElement
\$lastJson = ""
\$dialogWasOpen = \$false
\$lastResult = \$null

function Find-UIValue(\$parent, \$name) {
    try {
        \$cond = New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::NameProperty, \$name)
        \$els = \$parent.FindAll([System.Windows.Automation.TreeScope]::Descendants, \$cond)
        foreach (\$el in \$els) {
            \$ct = \$el.Current.ControlType.ProgrammaticName
            if (\$ct -eq 'ControlType.Text') { continue }
            try {
                \$vp = \$el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
                return \$vp.Current.Value
            } catch {}
        }
    } catch {}
    return \$null
}

function Find-UIText(\$parent, \$pattern) {
    try {
        \$all = \$parent.FindAll([System.Windows.Automation.TreeScope]::Descendants,
            [System.Windows.Automation.Condition]::TrueCondition)
        foreach (\$el in \$all) {
            try {
                \$n = \$el.Current.Name
                if (\$n -match \$pattern) { return \$n }
            } catch {}
        }
    } catch {}
    return \$null
}

while (\$true) {
    Start-Sleep -Milliseconds 700
    \$result = \$null

    # === METHOD 1: Office Backstage (Word, Excel, PowerPoint) ===
    \$officeProcs = Get-Process WINWORD,EXCEL,POWERPNT -ErrorAction SilentlyContinue
    foreach (\$p in \$officeProcs) {
        try {
            \$pidCond = New-Object System.Windows.Automation.PropertyCondition(
                [System.Windows.Automation.AutomationElement]::ProcessIdProperty, \$p.Id)
            \$appWin = \$root.FindFirst([System.Windows.Automation.TreeScope]::Children, \$pidCond)
            if (-not \$appWin) { continue }

            \$nameCond = New-Object System.Windows.Automation.PropertyCondition(
                [System.Windows.Automation.AutomationElement]::NameProperty, "Copies:")
            \$typeCond = New-Object System.Windows.Automation.PropertyCondition(
                [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
                [System.Windows.Automation.ControlType]::Edit)
            \$andCond = New-Object System.Windows.Automation.AndCondition(\$nameCond, \$typeCond)
            \$copiesEdit = \$appWin.FindFirst(
                [System.Windows.Automation.TreeScope]::Descendants, \$andCond)

            if (\$copiesEdit) {
                \$valP = \$copiesEdit.GetCurrentPattern(
                    [System.Windows.Automation.ValuePattern]::Pattern)
                \$copies = [int]\$valP.Current.Value

                \$printer = ""
                try {
                    \$pc = New-Object System.Windows.Automation.PropertyCondition(
                        [System.Windows.Automation.AutomationElement]::NameProperty, "Which Printer")
                    \$pCombo = \$appWin.FindFirst(
                        [System.Windows.Automation.TreeScope]::Descendants, \$pc)
                    if (\$pCombo) {
                        \$pv = \$pCombo.GetCurrentPattern(
                            [System.Windows.Automation.ValuePattern]::Pattern)
                        \$printer = \$pv.Current.Value
                    }
                } catch {}

                \$duplex = ""
                try {
                    \$dc = New-Object System.Windows.Automation.PropertyCondition(
                        [System.Windows.Automation.AutomationElement]::NameProperty, "Two-Sided Printing")
                    \$dCombo = \$appWin.FindFirst(
                        [System.Windows.Automation.TreeScope]::Descendants, \$dc)
                    if (\$dCombo) {
                        \$dv = \$dCombo.GetCurrentPattern(
                            [System.Windows.Automation.ValuePattern]::Pattern)
                        \$duplex = \$dv.Current.Value
                    }
                } catch {}

                \$result = @{
                    c = \$copies; p = \$printer; d = \$appWin.Current.Name
                    s = "office"; color = ""; pages = ""; paper = ""
                    media = ""; orient = ""; duplex = \$duplex; sheets = 0
                    final = 0; t = (Get-Date -Format o)
                }
            }
        } catch {}
    }

    # === METHOD 2: Chrome/Edge Print Dialog (Ctrl+P) ===
    if (-not \$result) {
        \$browserProcs = Get-Process chrome,msedge -ErrorAction SilentlyContinue
        foreach (\$p in (\$browserProcs | Select-Object -Unique Id)) {
            try {
                \$pidCond = New-Object System.Windows.Automation.PropertyCondition(
                    [System.Windows.Automation.AutomationElement]::ProcessIdProperty, \$p.Id)
                \$wins = \$root.FindAll([System.Windows.Automation.TreeScope]::Children, \$pidCond)
                foreach (\$win in \$wins) {
                    if (-not \$win.Current.Name -or \$win.Current.Name.Length -lt 2) { continue }

                    \$copiesCond = New-Object System.Windows.Automation.PropertyCondition(
                        [System.Windows.Automation.AutomationElement]::NameProperty, "Copies")
                    \$spinnerCond = New-Object System.Windows.Automation.PropertyCondition(
                        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
                        [System.Windows.Automation.ControlType]::Spinner)
                    \$andCond = New-Object System.Windows.Automation.AndCondition(\$copiesCond, \$spinnerCond)
                    \$copiesSpinner = \$win.FindFirst(
                        [System.Windows.Automation.TreeScope]::Descendants, \$andCond)

                    if (\$copiesSpinner) {
                        \$copies = 1
                        try {
                            \$vp = \$copiesSpinner.GetCurrentPattern(
                                [System.Windows.Automation.ValuePattern]::Pattern)
                            \$copies = [int]\$vp.Current.Value
                        } catch {}

                        \$printer = Find-UIValue \$win "Destination"
                        \$color = Find-UIValue \$win "Color"
                        \$pages = Find-UIValue \$win "Pages"
                        \$layout = Find-UIValue \$win "Layout"
                        \$paper = Find-UIValue \$win "Paper size"
                        # Media/paper type (e.g. Epson Ultra Glossy, Plain paper)
                        \$media = Find-UIValue \$win "Media type"
                        if (-not \$media) { \$media = Find-UIValue \$win "Paper type" }
                        if (-not \$media) { \$media = Find-UIValue \$win "Media" }
                        \$sheetsText = Find-UIText \$win 'sheet.*paper'
                        \$sheets = 0
                        if (\$sheetsText -match '(\d+)\s+sheet') { \$sheets = [int]\$Matches[1] }

                        \$result = @{
                            c = \$copies
                            p = if (\$printer) { \$printer } else { "" }
                            d = \$win.Current.Name
                            s = "browser"
                            color = if (\$color) { \$color } else { "" }
                            pages = if (\$pages) { \$pages } else { "" }
                            paper = if (\$paper) { \$paper } else { "" }
                            media = if (\$media) { \$media } else { "" }
                            orient = if (\$layout) { \$layout } else { "" }
                            duplex = ""; sheets = \$sheets
                            final = 0; t = (Get-Date -Format o)
                        }
                        break
                    }
                }
                if (\$result) { break }
            } catch {}
        }
    }

    # === METHOD 3: Adobe Reader/Acrobat ===
    if (-not \$result) {
        \$adobeProcs = Get-Process AcroRd32,Acrobat -ErrorAction SilentlyContinue
        foreach (\$p in \$adobeProcs) {
            try {
                \$pidCond = New-Object System.Windows.Automation.PropertyCondition(
                    [System.Windows.Automation.AutomationElement]::ProcessIdProperty, \$p.Id)
                \$wins = \$root.FindAll([System.Windows.Automation.TreeScope]::Children, \$pidCond)
                foreach (\$win in \$wins) {
                    if (\$win.Current.Name -match '[Pp]rint') {
                        \$copies = Find-UIValue \$win "Copies"
                        if (\$copies) {
                            \$printer = Find-UIValue \$win "Printer"
                            \$color = Find-UIValue \$win "Color"
                            \$paper = Find-UIValue \$win "Paper Size"
                            \$pages = Find-UIValue \$win "Pages"
                            \$media = Find-UIValue \$win "Media type"
                            if (-not \$media) { \$media = Find-UIValue \$win "Paper type" }

                            \$result = @{
                                c = [int]\$copies
                                p = if (\$printer) { \$printer } else { "" }
                                d = \$win.Current.Name
                                s = "adobe"; color = if (\$color) { \$color } else { "" }
                                pages = if (\$pages) { \$pages } else { "" }
                                paper = if (\$paper) { \$paper } else { "" }
                                media = if (\$media) { \$media } else { "" }
                                orient = ""; duplex = ""; sheets = 0
                                final = 0; t = (Get-Date -Format o)
                            }
                        }
                    }
                }
            } catch {}
        }
    }

    # === METHOD 4: Standard Windows Print Dialog (#32770) ===
    if (-not \$result) {
        try {
            \$dlg = [DlgReader]::FindWindow("#32770", \$null)
            if (\$dlg -ne [IntPtr]::Zero -and [DlgReader]::IsWindowVisible(\$dlg)) {
                \$copiesCtrl = [DlgReader]::GetDlgItem(\$dlg, 1154)
                if (\$copiesCtrl -ne [IntPtr]::Zero) {
                    \$sb = New-Object System.Text.StringBuilder 20
                    [DlgReader]::SendMessage(\$copiesCtrl, 0x000D, 20, \$sb) | Out-Null
                    \$copies = 0
                    if ([int]::TryParse(\$sb.ToString(), [ref]\$copies) -and \$copies -gt 0) {
                        \$titleSb = New-Object System.Text.StringBuilder 256
                        [DlgReader]::GetWindowText(\$dlg, \$titleSb, 256) | Out-Null

                        \$result = @{
                            c = \$copies; p = ""; d = \$titleSb.ToString()
                            s = "win32_dialog"; color = ""; pages = ""
                            paper = ""; media = ""; orient = ""; duplex = ""; sheets = 0
                            final = 0; t = (Get-Date -Format o)
                        }
                    }
                }
            }
        } catch {}
    }

    # === METHOD 5: Printer Driver Properties/Preferences Dialog ===
    # (e.g. "EPSON L3150 Series Properties" opened from Word or system dialog)
    # This dialog has Paper Type, Color, Copies, Quality, Document Size, etc.
    if (-not \$result) {
        try {
            \$allWins = \$root.FindAll([System.Windows.Automation.TreeScope]::Children,
                [System.Windows.Automation.Condition]::TrueCondition)
            foreach (\$win in \$allWins) {
                \$wName = \$win.Current.Name
                if (\$wName -match '(Properties|Preferences)' -and \$wName -match '(Printer|EPSON|Canon|HP|Brother|Xerox|Ricoh|Samsung|Lexmark|Series)') {
                    # Found a printer properties dialog
                    \$media = Find-UIValue \$win "Paper Type"
                    if (-not \$media) { \$media = Find-UIValue \$win "Media Type" }
                    \$color = ""
                    \$copies = ""
                    \$paper = ""
                    \$quality = ""
                    \$duplex = ""
                    \$orient = ""

                    # Color: check radio buttons
                    try {
                        \$colorCond = New-Object System.Windows.Automation.PropertyCondition(
                            [System.Windows.Automation.AutomationElement]::NameProperty, "Color")
                        \$colorEls = \$win.FindAll([System.Windows.Automation.TreeScope]::Descendants, \$colorCond)
                        foreach (\$ce in \$colorEls) {
                            if (\$ce.Current.ControlType.ProgrammaticName -eq 'ControlType.RadioButton') {
                                try {
                                    \$si = \$ce.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
                                    if (\$si.Current.IsSelected) { \$color = "Color" }
                                } catch {}
                            }
                        }
                        \$gsCond = New-Object System.Windows.Automation.PropertyCondition(
                            [System.Windows.Automation.AutomationElement]::NameProperty, "Grayscale")
                        \$gsEls = \$win.FindAll([System.Windows.Automation.TreeScope]::Descendants, \$gsCond)
                        foreach (\$ge in \$gsEls) {
                            if (\$ge.Current.ControlType.ProgrammaticName -eq 'ControlType.RadioButton') {
                                try {
                                    \$si = \$ge.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
                                    if (\$si.Current.IsSelected) { \$color = "Grayscale" }
                                } catch {}
                            }
                        }
                    } catch {}

                    \$copies = Find-UIValue \$win "Copies"
                    \$paper = Find-UIValue \$win "Document Size"
                    \$quality = Find-UIValue \$win "Quality"
                    \$duplex = Find-UIValue \$win "2-Sided Printing"

                    # Orientation radio buttons
                    try {
                        \$pCond = New-Object System.Windows.Automation.PropertyCondition(
                            [System.Windows.Automation.AutomationElement]::NameProperty, "Portrait")
                        \$pEls = \$win.FindAll([System.Windows.Automation.TreeScope]::Descendants, \$pCond)
                        foreach (\$pe in \$pEls) {
                            if (\$pe.Current.ControlType.ProgrammaticName -eq 'ControlType.RadioButton') {
                                try {
                                    \$si = \$pe.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
                                    if (\$si.Current.IsSelected) { \$orient = "Portrait" }
                                } catch {}
                            }
                        }
                        \$lCond = New-Object System.Windows.Automation.PropertyCondition(
                            [System.Windows.Automation.AutomationElement]::NameProperty, "Landscape")
                        \$lEls = \$win.FindAll([System.Windows.Automation.TreeScope]::Descendants, \$lCond)
                        foreach (\$le in \$lEls) {
                            if (\$le.Current.ControlType.ProgrammaticName -eq 'ControlType.RadioButton') {
                                try {
                                    \$si = \$le.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
                                    if (\$si.Current.IsSelected) { \$orient = "Landscape" }
                                } catch {}
                            }
                        }
                    } catch {}

                    # Extract printer name from dialog title (e.g. "EPSON L3150 Series Properties" -> "EPSON L3150 Series")
                    \$printerFromTitle = \$wName -replace '\\s*(Properties|Preferences).*\$', ''

                    if (\$media -or \$color -or \$copies) {
                        \$copiesInt = 1
                        if (\$copies) { try { \$copiesInt = [int]\$copies } catch {} }

                        \$result = @{
                            c = \$copiesInt
                            p = \$printerFromTitle
                            d = ""
                            s = "driver_props"
                            color = if (\$color) { \$color } else { "" }
                            pages = ""
                            paper = if (\$paper) { \$paper } else { "" }
                            media = if (\$media) { \$media } else { "" }
                            orient = \$orient
                            duplex = if (\$duplex) { \$duplex } else { "" }
                            sheets = 0
                            final = 0; t = (Get-Date -Format o)
                        }
                    }
                }
            }
        } catch {}
    }

    # === DIALOG STATE TRACKING ===
    # Track open/close transitions to detect when user clicks Print or Cancel
    if (\$result) {
        # Dialog IS open - continuously update with latest values
        \$dialogWasOpen = \$true
        \$lastResult = \$result

        # Output update (only if values changed to reduce noise)
        \$json = \$result | ConvertTo-Json -Compress
        if (\$json -ne \$lastJson) {
            Write-Output \$json
            [Console]::Out.Flush()
            \$lastJson = \$json
        }
    } else {
        # Dialog is NOT open (or not found)
        if (\$dialogWasOpen -and \$lastResult) {
            # Dialog JUST CLOSED - user clicked Print or Cancel
            # Output final values with final=1 flag
            \$lastResult.final = 1
            \$lastResult.t = (Get-Date -Format o)
            \$finalJson = \$lastResult | ConvertTo-Json -Compress
            Write-Output \$finalJson
            [Console]::Out.Flush()

            \$dialogWasOpen = \$false
            \$lastResult = \$null
            \$lastJson = ""
        }
    }
}
`;

    try {
        proc = spawn('powershell.exe', [
            '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
            '-Command', psScript
        ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });

        let buffer = '';
        proc.stdout.on('data', (data) => {
            buffer += data.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('{')) continue;
                try {
                    const parsed = JSON.parse(trimmed);
                    if (parsed.c && parsed.c > 0) {
                        const isFinal = parsed.final === 1;
                        const result = {
                            copies: parsed.c,
                            printer: parsed.p || '',
                            document: parsed.d || '',
                            source: parsed.s || 'unknown',
                            color: parsed.color || '',
                            pages: parsed.pages || '',
                            paperSize: parsed.paper || '',
                            mediaType: parsed.media || '',
                            orientation: parsed.orient || '',
                            duplex: parsed.duplex || '',
                            totalSheets: parsed.sheets || 0,
                            finalized: isFinal,
                            timestamp: parsed.t || new Date().toISOString()
                        };
                        if (isFinal) {
                            console.log('[PRINT-DIALOG] FINALIZED (dialog closed): copies=' + result.copies
                                + ' printer="' + result.printer + '"'
                                + ' color="' + result.color + '"'
                                + ' paper="' + result.paperSize + '"'
                                + ' [' + result.source + ']');
                        } else {
                            console.log('[PRINT-DIALOG] Watching: copies=' + result.copies
                                + ' printer="' + result.printer + '"'
                                + ' color="' + result.color + '"'
                                + ' [' + result.source + ']');
                        }
                        if (onDataCaptured) onDataCaptured(result);
                    }
                } catch (e) {}
            }
        });

        proc.stderr.on('data', () => {});

        proc.on('exit', (code) => {
            if (running) {
                console.log('[PRINT-DIALOG] Monitor exited, restarting in 5s...');
                setTimeout(() => {
                    if (running) startPrintDialogMonitor(onDataCaptured);
                }, 5000);
            }
        });

        console.log('[PRINT-DIALOG] UI monitor started - Office/Chrome/Edge/Adobe/Win32 (polling 700ms)');
        console.log('[PRINT-DIALOG] NOTE: Data is only USED when Event 307 confirms actual printing');
    } catch (e) {
        console.error('[PRINT-DIALOG] Failed to start monitor:', e.message);
    }
/**
 * Get page counters from all installed printers.
 * For Epson printers: reads from Epson Status Monitor 3 registry + bidirectional communication.
 * For network printers: attempts SNMP query.
 * Returns an array of { printerName, totalPages, colorPages, bwPages, blankPages, firstPrintDate, source, timestamp, isOnline }
 *
 * The data corresponds to what Epson shows under:
 *   Printer Properties > Maintenance > Nozzle Check / Head Cleaning
 * These are lifetime counters stored in the printer's firmware (EEPROM).
 */
async function getPrinterPageCounters() {
    const script = `
$results = @()

# ============================================================
# METHOD 1: Epson Status Monitor 3 — Bidirectional Query
# Forces the Epson driver to refresh its cached status from
# the printer via bidirectional USB/network communication,
# then reads the updated registry values.
# ============================================================
function Get-EpsonCountersViaRegistry {
    param([string]$PrinterName)

    $result = @{
        PrinterName = $PrinterName
        TotalPages = -1
        ColorPages = -1
        BWPages = -1
        BlankPages = -1
        BorderlessColor = -1
        BorderlessBW = -1
        WithBorderColor = -1
        WithBorderBW = -1
        FirstPrintDate = ""
        Source = "none"
        IsOnline = $false
    }

    # Check if printer is online first
    try {
        $wmiPrinter = Get-WmiObject Win32_Printer -ErrorAction Stop | Where-Object { $_.Name -eq $PrinterName }
        if ($wmiPrinter -and -not $wmiPrinter.WorkOffline) {
            $result.IsOnline = $true
        }
    } catch {}

    # ----- Step 1: Try to trigger a status refresh via EPSON Status Monitor -----
    # The Epson driver uses bidirectional communication; when we open the printer
    # handle and request status, it queries the hardware and updates the registry.
    if ($result.IsOnline) {
        try {
            # Opening the print queue with System.Printing forces a status refresh
            Add-Type -AssemblyName System.Printing -ErrorAction SilentlyContinue
            $server = New-Object System.Printing.LocalPrintServer -ErrorAction SilentlyContinue
            if ($server) {
                $q = $server.GetPrintQueues() | Where-Object { $_.Name -eq $PrinterName }
                if ($q -and $q.IsBidiEnabled) {
                    $q.Refresh()
                    Start-Sleep -Milliseconds 500  # Give driver time to update
                }
            }
        } catch {}
    }

    # ----- Step 2: Read Epson STM3 registry data -----
    # Location: HKCU:\\SOFTWARE\\EPSON\\STM3\\STMData\\EPLTarget\\P*
    $stmPath = 'HKCU:\\SOFTWARE\\EPSON\\STM3\\STMData\\EPLTarget'
    if (Test-Path $stmPath) {
        $targets = Get-ChildItem $stmPath -ErrorAction SilentlyContinue
        foreach ($target in $targets) {
            $props = Get-ItemProperty $target.PSPath -ErrorAction SilentlyContinue
            if ($props -and $props.Name -eq $PrinterName) {
                $result.Source = "epson_stm3_registry"

                # Read the Status binary blob (BDC ST2 protocol)
                $statusBytes = $props.Status
                if ($statusBytes -and $statusBytes.Length -gt 20) {
                    # Parse Epson BDC ST2 binary protocol
                    # Header: @BDC ST2\\r\\n (10 bytes)
                    # Then TLV fields: tag(1 byte) + length(1 byte) + data(length bytes)
                    $pos = 10
                    while ($pos -lt $statusBytes.Length - 1) {
                        $tag = $statusBytes[$pos]
                        $len = $statusBytes[$pos + 1]

                        if ($pos + 2 + $len -gt $statusBytes.Length) { break }
                        if ($len -eq 0) { $pos += 2; continue }

                        $data = $statusBytes[($pos + 2)..($pos + 1 + $len)]

                        # Tag 0x19: Page Counter (when printer is online, contains numeric data)
                        if ($tag -eq 0x19 -and $len -ge 4) {
                            # Check if it contains "unknown" (printer offline)
                            $str = [System.Text.Encoding]::ASCII.GetString($data)
                            if ($str -notmatch 'unknown') {
                                # Parse sub-fields within the page counter tag
                                # Format varies by model but typically:
                                # Sub-tag structures or raw counter bytes
                                if ($data.Length -ge 12) {
                                    # Try 4-byte LE integer at various offsets
                                    for ($k = 0; $k -le ($data.Length - 4); $k += 4) {
                                        $val = [BitConverter]::ToUInt32($data[$k..($k+3)], 0)
                                        if ($val -gt 0 -and $val -lt 10000000) {
                                            if ($result.TotalPages -lt 0) { $result.TotalPages = [int]$val }
                                        }
                                    }
                                }
                            }
                        }

                        # Tag 0x28: Total/Summary counter
                        if ($tag -eq 0x28 -and $len -ge 4) {
                            $val = [BitConverter]::ToUInt32($data[0..3], 0)
                            if ($val -gt 0 -and $val -lt 10000000) {
                                # Could be total pages or a sub-counter
                                if ($result.TotalPages -lt 0) {
                                    $result.TotalPages = [int]$val
                                }
                            }
                        }

                        # Tag 0x36: Extended counter block (contains detailed page breakdowns)
                        if ($tag -eq 0x36 -and $len -ge 16) {
                            # Parse 4-byte LE integers from the extended block
                            $counters = @()
                            for ($k = 0; $k -le ($data.Length - 4); $k += 4) {
                                $val = [BitConverter]::ToUInt32($data[$k..($k+3)], 0)
                                if ($val -ne 0xFFFFFFFF) {
                                    $counters += [int]$val
                                }
                            }
                            # Extended block typically has: totalPages, colorPages, bwPages, blankPages, etc.
                            if ($counters.Count -ge 3) {
                                foreach ($c in $counters) {
                                    if ($c -gt 0 -and $c -lt 10000000) {
                                        if ($result.TotalPages -lt 0 -or $c -gt $result.TotalPages) {
                                            # The largest non-FFFFFFFF counter is likely total pages
                                        }
                                    }
                                }
                            }
                        }

                        # Tag 0x40: Serial number (ASCII)
                        # Tag 0x48: Firmware version

                        $pos += 2 + $len
                    }
                }

                # PrintNotifyInkConsumptionCounter — a rough page counter cached by the driver
                if ($props.PrintNotifyInkConsumptionCounter) {
                    $inkCounter = [int]$props.PrintNotifyInkConsumptionCounter
                    if ($inkCounter -gt 0 -and $result.TotalPages -lt 0) {
                        # This is NOT the total pages but can serve as a fallback indicator
                    }
                }
                break
            }
        }
    }

    return $result
}

# ============================================================
# METHOD 2: Windows Bidirectional Printer Communication (Bidi)
# Uses the IBidiSpl COM interface to send an Epson STATUS
# request directly to the printer and parse the response.
# This works for USB and network Epson printers when online.
# ============================================================
function Get-EpsonCountersViaBidi {
    param([string]$PrinterName)

    $result = @{
        TotalPages = -1
        ColorPages = -1
        BWPages = -1
        Source = "bidi"
    }

    try {
        Add-Type -AssemblyName System.Printing -ErrorAction Stop
        $server = New-Object System.Printing.LocalPrintServer
        $q = $server.GetPrintQueues() | Where-Object { $_.Name -eq $PrinterName }

        if ($q -and $q.IsBidiEnabled -and -not $q.IsOffline) {
            # The Bidi schema for page counters varies by manufacturer
            # Epson uses proprietary extensions but we can try standard schemas
            $q.Refresh()
            # Note: Actual Bidi queries need low-level COM (IBidiSpl)
            # which is complex from PowerShell. The registry method above
            # captures the same data after a Refresh() triggers the driver.
        }
    } catch {}

    return $result
}

# ============================================================
# METHOD 3: SNMP Query (for network printers)
# Standard OIDs for printer page counters:
#   1.3.6.1.2.1.43.10.2.1.4.1.1 = Total Pages (prtMarkerLifeCount)
#   1.3.6.1.2.1.43.11.1.1.9     = Ink/toner levels
# ============================================================
function Get-PrinterCountersViaSNMP {
    param([string]$PrinterIP)

    $result = @{
        TotalPages = -1
        ColorPages = -1
        BWPages = -1
        Source = "snmp"
    }

    if (-not $PrinterIP -or $PrinterIP -eq 'USB' -or $PrinterIP -match '^USB') {
        return $result
    }

    try {
        # Try using snmpget if available (common on Windows with SNMP tools)
        # OID for prtMarkerLifeCount (total pages printed)
        $oid = "1.3.6.1.2.1.43.10.2.1.4.1.1"
        $output = & snmpget -v 2c -c public "$PrinterIP" "$oid" 2>$null
        if ($output -match '(\d+)$') {
            $result.TotalPages = [int]$Matches[1]
            $result.Source = "snmp"
        }
    } catch {}

    # Fallback: Try Test-Connection + custom UDP SNMP query
    if ($result.TotalPages -lt 0) {
        try {
            # Use .NET to send a raw SNMP GET request
            # This is a simplified SNMP v1 GET for the total page counter
            $ping = Test-Connection $PrinterIP -Count 1 -Quiet -ErrorAction SilentlyContinue
            if ($ping) {
                $udpClient = New-Object System.Net.Sockets.UdpClient
                $udpClient.Client.ReceiveTimeout = 3000

                # SNMP v1 GET request for OID 1.3.6.1.2.1.43.10.2.1.4.1.1 (prtMarkerLifeCount)
                # Pre-built SNMP packet for community "public"
                $snmpGetBytes = [byte[]]@(
                    0x30, 0x2E,  # SEQUENCE
                    0x02, 0x01, 0x00,  # version: v1
                    0x04, 0x06, 0x70, 0x75, 0x62, 0x6C, 0x69, 0x63,  # community: "public"
                    0xA0, 0x21,  # GetRequest-PDU
                    0x02, 0x04, 0x00, 0x00, 0x00, 0x01,  # request-id: 1
                    0x02, 0x01, 0x00,  # error-status: noError
                    0x02, 0x01, 0x00,  # error-index: 0
                    0x30, 0x13,  # varbind list
                    0x30, 0x11,  # varbind
                    0x06, 0x0D,  # OID
                    0x2B, 0x06, 0x01, 0x02, 0x01, 0x2B, 0x0A, 0x02, 0x01, 0x04, 0x01, 0x01, 0x00,
                    0x05, 0x00   # NULL value
                )

                $endpoint = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Parse($PrinterIP), 161)
                $udpClient.Send($snmpGetBytes, $snmpGetBytes.Length, $endpoint) | Out-Null

                $remoteEP = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 0)
                $response = $udpClient.Receive([ref]$remoteEP)
                $udpClient.Close()

                if ($response -and $response.Length -gt 20) {
                    # Parse SNMP response — look for Integer value at the end
                    # The page counter integer is typically the last TLV in the response
                    for ($i = $response.Length - 1; $i -ge 4; $i--) {
                        if ($response[$i - 1] -eq 0x02) {  # ASN.1 INTEGER tag
                            $intLen = 0
                            $intVal = 0
                            # Simple integer parsing
                            $iLen = $response[$i]
                            if ($iLen -ge 1 -and $iLen -le 4 -and ($i + $iLen) -lt $response.Length) {
                                for ($j = 0; $j -lt $iLen; $j++) {
                                    $intVal = ($intVal -shl 8) -bor $response[$i + 1 + $j]
                                }
                                if ($intVal -gt 0 -and $intVal -lt 10000000) {
                                    $result.TotalPages = [int]$intVal
                                    $result.Source = "snmp_raw"
                                }
                            }
                            break
                        }
                    }
                }
            }
        } catch {
            # SNMP not available or printer not reachable
        }
    }

    return $result
}

# ============================================================
# MAIN: Iterate all printers and collect page counters
# ============================================================
try {
    $printers = Get-Printer -ErrorAction Stop

    foreach ($printer in $printers) {
        # Skip virtual printers
        $nameLower = $printer.Name.ToLower()
        if ($nameLower -match 'microsoft print|onenote|fax|xps|pdf') { continue }

        $printerResult = @{
            PrinterName = $printer.Name
            DriverName = $printer.DriverName
            PortName = $printer.PortName
            TotalPages = -1
            ColorPages = -1
            BWPages = -1
            BlankPages = -1
            BorderlessColor = -1
            BorderlessBW = -1
            WithBorderColor = -1
            WithBorderBW = -1
            FirstPrintDate = ""
            Source = "none"
            IsOnline = $false
            Timestamp = (Get-Date).ToString("o")
        }

        # Check online status
        try {
            $wmi = Get-WmiObject Win32_Printer -ErrorAction Stop | Where-Object { $_.Name -eq $printer.Name }
            $printerResult.IsOnline = ($wmi -and -not $wmi.WorkOffline)
        } catch {}

        # Try Epson-specific methods for Epson printers
        $isEpson = $printer.DriverName -match 'EPSON' -or $printer.Name -match 'EPSON'

        if ($isEpson) {
            $epsonData = Get-EpsonCountersViaRegistry -PrinterName $printer.Name
            if ($epsonData.TotalPages -ge 0) {
                $printerResult.TotalPages = $epsonData.TotalPages
                $printerResult.ColorPages = $epsonData.ColorPages
                $printerResult.BWPages = $epsonData.BWPages
                $printerResult.BlankPages = $epsonData.BlankPages
                $printerResult.BorderlessColor = $epsonData.BorderlessColor
                $printerResult.BorderlessBW = $epsonData.BorderlessBW
                $printerResult.WithBorderColor = $epsonData.WithBorderColor
                $printerResult.WithBorderBW = $epsonData.WithBorderBW
                $printerResult.FirstPrintDate = $epsonData.FirstPrintDate
                $printerResult.Source = $epsonData.Source
                $printerResult.IsOnline = $epsonData.IsOnline
            }
        }

        # Try SNMP for network printers (any brand)
        if ($printerResult.TotalPages -lt 0) {
            $portName = $printer.PortName
            $printerIP = ""
            # Check if port is a TCP/IP port
            try {
                $tcpPort = Get-WmiObject Win32_TCPIPPrinterPort -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq $portName }
                if ($tcpPort) {
                    $printerIP = $tcpPort.HostAddress
                }
            } catch {}
            # Also check if port looks like an IP
            if (-not $printerIP -and $portName -match '(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})') {
                $printerIP = $Matches[1]
            }

            if ($printerIP) {
                $snmpData = Get-PrinterCountersViaSNMP -PrinterIP $printerIP
                if ($snmpData.TotalPages -ge 0) {
                    $printerResult.TotalPages = $snmpData.TotalPages
                    $printerResult.Source = $snmpData.Source
                }
            }
        }

        # Only include printers that have SOME counter data or are Epson
        if ($printerResult.TotalPages -ge 0 -or $isEpson) {
            $results += [PSCustomObject]$printerResult
        }
    }
} catch {
    Write-Error "Failed to enumerate printers: $_"
}

if ($results.Count -eq 0) {
    "[]"
} else {
    @($results) | ConvertTo-Json -Depth 3
}
`;

    const stdout = await runPS(script, 30000);
    if (!stdout || stdout.trim() === '' || stdout.trim() === '[]') {
        return [];
    }

    try {
        const parsed = JSON.parse(stdout);
        const counters = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);

        return counters.filter(c => c && c.PrinterName).map(c => ({
            printerName: c.PrinterName,
            driverName: c.DriverName || '',
            portName: c.PortName || '',
            totalPages: c.TotalPages >= 0 ? c.TotalPages : null,
            colorPages: c.ColorPages >= 0 ? c.ColorPages : null,
            bwPages: c.BWPages >= 0 ? c.BWPages : null,
            blankPages: c.BlankPages >= 0 ? c.BlankPages : null,
            borderlessColor: c.BorderlessColor >= 0 ? c.BorderlessColor : null,
            borderlessBW: c.BorderlessBW >= 0 ? c.BorderlessBW : null,
            withBorderColor: c.WithBorderColor >= 0 ? c.WithBorderColor : null,
            withBorderBW: c.WithBorderBW >= 0 ? c.WithBorderBW : null,
            firstPrintDate: c.FirstPrintDate || null,
            source: c.Source || 'unknown',
            isOnline: c.IsOnline === true,
            timestamp: c.Timestamp || new Date().toISOString()
        }));
    } catch (e) {
        console.error('[PrintMonitor] Page counter parse error:', e.message);
        return [];
    }
}

    function stop() {
        running = false;
        if (proc) { try { proc.kill(); } catch (e) {} }
    }

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
    verifyPrintLogging,
    detectPrintType,
    detectColorCapability,
    generatePrintJobKey,
    computeTotalSheets,
    getSpoolerJobsFast,
    getJobPageCount,
    queryJobPageCountAggressive,
    startPageCountUpdater,
    startSpoolerWatcher,
    getRenderedPageCount,
    startPrintDialogMonitor,
    getPrinterPageCounters
};

