# HawkNine Print Audit & Cancelled Jobs Analysis

Based on a deep review of the frontend dashboard code (`PrintManager.jsx`) and backend processing logic, here is a detailed breakdown of how the **Comparison & Audit** and **Cancelled Jobs** features work, including potential inaccuracies and failure points you should be aware of.

## 1. Comparison & Audit

This module serves as an anti-fraud and compliance tool by cross-referencing what the **machines (hardware/software)** report vs what the **human agents (employees)** report.

### Photocopy Comparison
*   **Machine Detected:** `(Hardware Counter Delta) - (Spooler Tracked Prints)`
*   **Agent Submitted:** The manual sum of all "Photocopy" activity records submitted by the employee.
*   **How it works:** It expects the agent to manually declare exactly what the machine hardware dictates.
*   **What could go wrong (False Deficits):** 
    1.  **Missed Print Jobs:** If the Desktop Agent fails to intercept a PC print job (e.g. software crashed), the system sees the hardware counter increase without a matching PC print log. The system will falsely assume this was a physical photocopy. This artificially inflates the "Machine Detected Photocopies", making it look like the agent is stealing.
    2.  **Time Misalignment:** If the agent submits their activity record at 18:00 but a customer makes a photocopy at 18:01 right before logging out, the hardware reads it, but the submission missed it.

### Printing Comparison
*   **Machine Detected:** Total pages intercepted by the Desktop Agent from the Windows Spooler.
*   **Agent Submitted:** The manual sum of all "Printing" activity records.
*   **How it works:** It verifies that every page sent through the PC was paid for and logged. In your screenshot, the machine detected 22 prints, but the agent only submitted 1. This correctly highlights a massive 21-page discrepancy (potential revenue leakage).
*   **What could go wrong (False Deficits):**
    1.  **Cancelled Jobs:** If a customer sends a 20-page document to the printer, the Desktop Agent instantly logs 20 pages. If the printer jams on page 2 and the customer cancels the job, the machine still recorded 20 pages. The agent will only charge the customer for 2 pages, resulting in a false 18-page deficit in the audit. *(This is why the Cancelled Jobs tab exists!)*
    2.  **Reprinting Errors:** If the agent makes a mistake and has to reprint at their own cost, the machine logs it, but they might not submit it since no money was collected.

---

## 2. Cancelled Jobs Audit

This tab identifies situations where PC print jobs never actually made it onto physical paper.

*   **The Formula:** `Cancelled Jobs = (Spooler Tracked Prints) - (Hardware Counter Delta)`
*   **How it works:** This is the exact inverse of the photocopy logic. If the Desktop Agent saw 10 pages go through the PC spooler, but the Epson hardware counter only increased by 6 pages, the system determines that **4 pages were cancelled, jammed, or aborted**.

### What could go wrong / Inaccuracies:
1.  **Interval Timing Splitting:** 
    *   *Scenario:* A user sends a 100-page job at 14:00. The agent triggers a hardware reading at 14:01 while the printer is only on page 50. 
    *   *Result:* The first interval will show 100 Spooler Prints vs 50 Hardware Prints, resulting in **50 Cancelled Jobs**. Then, at 14:05, the next reading triggers. It sees 0 new Spooler Prints but 50 new Hardware Prints, resulting in **50 False Photocopies**. 
    *   *Conclusion:* Very long print jobs crossing over the trigger boundaries will cause temporary anomalies in both Cancelled Jobs and Photocopies.
2.  **Virtual Printers / PDF:** If a user prints to a virtual printer (like "Microsoft Print to PDF") and the Desktop Agent accidentally logs it, it will create 100% "Cancelled Jobs" because the physical hardware counter will never increase.
3.  **Duplex / N-up Printing Bugs:** If the desktop agent incorrectly calculates the physical sheets used for a complex booklet or duplex print, it will drift from the hardware counter, causing either false photocopies or false cancelled jobs.

## Summary Recommendation
The **Comparison & Audit** tab is highly effective for catching theft, but you should always cross-reference a "Printing Deficit" with the **Cancelled Jobs** tab. If the agent under-reported 20 prints, but there are 20 cancelled jobs, the agent is innocent (the printer jammed).
