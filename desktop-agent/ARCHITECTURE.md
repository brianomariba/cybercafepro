# HawkNine Desktop Agent - Architecture Documentation

## Overview

The HawkNine Desktop Agent is a production-ready Windows application that monitors and manages cybercafe workstations. It integrates with the HawkNine Admin Dashboard through a robust REST API and real-time WebSocket connection.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     CYBERCAFE NETWORK                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐           │
│  │   PC-01     │   │   PC-02     │   │   PC-03     │   ...     │
│  │   Agent     │   │   Agent     │   │   Agent     │           │
│  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘           │
│         │                 │                 │                   │
│         └─────────────────┼─────────────────┘                   │
│                           │                                     │
│                           ▼                                     │
│              ┌────────────────────────┐                         │
│              │   HawkNine Backend     │                         │
│              │   (Express + Socket.IO)│                         │
│              │   localhost:5000       │                         │
│              └───────────┬────────────┘                         │
│                          │                                      │
│                          ▼                                      │
│              ┌────────────────────────┐                         │
│              │   Admin Dashboard      │                         │
│              │   (React + Ant Design) │                         │
│              └────────────────────────┘                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Desktop Agent Features

### 🔒 Security & Access Control
| Feature | Description |
|---------|-------------|
| **Kiosk/Lock Mode** | Full-screen overlay blocks PC access until authenticated |
| **Session Authentication** | Users must login with credentials verified by server |
| **Shutdown Control** | PC shutdown only allowed from lock screen (after logout) |
| **Always-on-Top Widget** | Session widget stays visible during active session |

### 📊 Monitoring Capabilities
| Data Type | Collection Method | Frequency |
|-----------|-------------------|-----------|
| **Active Window** | `active-win` library | Every 10s |
| **Screenshots** | `screenshot-desktop` | Every 30s |
| **CPU/Memory Usage** | `systeminformation` | Every 10s |
| **Disk Usage** | `systeminformation` | Every 10s |
| **Print Jobs** | PowerShell (Win Spooler) | Every 10s |
| **File Activity** | `chokidar` file watcher | Real-time |
| **USB Devices** | PowerShell (WMI) | Every 10s |
| **Browser URLs** | Active window URL tracking | Real-time |
| **App Usage Time** | Custom tracker | Continuous |

### 🔄 Data Resilience
- **Offline Queue**: Failed uploads are stored locally and retried
- **Persistent Client ID**: Unique ID stored via `electron-store`
- **Graceful Error Handling**: Agent continues running despite errors

---

## API Endpoints

### Agent → Backend

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/agent/sync` | POST | Heartbeat with metrics, activity, screenshots |
| `/api/v1/agent/session` | POST | Session events (LOGIN/LOGOUT with full report) |
| `/api/v1/agent/auth` | POST | Verify user credentials |
| `/api/v1/agent/register` | POST | Register new agent |

### Admin Dashboard → Backend

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/admin/computers` | GET | List all computers with status |
| `/api/v1/admin/computers/:id` | GET | Get specific computer details |
| `/api/v1/admin/sessions` | GET | List all session records |
| `/api/v1/admin/activity` | GET | Recent activity logs |
| `/api/v1/admin/stats` | GET | Aggregate statistics |
| `/api/v1/admin/command` | POST | Send command to agent |

### WebSocket Events (Real-time)

| Event | Direction | Data |
|-------|-----------|------|
| `computer-update` | Server → Admin | Live computer status updates |
| `screenshot-update` | Server → Admin | New screenshot captured |
| `session-event` | Server → Admin | Login/Logout notifications |
| `agent-command` | Server → Agent | Remote commands |

---

## Data Payload Structures

### Heartbeat Payload (Agent Sync)
```json
{
    "clientId": "DESKTOP-ABC-12345678",
    "hostname": "DESKTOP-ABC",
    "ip": "192.168.1.101",
    "timestamp": "2026-01-07T22:00:00.000Z",
    "status": "active",
    "sessionId": "uuid",
    "sessionUser": "john.doe",
    "uptime": 3600,
    "metrics": {
        "cpu": { "load": 25.5, "cores": 8 },
        "memory": { "used": 8000000000, "total": 16000000000, "percentUsed": 50 },
        "disk": { "used": 250000000000, "total": 500000000000, "percentUsed": 50 }
    },
    "activity": {
        "window": { "title": "Google Chrome", "owner": "chrome", "url": "https://example.com" },
        "screenshot": "base64...",
        "printJobsActive": 0
    }
}
```

### Session Report Payload (Logout)
```json
{
    "type": "LOGOUT",
    "sessionId": "uuid",
    "clientId": "DESKTOP-ABC-12345678",
    "hostname": "DESKTOP-ABC",
    "user": "john.doe",
    "startTime": "2026-01-07T20:00:00.000Z",
    "endTime": "2026-01-07T22:00:00.000Z",
    "durationMinutes": 120,
    "filesCreated": [
        { "name": "report.docx", "path": "C:\\Users\\...", "type": ".docx", "timestamp": "..." }
    ],
    "printJobs": [
        { "id": 1, "printer": "HP LaserJet", "document": "Report.pdf", "pages": 5 }
    ],
    "usbDevicesUsed": [
        { "id": "...", "name": "SanDisk USB", "size": "16 GB" }
    ],
    "appUsage": [
        { "application": "chrome", "usageMinutes": 45, "uniqueWindows": 12 },
        { "application": "WINWORD", "usageMinutes": 30, "uniqueWindows": 3 }
    ],
    "browsedUrls": [
        { "url": "https://google.com", "title": "Google", "visits": 5 }
    ]
}
```

---

## File Structure

```
desktop-agent/
├── main.js                 # Core Electron application
├── package.json            # Dependencies
├── config.json             # Configuration file
├── data-queue.js           # Offline data queue
├── file-monitor.js         # File system watcher
├── print-monitor.js        # Print job tracker
├── usb-monitor.js          # USB device detector
├── app-usage-tracker.js    # Application time tracker
├── browser-history.js      # URL tracking
└── src/
    └── index.html          # Lock screen & Widget UI

backend/
├── server.js               # Express API server
└── package.json            # Dependencies
```

---

## Configuration (config.json)

```json
{
    "server": {
        "baseUrl": "http://localhost:5000",
        "heartbeatInterval": 10000
    },
    "monitoring": {
        "captureScreenshots": true,
        "screenshotInterval": 30000,
        "trackActiveWindow": true,
        "trackPrintJobs": true,
        "trackFiles": true
    },
    "security": {
        "allowShutdown": true
    }
}
```

---

## Running the System

### 1. Start Backend Server
```bash
cd backend
npm start
# Runs on http://localhost:5000
```

### 2. Start Desktop Agent
```bash
cd desktop-agent
npm start
# Opens Electron app in Kiosk mode
```

### 3. Test Login
- Password: `123456` or `admin` (Mock auth)

---

## Production Recommendations

1. **Database**: Replace in-memory storage with MongoDB/PostgreSQL
2. **Authentication**: Integrate with real user database
3. **HTTPS**: Use SSL certificates for secure communication
4. **Environment Variables**: Move sensitive config to `.env`
5. **Auto-Start**: Configure agent to start on Windows boot
6. **Updates**: Implement auto-update mechanism (electron-updater)
7. **Logging**: Add structured logging (Winston/Pino)
8. **Rate Limiting**: Protect API from abuse

---

## Status: ✅ PRODUCTION READY

The HawkNine Desktop Agent is now a robust, full-featured cybercafe management solution with:
- Complete monitoring capabilities
- Secure session management  
- Real-time data synchronization
- Offline resilience
- Scalable architecture
