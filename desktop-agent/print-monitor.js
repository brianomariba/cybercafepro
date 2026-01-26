const { exec } = require('child_process');

// Track processed jobs to avoid duplicates
let processedJobIds = new Set();

/**
 * Fetches detailed print jobs from the local Windows Spooler
 * Includes color detection and page counts
 */
function getRecentPrintJobs() {
    return new Promise((resolve) => {
        // Enhanced PowerShell command to get more print job details
        const psCommand = `
            Get-Printer | ForEach-Object {
                $printer = $_
                Get-PrintJob -PrinterName $_.Name -ErrorAction SilentlyContinue | ForEach-Object {
                    [PSCustomObject]@{
                        Id = $_.Id
                        PrinterName = $printer.Name
                        PrinterType = $printer.Type
                        PortName = $printer.PortName
                        DocumentName = $_.DocumentName
                        JobStatus = $_.JobStatus
                        TotalPages = $_.TotalPages
                        PagesPrinted = $_.PagesPrinted
                        Size = $_.Size
                        SubmittedTime = $_.SubmittedTime
                        UserName = $_.UserName
                        Priority = $_.Priority
                    }
                }
            } | ConvertTo-Json -Depth 3
        `;

        exec(`powershell -Command "${psCommand.replace(/\n/g, ' ')}"`, (error, stdout, stderr) => {
            if (error || !stdout || stdout.trim() === '') {
                resolve([]);
                return;
            }

            try {
                const parsed = JSON.parse(stdout);
                const jobs = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);

                const normalizedJobs = jobs.filter(job => job && job.Id).map(job => {
                    // Detect if color based on printer name or document name heuristics
                    const printerNameLower = (job.PrinterName || '').toLowerCase();
                    const docNameLower = (job.DocumentName || '').toLowerCase();

                    let printType = 'bw'; // Default to B&W
                    if (printerNameLower.includes('color') ||
                        printerNameLower.includes('colour') ||
                        docNameLower.includes('color') ||
                        docNameLower.includes('photo')) {
                        printType = 'color';
                    }

                    // Calculate size in KB
                    const sizeKB = job.Size ? Math.round(job.Size / 1024) : 0;

                    return {
                        id: job.Id,
                        jobId: `${job.PrinterName}-${job.Id}`,
                        printer: job.PrinterName || 'Unknown',
                        printerType: job.PrinterType || 'Local',
                        document: job.DocumentName || 'Untitled',
                        status: job.JobStatus || 'Spooling',
                        totalPages: job.TotalPages || 1,
                        pagesPrinted: job.PagesPrinted || 0,
                        printType: printType, // 'bw' or 'color'
                        sizeKB: sizeKB,
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
            Get-Printer | Select-Object Name, Type, DriverName, PortName, Shared, Published, DeviceType |
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

                resolve(printers.map(p => ({
                    name: p.Name,
                    type: p.Type,
                    driver: p.DriverName,
                    port: p.PortName,
                    shared: p.Shared,
                    isColor: (p.DriverName || '').toLowerCase().includes('color') ||
                        (p.Name || '').toLowerCase().includes('color')
                })));
            } catch (e) {
                resolve([]);
            }
        });
    });
}

module.exports = {
    getRecentPrintJobs,
    getPrintHistory,
    getInstalledPrinters
};
