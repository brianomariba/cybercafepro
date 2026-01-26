---
description: Deploy HawkNine to VPS with hawkninegroup.com domain
---

# HawkNine VPS Deployment Workflow

This workflow deploys HawkNine to a VPS with the domain **hawkninegroup.com**.

## Prerequisites

- VPS with Ubuntu 22.04 LTS (minimum 2GB RAM, 2 vCPU)
- Root or sudo access to the VPS
- Domain `hawkninegroup.com` with DNS access

---

## Phase 1: DNS Configuration (Do This First!)

### 1.1 Configure DNS A Records

Go to your domain registrar (e.g., Namecheap, GoDaddy, Cloudflare) and add these A records:

| Type | Host | Value | TTL |
|------|------|-------|-----|
| A | @ | 167.86.102.104 | 3600 |
| A | api | 167.86.102.104 | 3600 |
| A | admin | 167.86.102.104 | 3600 |
| A | portal | 167.86.102.104 | 3600 |

**VPS IP:** `167.86.102.104`

**Wait 5-10 minutes for DNS propagation before proceeding.**

---

## Phase 2: VPS Initial Setup

### 2.1 Connect to VPS

```bash
ssh root@167.86.102.104
```

### 2.2 Update System

// turbo
```bash
sudo apt update && sudo apt upgrade -y
```

### 2.3 Install Node.js 20.x

// turbo
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v  # Should show v20.x.x
```

### 2.4 Install MongoDB

// turbo
```bash
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt update
sudo apt install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod
sudo systemctl status mongod  # Should show "active (running)"
```

### 2.5 Install Nginx

// turbo
```bash
sudo apt install -y nginx
sudo systemctl enable nginx
```

### 2.6 Install PM2

// turbo
```bash
sudo npm install -g pm2
```

### 2.7 Install Certbot for SSL

// turbo
```bash
sudo apt install -y certbot python3-certbot-nginx
```

### 2.8 Create Application Directory

// turbo
```bash
sudo mkdir -p /var/www/hawknine
sudo mkdir -p /var/log/pm2
sudo chown -R $USER:$USER /var/www/hawknine
```

---

## Phase 3: Deploy Application Code

### 3.1 Option A: Upload from Local Machine

On your **local Windows machine**, run these commands to create deployment archive:

```powershell
cd C:\Users\Admin\OneDrive\Desktop\HawkNine

# Build frontend applications first
cd cybercafe-admin
npm install
npm run build

cd ..\user-portal
npm install
npm run build

cd ..

# Create deployment archive (using 7-Zip or tar if available)
# Or use FileZilla/WinSCP to upload the following folders:
# - backend/
# - cybercafe-admin/dist/
# - user-portal/dist/
# - landing/
```

**Using WinSCP/FileZilla:**
- Connect to your VPS
- Upload `backend/` folder to `/var/www/hawknine/backend/`
- Upload `cybercafe-admin/dist/` folder to `/var/www/hawknine/cybercafe-admin/dist/`
- Upload `user-portal/dist/` folder to `/var/www/hawknine/user-portal/dist/`
- Upload `landing/` folder to `/var/www/hawknine/landing/`

### 3.2 Option B: Clone from Git (Recommended)

```bash
cd /var/www/hawknine
git clone https://github.com/brianomariba/cybercafepro.git .

# Build frontend applications on server
cd cybercafe-admin
npm install
npm run build

cd ../user-portal
npm install
npm run build
```

---

## Phase 4: Configure Backend

### 4.1 Install Backend Dependencies

// turbo
```bash
cd /var/www/hawknine/backend
npm install --production
```

### 4.2 Create Production .env File

```bash
cd /var/www/hawknine/backend
nano .env
```

Paste this content (update the values!):

```env
NODE_ENV=production
PORT=5000

MONGODB_URI=mongodb://localhost:27017/hawknine

JWT_SECRET=GENERATE_A_64_CHARACTER_RANDOM_STRING_HERE
ADMIN_USERNAME=admin
ADMIN_PASSWORD=YOUR_SECURE_ADMIN_PASSWORD

CORS_ORIGIN=https://admin.hawkninegroup.com,https://portal.hawkninegroup.com,https://hawkninegroup.com

UPLOAD_DIR=./uploads
MAX_FILE_SIZE=52428800

RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=500
AUTH_RATE_LIMIT_MAX=10
```

**Generate a secure JWT secret:**
```bash
openssl rand -hex 32
```

### 4.3 Create Uploads Directory

// turbo
```bash
mkdir -p /var/www/hawknine/backend/uploads
chmod 755 /var/www/hawknine/backend/uploads
```

### 4.4 Start Backend with PM2

// turbo
```bash
cd /var/www/hawknine/backend
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup  # Follow the command it outputs
```

### 4.5 Verify Backend is Running

// turbo
```bash
pm2 status
pm2 logs hawknine-api --lines 20
curl http://localhost:5000/api/v1/admin/stats
```

---

## Phase 5: Configure Nginx

### 5.1 Create Nginx Configuration

```bash
sudo nano /etc/nginx/sites-available/hawknine
```

Paste this content:

```nginx
# Backend API - api.hawkninegroup.com
server {
    listen 80;
    server_name api.hawkninegroup.com;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # WebSocket support
        proxy_read_timeout 86400;
    }

    client_max_body_size 50M;
}

# Admin Dashboard - admin.hawkninegroup.com
server {
    listen 80;
    server_name admin.hawkninegroup.com;
    root /var/www/hawknine/cybercafe-admin/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}

# User Portal - portal.hawkninegroup.com
server {
    listen 80;
    server_name portal.hawkninegroup.com;
    root /var/www/hawknine/user-portal/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}

# Landing Page - hawkninegroup.com
server {
    listen 80;
    server_name hawkninegroup.com www.hawkninegroup.com;
    root /var/www/hawknine/landing;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
```

### 5.2 Enable Site and Test Config

// turbo
```bash
sudo ln -s /etc/nginx/sites-available/hawknine /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## Phase 6: Install SSL Certificates

### 6.1 Get SSL Certificates with Certbot

```bash
sudo certbot --nginx -d hawkninegroup.com -d www.hawkninegroup.com -d api.hawkninegroup.com -d admin.hawkninegroup.com -d portal.hawkninegroup.com
```

Follow the prompts:
- Enter email address
- Agree to terms
- Choose whether to redirect HTTP to HTTPS (recommended: Yes)

### 6.2 Verify SSL Auto-Renewal

// turbo
```bash
sudo certbot renew --dry-run
```

---

## Phase 7: Configure Firewall

// turbo
```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

---

## Phase 8: Secure MongoDB (Optional but Recommended)

### 8.1 Create MongoDB Users

```bash
mongosh
```

In the MongoDB shell:

```javascript
use admin
db.createUser({
    user: "hawknine_admin",
    pwd: "YOUR_SECURE_PASSWORD",
    roles: [{ role: "userAdminAnyDatabase", db: "admin" }]
})

use hawknine
db.createUser({
    user: "hawknine_app",
    pwd: "YOUR_APP_PASSWORD",
    roles: [{ role: "readWrite", db: "hawknine" }]
})

exit
```

### 8.2 Enable MongoDB Authentication

```bash
sudo nano /etc/mongod.conf
```

Add under the `#security:` section:

```yaml
security:
  authorization: enabled
```

Restart MongoDB:

```bash
sudo systemctl restart mongod
```

### 8.3 Update Backend .env

Update the MONGODB_URI in `/var/www/hawknine/backend/.env`:

```env
MONGODB_URI=mongodb://hawknine_app:YOUR_APP_PASSWORD@localhost:27017/hawknine
```

Restart the backend:

```bash
pm2 restart hawknine-api
```

---

## Phase 9: Verify Deployment

### 9.1 Test All Endpoints

// turbo
```bash
# Test API
curl https://api.hawkninegroup.com/api/v1/admin/stats

# Test websites (should return HTML)
curl -I https://hawkninegroup.com
curl -I https://admin.hawkninegroup.com
curl -I https://portal.hawkninegroup.com
```

### 9.2 Open in Browser

- Landing Page: https://hawkninegroup.com
- Admin Dashboard: https://admin.hawkninegroup.com
- User Portal: https://portal.hawkninegroup.com
- API: https://api.hawkninegroup.com/api/v1/admin/stats

---

## Quick Reference - PM2 Commands

```bash
# View status
pm2 status

# View logs
pm2 logs hawknine-api

# Restart
pm2 restart hawknine-api

# Stop
pm2 stop hawknine-api

# Monitor
pm2 monit
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| 502 Bad Gateway | Check PM2: `pm2 logs hawknine-api` |
| CORS errors | Verify CORS_ORIGIN in .env matches frontend domains |
| WebSocket not connecting | Check Nginx proxy headers |
| MongoDB connection failed | `sudo systemctl status mongod` |
| SSL certificate issues | `sudo certbot renew --force-renewal` |

---

## Domain URLs Summary

| Service | URL |
|---------|-----|
| Landing Page | https://hawkninegroup.com |
| Admin Dashboard | https://admin.hawkninegroup.com |
| User Portal | https://portal.hawkninegroup.com |
| API | https://api.hawkninegroup.com |
| WebSocket | wss://api.hawkninegroup.com |
