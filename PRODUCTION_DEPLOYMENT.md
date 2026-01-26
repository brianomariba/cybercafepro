# HawkNine Production Deployment Guide

## Complete Guide to Deploy HawkNine to Production

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Project Structure Overview](#2-project-structure-overview)
3. [Phase 1: Database Setup](#3-phase-1-database-setup)
4. [Phase 2: Backend Production Setup](#4-phase-2-backend-production-setup)
5. [Phase 3: Frontend Production Builds](#5-phase-3-frontend-production-builds)
6. [Phase 4: Server Deployment](#6-phase-4-server-deployment)
7. [Phase 5: Desktop Agent Distribution](#7-phase-5-desktop-agent-distribution)
8. [Phase 6: Security & SSL](#8-phase-6-security--ssl)
9. [Phase 7: Monitoring & Maintenance](#9-phase-7-monitoring--maintenance)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Prerequisites

### Server Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **OS** | Ubuntu 20.04 LTS | Ubuntu 22.04 LTS |
| **RAM** | 2 GB | 4 GB |
| **CPU** | 1 vCPU | 2 vCPU |
| **Storage** | 20 GB SSD | 50 GB SSD |
| **Bandwidth** | 500 GB/month | 1 TB/month |

### Domain & DNS

- Purchase a domain (e.g., `hawknine.io`)
- Configure DNS A records:
  ```
  A    @           → YOUR_SERVER_IP
  A    api         → YOUR_SERVER_IP
  A    admin       → YOUR_SERVER_IP
  A    portal      → YOUR_SERVER_IP
  ```

### Required Software on Server

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install MongoDB
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt update
sudo apt install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod

# Install Nginx
sudo apt install -y nginx

# Install PM2 (Process Manager)
sudo npm install -g pm2

# Install Certbot for SSL
sudo apt install -y certbot python3-certbot-nginx
```

---

## 2. Project Structure Overview

```
HawkNine/
├── backend/              # Node.js API Server
│   ├── server.js         # Main server file
│   ├── package.json
│   └── uploads/          # Uploaded documents
│
├── cybercafe-admin/      # React Admin Dashboard
│   ├── src/
│   ├── dist/             # Production build (after npm run build)
│   └── package.json
│
├── user-portal/          # React User Portal
│   ├── src/
│   ├── dist/             # Production build (after npm run build)
│   └── package.json
│
└── desktop-agent/        # Electron Windows Monitoring Agent
    ├── src/
    ├── package.json
    └── dist/             # Installable .exe (after build)
```

---

## 3. Phase 1: Database Setup

### 3.1 Install MongoDB Driver

```bash
cd backend
npm install mongoose --save
```

### 3.2 Create Database Models

Create `backend/models/` directory with these files:

**backend/models/Computer.js**
```javascript
const mongoose = require('mongoose');

const computerSchema = new mongoose.Schema({
    clientId: { type: String, required: true, unique: true },
    hostname: String,
    ip: String,
    status: { type: String, enum: ['idle', 'active', 'locked', 'offline'], default: 'offline' },
    isOnline: { type: Boolean, default: false },
    sessionUser: String,
    lastSeen: Date,
    activity: {
        activeWindow: String,
        screenshot: String
    }
}, { timestamps: true });

module.exports = mongoose.model('Computer', computerSchema);
```

**backend/models/Session.js**
```javascript
const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
    sessionId: { type: String, required: true },
    clientId: String,
    hostname: String,
    user: String,
    type: { type: String, enum: ['LOGIN', 'LOGOUT'] },
    durationMinutes: Number,
    charges: {
        usage: { hours: Number, rate: Number, total: Number },
        printing: { bwPages: Number, bwTotal: Number, colorPages: Number, colorTotal: Number, total: Number },
        grandTotal: Number
    },
    printJobs: Array,
    browserHistory: Array,
    filesCreated: Array
}, { timestamps: true });

module.exports = mongoose.model('Session', sessionSchema);
```

**backend/models/Task.js**
```javascript
const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: String,
    serviceId: String,
    serviceName: String,
    price: { type: Number, default: 0 },
    priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },
    status: { type: String, enum: ['available', 'assigned', 'in-progress', 'completed', 'cancelled'], default: 'available' },
    assignedTo: {
        userId: String,
        clientId: String,
        hostname: String,
        userName: String
    },
    assignedAt: Date,
    dueAt: Date,
    completedAt: Date
}, { timestamps: true });

module.exports = mongoose.model('Task', taskSchema);
```

**backend/models/Transaction.js**
```javascript
const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    type: { type: String, enum: ['session', 'task_completion', 'payment'] },
    taskId: String,
    sessionId: String,
    description: String,
    amount: { type: Number, default: 0 },
    clientId: String,
    hostname: String,
    userId: String
}, { timestamps: true });

module.exports = mongoose.model('Transaction', transactionSchema);
```

**backend/models/Service.js**
```javascript
const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
    name: { type: String, required: true },
    category: String,
    description: String,
    price: { type: Number, required: true },
    unit: { type: String, enum: ['per_hour', 'per_page', 'per_copy', 'per_item', 'flat'], default: 'flat' },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Service', serviceSchema);
```

### 3.3 Update server.js for MongoDB

Add at the top of `backend/server.js`:

```javascript
const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/hawknine')
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => console.error('❌ MongoDB connection error:', err));

// Import models
const Computer = require('./models/Computer');
const Session = require('./models/Session');
const Task = require('./models/Task');
const Transaction = require('./models/Transaction');
const Service = require('./models/Service');
```

---

## 4. Phase 2: Backend Production Setup

### 4.1 Create Environment File

Create `backend/.env`:

```env
# Server
NODE_ENV=production
PORT=5000

# Database
MONGODB_URI=mongodb://localhost:27017/hawknine

# Security
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-admin-password

# CORS (your domain)
CORS_ORIGIN=https://admin.hawknine.io,https://portal.hawknine.io

# File Uploads
UPLOAD_DIR=/var/www/hawknine/uploads
MAX_FILE_SIZE=52428800
```

### 4.2 Update server.js for Production

Add environment variables support:

```javascript
require('dotenv').config();

// Use environment variables
const PORT = process.env.PORT || 5000;
const CORS_ORIGINS = process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'];

// Update CORS configuration
app.use(cors({
    origin: CORS_ORIGINS,
    credentials: true
}));
```

### 4.3 Create PM2 Ecosystem File

Create `backend/ecosystem.config.js`:

```javascript
module.exports = {
    apps: [{
        name: 'hawknine-api',
        script: 'server.js',
        instances: 'max',
        exec_mode: 'cluster',
        env_production: {
            NODE_ENV: 'production',
            PORT: 5000
        },
        watch: false,
        max_memory_restart: '500M',
        error_file: '/var/log/pm2/hawknine-error.log',
        out_file: '/var/log/pm2/hawknine-out.log',
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }]
};
```

---

## 5. Phase 3: Frontend Production Builds

### 5.1 Update API URLs for Production

**cybercafe-admin/src/services/api.js**
```javascript
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://api.hawknine.io/api/v1';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'https://api.hawknine.io';
```

**user-portal/src/services/api.js**
```javascript
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://api.hawknine.io/api/v1';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'https://api.hawknine.io';
```

### 5.2 Create Production Environment Files

**cybercafe-admin/.env.production**
```env
VITE_API_URL=https://api.hawknine.io/api/v1
VITE_SOCKET_URL=https://api.hawknine.io
```

**user-portal/.env.production**
```env
VITE_API_URL=https://api.hawknine.io/api/v1
VITE_SOCKET_URL=https://api.hawknine.io
```

### 5.3 Build Production Bundles

```bash
# Build Admin Dashboard
cd cybercafe-admin
npm install
npm run build
# Output: cybercafe-admin/dist/

# Build User Portal
cd ../user-portal
npm install
npm run build
# Output: user-portal/dist/
```

---

## 6. Phase 4: Server Deployment

### 6.1 Upload Files to Server

```bash
# On your local machine, create deployment archive
tar -czvf hawknine-deploy.tar.gz backend/ cybercafe-admin/dist/ user-portal/dist/

# Upload to server
scp hawknine-deploy.tar.gz user@YOUR_SERVER_IP:/tmp/

# On server, extract files
ssh user@YOUR_SERVER_IP
cd /var/www
sudo mkdir hawknine
sudo tar -xzvf /tmp/hawknine-deploy.tar.gz -C /var/www/hawknine/
```

### 6.2 Configure Nginx

Create `/etc/nginx/sites-available/hawknine`:

```nginx
# Backend API
server {
    listen 80;
    server_name api.hawknine.io;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
        
        # WebSocket support
        proxy_read_timeout 86400;
    }

    # File uploads
    client_max_body_size 50M;
}

# Admin Dashboard
server {
    listen 80;
    server_name admin.hawknine.io;
    root /var/www/hawknine/cybercafe-admin/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}

# User Portal
server {
    listen 80;
    server_name portal.hawknine.io;
    root /var/www/hawknine/user-portal/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/hawknine /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 6.3 Start Backend with PM2

```bash
cd /var/www/hawknine/backend
npm install --production
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup  # Follow the instructions shown
```

---

## 7. Phase 5: Desktop Agent Distribution

### 7.1 Configure Agent for Production

Update `desktop-agent/src/config.js`:

```javascript
module.exports = {
    production: {
        serverUrl: 'https://api.hawknine.io',
        wsUrl: 'wss://api.hawknine.io',
        heartbeatInterval: 10000,
        screenshotInterval: 30000
    },
    development: {
        serverUrl: 'http://localhost:5000',
        wsUrl: 'ws://localhost:5000',
        heartbeatInterval: 5000,
        screenshotInterval: 15000
    }
};
```

### 7.2 Build Windows Installer

```bash
cd desktop-agent

# Install electron-builder
npm install electron-builder --save-dev

# Add to package.json scripts:
"build": "electron-builder --win"

# Build installer
npm run build
# Output: desktop-agent/dist/HawkNine Agent Setup.exe
```

### 7.3 Agent Distribution Options

| Method | Description |
|--------|-------------|
| **USB Drive** | Copy installer to USB, install on each PC |
| **Network Share** | Host on LAN server, install via network |
| **Cloud Download** | Host on website for download |
| **Auto-Deploy** | Use deployment tools like PDQ Deploy |

---

## 8. Phase 6: Security & SSL

### 8.1 Install SSL Certificates

```bash
# Install SSL for all domains
sudo certbot --nginx -d api.hawknine.io -d admin.hawknine.io -d portal.hawknine.io

# Auto-renewal
sudo certbot renew --dry-run
```

### 8.2 Security Hardening

**Update Nginx with security headers:**

```nginx
# Add to each server block
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self' https: wss:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';" always;
```

**Configure Firewall:**

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

### 8.3 MongoDB Security

```bash
# Connect to MongoDB
mongosh

# Create admin user
use admin
db.createUser({
    user: "hawknine_admin",
    pwd: "your-secure-password",
    roles: [{ role: "userAdminAnyDatabase", db: "admin" }]
})

# Create app user
use hawknine
db.createUser({
    user: "hawknine_app",
    pwd: "your-app-password",
    roles: [{ role: "readWrite", db: "hawknine" }]
})
```

Update MongoDB config `/etc/mongod.conf`:

```yaml
security:
  authorization: enabled
```

Update `.env`:

```env
MONGODB_URI=mongodb://hawknine_app:your-app-password@localhost:27017/hawknine
```

---

## 9. Phase 7: Monitoring & Maintenance

### 9.1 PM2 Monitoring

```bash
# View logs
pm2 logs hawknine-api

# Monitor resources
pm2 monit

# View status
pm2 status

# Setup log rotation
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

### 9.2 Database Backups

Create backup script `/var/www/hawknine/backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/var/backups/hawknine"
DATE=$(date +%Y-%m-%d_%H-%M-%S)
mkdir -p $BACKUP_DIR

# Backup MongoDB
mongodump --uri="mongodb://localhost:27017/hawknine" --out="$BACKUP_DIR/mongo_$DATE"

# Backup uploads
tar -czvf "$BACKUP_DIR/uploads_$DATE.tar.gz" /var/www/hawknine/backend/uploads

# Keep only last 7 days
find $BACKUP_DIR -type f -mtime +7 -delete

echo "Backup completed: $DATE"
```

Schedule with cron:

```bash
crontab -e
# Add:
0 2 * * * /var/www/hawknine/backup.sh >> /var/log/hawknine-backup.log 2>&1
```

### 9.3 Uptime Monitoring

Consider using:
- **UptimeRobot** (free) - Monitor API and dashboards
- **PM2 Plus** - Advanced PM2 monitoring
- **Sentry** - Error tracking in frontend/backend

---

## 10. Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| **502 Bad Gateway** | Check PM2: `pm2 logs hawknine-api` |
| **WebSocket not connecting** | Check Nginx proxy config for `Upgrade` headers |
| **CORS errors** | Verify `CORS_ORIGIN` in `.env` matches frontend domains |
| **Agent not connecting** | Check firewall, ensure API URL is correct |
| **MongoDB connection failed** | Check `mongod` status: `sudo systemctl status mongod` |

### Useful Commands

```bash
# Check API is running
curl https://api.hawknine.io/api/v1/admin/stats

# Check Nginx config
sudo nginx -t

# View Nginx logs
sudo tail -f /var/log/nginx/error.log

# Restart all services
sudo systemctl restart nginx
pm2 restart all
sudo systemctl restart mongod
```

---

## Quick Deployment Checklist

- [ ] Server provisioned with Ubuntu 22.04
- [ ] Domain configured with DNS A records
- [ ] Node.js 20.x installed
- [ ] MongoDB installed and secured
- [ ] Nginx installed
- [ ] PM2 installed
- [ ] SSL certificates obtained (Certbot)
- [ ] Backend deployed with PM2
- [ ] Admin Dashboard built and deployed
- [ ] User Portal built and deployed
- [ ] Desktop Agent built for Windows
- [ ] Firewall configured (UFW)
- [ ] Backups scheduled
- [ ] Monitoring setup

---

## Support & Maintenance

### Regular Tasks

| Task | Frequency |
|------|-----------|
| Check PM2 status | Daily |
| Review error logs | Daily |
| Database backups | Daily (automated) |
| Security updates | Weekly |
| SSL renewal | Auto (every 90 days) |
| Full system backup | Monthly |

---

**Document Version:** 1.0  
**Last Updated:** January 2026  
**Author:** HawkNine Development Team
