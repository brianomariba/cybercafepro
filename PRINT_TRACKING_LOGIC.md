# HawkNine Print Tracking Logic

This document details how HawkNine intercepts, tracks, and processes PC print jobs initiated from the cybercafe computers. The print monitoring system is designed to be highly aggressive and accurate, capturing real document names and exact printer settings (Color/B&W, Copies, Duplex) before the printer driver obscures them.

## 1. Multi-Layered Print Interception

Because Windows print drivers (like EPSON or HP) often mangle or hide print settings before they hit the spooler, the **HawkNine Desktop Agent** uses a multi-layered approach to guarantee accurate capture.

### Layer A: Real-Time Spooler Watcher (WMI & DEVMODE)
The primary method of tracking is an active WMI (Windows Management Instrumentation) event subscription watching the `Win32_PrintJob` class. 
When a job hits the spooler, the agent uses low-level Win32 APIs (`winspool.drv`) to parse the binary **DEVMODE** data structure of the job in memory. This allows HawkNine to extract the *exact* settings the user picked:
*   `dmCopies` (Number of copies)
*   `dmColor` (Color vs Monochrome)
*   `dmDuplex` (Double-sided printing)
*   `dmPaperSize` (Paper dimensions)

### Layer B: PrintTicket XML Extraction
As a secondary validation, the agent loads the .NET `System.Printing` assembly to extract the `PrintTicket` associated with the job. This XML document contains the raw preferences selected by the user in the print dialog.

### Layer C: Event Log Fallback
If the real-time watcher misses a job (e.g., if the agent was restarting), the system queries the Windows Event Log (`Microsoft-Windows-PrintService/Operational`, Event ID 307). This guarantees that historical jobs are always recovered.

## 2. Document Name Recovery

Many applications (like Chrome or PDF viewers) send jobs to the spooler with generic names like "Print Document" or "Local Downlevel Document". 
To provide useful billing data, the agent includes a Win32 API call to `GetForegroundWindow()` and `GetWindowText()` at the exact moment the print job is submitted. It parses the window title (e.g., `report.pdf - Google Chrome`) to extract the real document name.

## 3. Deduplication & Unique Keying

Because the agent reads from multiple sources (Spooler, PrintTicket, Event Log), it needs a bulletproof way to prevent duplicate billing.
Windows recycles print job IDs sequentially. An ID of "2" could happen today and next week. HawkNine generates a composite unique key for every job:
`PrinterName - JobId - DateBucket (YYYYMMDD)`

This ensures that the same physical job is only processed and billed once, regardless of how many monitoring layers detected it.

## 4. Physical Sheet Calculation

The number of pages in a digital document is not always equal to the physical paper consumed. HawkNine calculates the actual sheets used via `computeTotalSheets()`:

```javascript
Total Sheets = (Document Pages * Number of Copies) / (Is Duplex ? 2 : 1)
```

By accurately knowing the physical sheets and whether color ink was used (via the DEVMODE intercept), HawkNine correctly applies the cybercafe's pricing to generate the final bill on the dashboard.
