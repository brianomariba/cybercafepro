# HawkNine CyberCafe Pro — Source Code

> **HawkNine** is a comprehensive cybercafe management platform that handles user sessions, printing, payments (M-Pesa), document sharing, browser monitoring, and admin analytics — all from a unified system.

---

## 📁 Project Structure

```
HawkNine/
├── backend/            # Node.js Express API server
├── cybercafe-admin/    # Admin dashboard (Vite + React)
├── user-portal/        # Customer self-service portal (Vite + React)
├── desktop-agent/      # Electron desktop agent for Windows PCs
├── landing/            # Marketing / landing page (HTML/CSS/JS)
├── README.md           # This file
├── HAWKNINE_ARCHITECTURE.md   # System architecture overview
├── HAWKNINE_FEATURES.md       # Feature documentation
├── PRODUCTION_DEPLOYMENT.md   # Deployment guide
└── SYSTEM_ANALYSIS.md         # System analysis & audit
```

---

## 🔧 backend/

**Technology:** Node.js, Express, MongoDB (Mongoose)

The core API server that powers all clients. Key features:

| Feature | Description |
|---------|-------------|
| **Authentication** | JWT-based auth for admins, agents, and users |
| **Session Management** | Track PC sessions, time usage, and billing |
| **Print Monitoring** | Track print jobs, page counts, and costs |
| **M-Pesa Integration** | STK Push, C2B callbacks, transaction status |
| **Document Sharing** | Upload/download files between admin and user PCs |
| **WhatsApp Notifications** | Send alerts and receipts via WhatsApp API |
| **Analytics** | Revenue, usage stats, and reporting endpoints |

**Key Files:**
- `server.js` — Main server with all routes and middleware
- `models/` — Mongoose schemas (User, Session, PrintJob, etc.)
- `mpesa-routes.js` — M-Pesa payment integration routes
- `whatsapp.js` — WhatsApp messaging service
- `utils/` — Helper utilities
- `ecosystem.config.js` — PM2 deployment configuration
- `.env.example` — Environment variable template

---

## 🖥️ cybercafe-admin/

**Technology:** Vite, React, JavaScript

The admin dashboard for cafe owners/managers. Provides:

- **Real-time PC status** — See which machines are active/idle
- **Session management** — Start, stop, extend sessions
- **Print job tracking** — Monitor all print jobs and costs
- **Revenue analytics** — Daily/weekly/monthly revenue charts
- **User management** — Add, edit, remove users
- **M-Pesa transactions** — View payment history and status
- **Document management** — Share files to user PCs

**Key Files:**
- `src/` — React components, pages, and hooks
- `index.html` — Entry point
- `vite.config.js` — Build configuration
- `.env.development` / `.env.production` — API endpoint config

---

## 👤 user-portal/

**Technology:** Vite, React, JavaScript

Self-service portal for cybercafe customers:

- **Session status** — See remaining time and cost
- **Print history** — View personal print job history
- **Document access** — Download shared documents
- **Payment history** — View M-Pesa transaction records
- **Top-up** — Add time via M-Pesa

**Key Files:**
- `src/` — React components and pages
- `index.html` — Entry point
- `vite.config.js` — Build configuration
- `.env.development` / `.env.production` — API endpoint config

---

## 🖨️ desktop-agent/

**Technology:** Electron, Node.js

Windows desktop application installed on each cybercafe PC. Runs in the system tray and provides:

| Feature | Description |
|---------|-------------|
| **Print Monitoring** | Intercepts Windows print spooler to track all print jobs |
| **Page Counting** | Counts pages for each document (PDF, Word, etc.) |
| **Browser History** | Monitors Chrome/Edge browsing history |
| **App Usage Tracking** | Tracks which applications are used and for how long |
| **File Monitoring** | Watches for USB drives and file transfers |
| **Sheets Monitoring** | Tracks Google Sheets usage |
| **Offline Queue** | Queues data when server is unreachable |
| **Auto-Update** | Self-updates from server |

**Key Files:**
- `main.js` — Electron main process (app lifecycle, tray, IPC)
- `print-monitor.js` — Windows print spooler integration
- `browser-history.js` — Chrome/Edge history reader
- `app-usage-tracker.js` — Application usage tracking
- `file-monitor.js` — USB and file transfer monitoring
- `sheets-monitor.js` — Google Sheets usage tracking
- `offline-store.js` — Offline data persistence
- `data-queue.js` — Server sync queue
- `pdf-scanner.js` — PDF page counter
- `src/` — Electron renderer (UI windows)
- `package.json` — Dependencies and electron-builder config

---

## 🌐 landing/

**Technology:** HTML, CSS, JavaScript (static)

The public-facing marketing page for HawkNine:

- Hero section with branding
- Feature showcase
- Pricing information
- Contact / sign-up form

**Key Files:**
- `index.html` — Main page
- `style.css` — Styles
- `script.js` — Interactive elements and animations
- `assets/` — Images and media

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** 18+ and **npm**
- **MongoDB** (local or Atlas)
- **Windows** (for desktop-agent)

### Backend Setup
```bash
cd backend
cp .env.example .env
# Edit .env with your MongoDB URI, M-Pesa keys, etc.
npm install
node server.js
```

### Admin Dashboard
```bash
cd cybercafe-admin
npm install
npm run dev
```

### User Portal
```bash
cd user-portal
npm install
npm run dev
```

### Desktop Agent
```bash
cd desktop-agent
npm install
npm start
# For building installer:
npm run build
```

### Landing Page
```bash
cd landing
# Open index.html in a browser, or serve with:
npx serve .
```

---

## 🔑 Environment Variables

See `backend/.env.example` for the full list. Key variables:

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret for JWT token signing |
| `MPESA_CONSUMER_KEY` | M-Pesa API consumer key |
| `MPESA_CONSUMER_SECRET` | M-Pesa API consumer secret |
| `MPESA_SHORTCODE` | M-Pesa business shortcode |
| `MPESA_PASSKEY` | M-Pesa passkey |
| `WHATSAPP_TOKEN` | WhatsApp Business API token |
| `PORT` | Server port (default: 3000) |

---

## 📄 License

Proprietary — HawkNine Group © 2026. All rights reserved.
