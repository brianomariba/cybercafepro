# HawkNine Cybercafe Management System
## Comprehensive Feature & Capabilities Document

The HawkNine platform is a modern, distributed, and highly resilient robust management system designed specifically for cybercafes and public computing environments. It consists of a real-time Node.js/MongoDB backend, a React-based Admin Dashboard, an Electron-based Desktop Agent (installed on client machines), a User Portal, and a Public Landing Page.

This document breaks down the overall system features and robust capabilities.

---

### 1. Advanced Desktop Agent Tracking & Control (Client PCs)
The Electron-based Desktop Agent runs silently in the background on all client machines and provides deep system-level integration and monitoring.

*   **Real-time Activity Telemetry:** Continuously monitors and reports active window titles, ensuring admins know exactly what applications are being used.
*   **Deep Browser History Tracking:** Extracts and categorizes URLs across major browsers (Chrome, Edge, Firefox), sending categorization metadata (e.g., social, video, education) to the admin.
*   **File System Monitoring:** Tracks file creation, modification, and downloads. It categorizes files by type (PDFs, Images, Videos) and origin source (WhatsApp, Telegram, Browser Downloads, USB).
*   **USB Device Detection:** Logs when USB flash drives or external devices are connected, providing security oversight against data exfiltration or malware introduction.
*   **Robust Command Execution:** Securely receives real-time WebSocket commands from the admin to Lock, Unlock, Restart, Shutdown, or display pop-up messages to the user.
*   **Live Remote Screen Capture:** Admins can instantly request a high-resolution screenshot of any client monitor. The system handles image conversion and fast WebSocket transmission up to 10MB payloads.
*   **Offline Resilience:** The agent utilizes an `offline-store.js` caching mechanism. If the network drops, it locally caches inventory, settings, and pending telemetry, syncing automatically when the connection is restored.

### 2. Intelligent Print Management
HawkNine features a custom print interception and accounting engine.

*   **Print Job Interception:** The agent hooks into the Windows Print Spooler to track all print requests globally across the OS.
*   **Page & Color Tracking:** Accurately determines if a print job is Color or Black & White, and counts the exact number of pages.
*   **Automated Billing:** Automatically calculates the cost of the print job based on globally defined pricing configurations (e.g., KSH 10 for B&W, KSH 50 for Color) and seamlessly adds it to the user's active session tab or generates a standalone transaction.
*   **Printer Hardware Monitoring:** Tracks all installed network and local printers on client machines, reporting their online/offline status, driver details, and lifetime page counts back to the admin dashboard.

### 3. Integrated Inventory & Point of Sale (POS)
A fully operational, centralized digital storefront.

*   **Centralized Ledger:** Admins manage items, pricing, categories, and stock levels from the dashboard.
*   **Digital Self-Service Storefront:** Users sitting at client computers can open their "User Portal", view the available inventory, and purchase items (e.g., snacks, usb drives) directly.
*   **Atomic Transactions:** Prevents overselling. Purchases immediately decrement global stock, create an indelible transaction receipt linked to the user's Client ID, and bypass the session timer for immediate financial reconciliation.
*   **Low-Stock Alerts:** Automatically monitors thresholds (e.g., less than 5 items remaining) and dispatches localized UI alerts and automated administrative email notifications to ensure shelves are restocked.

### 4. User Portal Interface
An interactive, full-screen React overlay accessible by users directly on the client machines.

*   **Session Management:** Users can log in, view their active time, accumulated charges (including print jobs and inventory purchases), and independently log out.
*   **Cybercafe Services:** Displays available professional services (e.g., graphic design, typing services) configured by the admin.
*   **Learning & Templates:** Provides direct access to a library of admin-curated educational tutorials and downloadable document templates (e.g., CV templates, official forms).
*   **Document Downloads:** Users can view and securely download files pushed to them by the admin directly from the portal.

### 5. Document Management & Cross-Platform Sharing
HawkNine bridges the gap between public internet and physical location services.

*   **Admin-to-Client File Transfer:** Admins can drag-and-drop files directly from the admin dashboard to a specific user's computer. The agent automatically downloads it directly to their local `Documents` folder.
*   **Public Landing Page Submissions:** Customers accessing the cybercafe's public landing page from their own devices (e.g., their smartphone at home) can securely upload documents and add printing instructions. 
*   **Agent Reception Tracking:** When a public document is uploaded, desktop agents provide notifications. The system records exactly *which* computer/agent received and downloaded the customer's remote file, providing a complete chain of custody in the admin analytics dashboard.

### 6. Comprehensive Admin Command Center (Dashboard)
The central nervous system for cybercafe owners and staff.

*   **Live Grid View:** A visual layout of all computers, their online status, current users, and active states.
*   **Drill-down Activity Monitor:** A dedicated side-drawer for every computer that aggregates its live sessions, browser history, file activity, print jobs, and recently taken screenshots into one unified view.
*   **Financial Reports & Analytics:** Detailed charts and graphs displaying daily revenue splits (Time vs. Printing vs. Inventory), top customers, and service utilization over rolling 30-day periods.
*   **Staff Task Management:** Built-in task tracking (To-Do, In Progress, Done) to coordinate cybercafe staff duties.

### 7. Technical Foundation & Security
Built on robust, modern web technologies.

*   **Real-Time WebSockets:** Powered by `socket.io`, ensuring that logouts, prints, inventory updates, and command dispatches happen in milliseconds without page refreshes.
*   **Stateless JWT Authentication:** Securely manages admin tokens, session validation, and differentiates between hardware clients and human admin overrides.
*   **Mongoose/MongoDB Data Layer:** Flexible, highly relational data schemas that ensure complex queries (like grouping file downloads by category over a 30-day period) run efficiently.
*   **Environment Agnostic:** Fully configurable via `.env` files, making it easy to deploy to local network servers or remote VPS cloud instances.
