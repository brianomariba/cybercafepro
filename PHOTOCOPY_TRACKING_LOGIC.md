# HawkNine Photocopy Tracking Logic

This document explains the internal mechanics of how HawkNine tracks and calculates photocopy data without requiring manual entry or API integration directly into the printer's firmware.

## 1. The Core Formula

A standard USB/Network printer does not distinguish between a "print job" sent from a PC and a "photocopy" initiated from the physical buttons on the printer itself. It simply tracks the **Total Pages** it has produced over its lifetime. 

HawkNine deduces the number of physical photocopies using this formula:

```text
Photocopies = (Change in Physical Hardware Counter) - (Pages Printed via PC)
```

By tracking the physical hardware counter over time, and keeping a separate log of every print job sent from the cybercafe computers, HawkNine can easily calculate the difference. Anything that caused the hardware counter to increase but wasn't a logged PC print job MUST be a photocopy.

## 2. Hardware Counter Retrieval (The Trigger)

The magic happens in the **HawkNine Desktop Agent**. To prevent UI flicker and performance issues from constantly checking the printer, the system is **event-driven**. It captures hardware readings at specific interaction points:

**The Triggers:**
*   **Login Baseline:** When a user logs in to a PC, it captures the starting sheet count.
*   **Session End:** When a session ends (via logout, lock, or admin disconnect).
*   **After Sale:** Immediately after any successful sale is processed at the PC.
*   **Submit Activity:** When submitting daily activity records.

**The Process:**
1. **PowerShell Automation (`sheets-monitor.js`)**: At these trigger points, the agent executes a highly optimized PowerShell script that uses Win32 APIs to silently open the printer's preferences dialog (`rundll32 printui.dll`), specifically the **Printer and Option Information (POI)** tab (common on EPSON L-series printers).
3. **Offscreen Stealth**: The dialog is moved completely offscreen (`-8000, -8000`) and made invisible so the user is never interrupted. No cursor stealing or focus loss occurs.
4. **Scraping**: It reads the "Total Sheets", "Color", and "B&W" values directly from the UI controls.
5. **Deduplication & Upload**: If the "Total Sheets" value is greater than the last recorded value, the agent uploads this new baseline to the server via the `POST /api/v1/agent/page-counter` endpoint.

## 3. Server-Side Processing & Calculation

When the admin opens the **Photocopy Tracking** tab in the Print Manager dashboard:

1. **Interval Creation**: The server (`GET /api/v1/admin/photocopy-data`) fetches all hardware counter readings for that specific printer, ordered by time. It groups them into consecutive pairs (Start Reading -> End Reading).
   *Note: At least two readings are required to form an interval.*
2. **Hardware Delta**: For each interval, it calculates `counterDiff = endReading - startReading`.
3. **Print Log Lookup**: It queries the `Log` collection for all PC print jobs that occurred between the timestamp of the start reading and the end reading. It sums up the total pages printed (`printSheetsBW` and `printSheetsColor`).
   *Note: It automatically handles duplex printing logic so physical sheets match printed pages appropriately.*
4. **Final Deduction**: The server subtracts the PC print pages from the Hardware Delta. The remaining pages are categorized as photocopies. 
5. **Revenue Calculation**: It applies the pricing (e.g., KSH 8 for B&W, KSH 40 for Color) to give a completely accurate revenue report for photocopies.

## 4. Edge Cases Handled

*   **Printer Renaming / Copies**: The system strictly groups readings by the exact printer name, preventing skewed data if a new driver creates an "EPSON L3250 (Copy 1)" vs "EPSON L3250 (Copy 2)".
*   **Offline Printers**: If a printer is offline, the offscreen dialog won't return valid data, so the system simply skips that cycle.
*   **Negative Deltas**: The system ignores any readings that go backwards, which protects against anomalies or replacing the printer hardware entirely.
