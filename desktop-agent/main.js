/**
 * HawkNine Desktop Agent v1.0
 * Production-ready Windows monitoring client
 */

const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const si = require('systeminformation');
const axios = require('axios');
const os = require('os');
const fs = require('fs');
const { exec } = require('child_process');
const { v4: uuidv4 } = require('uuid');

// Custom Modules
const FileMonitor = require('./file-monitor');
const DataQueue = require('./data-queue');
const AppUsageTracker = require('./app-usage-tracker');
const { getUsbDevices, resetDeviceTracking } = require('./usb-monitor');
const { getRecentPrintJobs } = require('./print-monitor');
const { LiveUrlTracker } = require('./browser-history');

// Load Configuration
let config;
try {
    config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
} catch (e) {
    console.error('Failed to load config.json. Falling back to hardened production defaults.');
    config = {
        server: {
            baseUrl: 'https://api.hawkninegroup.com',
            endpoints: {
                sync: '/api/v1/agent/sync',
                session: '/api/v1/agent/session',
                auth: '/api/v1/auth/agent/login'
            },
            heartbeatInterval: 10000
        },
        monitoring: {
            captureScreenshots: true,
            screenshotInterval: 30000
        }
    };
}

// Configuration
const ADMIN_API_URL = config.server.baseUrl + config.server.endpoints.sync;
const SESSION_API_URL = config.server.baseUrl + config.server.endpoints.session;
const HEARTBEAT_INTERVAL = config.server.heartbeatInterval || 10000;
const SCREENSHOT_INTERVAL = config.monitoring.screenshotInterval || 30000;

// Generate unique Client ID (persistent across restarts using simple file)
const CLIENT_ID_FILE = path.join(__dirname, '.client-id');
let CLIENT_ID;
try {
    if (fs.existsSync(CLIENT_ID_FILE)) {
        CLIENT_ID = fs.readFileSync(CLIENT_ID_FILE, 'utf8').trim();
    } else {
        CLIENT_ID = `${os.hostname()}-${uuidv4().slice(0, 8)}`;
        fs.writeFileSync(CLIENT_ID_FILE, CLIENT_ID);
    }
} catch (e) {
    CLIENT_ID = os.hostname();
}

// State
let mainWindow;
let isLocked = true;
let currentSession = null;
let fileMonitor = null;
let dataQueue = new DataQueue();
let appUsageTracker = new AppUsageTracker();
let urlTracker = new LiveUrlTracker();
let lastScreenshotTime = 0;
let connectedUsbDevices = [];

console.log(`HawkNine Agent Starting - Client ID: ${CLIENT_ID}`);

// ==================== WINDOW CREATION ====================

async function createWindow() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.bounds;

    mainWindow = new BrowserWindow({
        x: 0,
        y: 0,
        width: width,
        height: height,
        kiosk: true,
        fullscreen: true,
        alwaysOnTop: true,
        frame: false,
        transparent: false,
        resizable: false,
        skipTaskbar: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    mainWindow.loadFile(path.join(__dirname, 'src/index.html'));

    // Prevent closing
    mainWindow.on('close', (e) => e.preventDefault());

    mainWindow.webContents.on('did-finish-load', async () => {
        const ip = getLocalIP();
        mainWindow.webContents.send('update-info', {
            hostname: os.hostname(),
            ip: ip,
            clientId: CLIENT_ID
        });
        if (isLocked) mainWindow.webContents.send('lock-session');
    });
}

function getLocalIP() {
    const netInterfaces = os.networkInterfaces();
    for (const ifname of Object.keys(netInterfaces)) {
        for (const iface of netInterfaces[ifname]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

// ==================== IPC HANDLERS ====================

ipcMain.on('login-attempt', async (event, credentials) => {
    try {
        // Call backend API for authentication (production only – no offline/demo users)
        const authUrl = config.server.baseUrl + '/api/v1/auth/agent/login';

        const response = await axios.post(authUrl, {
            username: credentials.username,
            password: credentials.pass,
            clientId: CLIENT_ID,
            hostname: os.hostname()
        }, {
            timeout: 10000
        });

        if (response.data.success) {
            await startSession(credentials.username);
            event.reply('login-response', {
                success: true,
                user: credentials.username,
                name: response.data.user?.name || credentials.username
            });
        } else {
            event.reply('login-response', {
                success: false,
                message: response.data.message || 'Login failed'
            });
        }
    } catch (error) {
        // Handle specific error cases (no offline fallback)
        if (error.response) {
            const message = error.response.data?.message || 'Invalid credentials';
            event.reply('login-response', { success: false, message });
        } else {
            event.reply('login-response', {
                success: false,
                message: 'Unable to reach authentication server. Please check network or backend status.'
            });
        }
    }
});

ipcMain.on('logout-request', async () => {
    await endSession();
    lockSession();
});

ipcMain.on('shutdown-request', async () => {
    if (!isLocked) {
        console.log('Shutdown blocked: Session active');
        return;
    }
    exec('shutdown /s /t 0', (err) => {
        if (err) console.error('Shutdown failed:', err);
    });
});

ipcMain.on('restart-request', async () => {
    if (!isLocked) {
        console.log('Restart blocked: Session active');
        return;
    }
    exec('shutdown /r /t 0', (err) => {
        if (err) console.error('Restart failed:', err);
    });
});

// ==================== SESSION MANAGEMENT ====================

async function startSession(username) {
    isLocked = false;

    // Reset all trackers
    appUsageTracker.reset();
    urlTracker.reset();
    resetDeviceTracking();
    connectedUsbDevices = [];

    currentSession = {
        id: uuidv4(),
        user: username,
        startTime: new Date().toISOString(),
        filesCreated: [],
        printJobs: [],
        usbDevices: []
    };

    // Notify Backend
    await sendToServer(SESSION_API_URL, {
        type: 'LOGIN',
        sessionId: currentSession.id,
        clientId: CLIENT_ID,
        hostname: os.hostname(),
        ip: getLocalIP(),
        user: username,
        timestamp: currentSession.startTime
    });

    // Start File Monitoring
    if (!fileMonitor) {
        fileMonitor = new FileMonitor((fileInfo) => {
            if (currentSession) currentSession.filesCreated.push(fileInfo);
        });
    }
    fileMonitor.start();

    // Transition to Widget Mode
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    mainWindow.setKiosk(false);
    mainWindow.setFullScreen(false);
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.setSize(260, 240);
    mainWindow.setPosition(width - 280, height - 260);

    console.log(`Session Started: ${username} (${currentSession.id})`);
}

async function endSession() {
    if (!currentSession) return;

    const endTime = new Date().toISOString();

    // Stop File Monitoring
    if (fileMonitor) fileMonitor.stop();

    // Compile Full Session Report
    const sessionReport = {
        type: 'LOGOUT',
        sessionId: currentSession.id,
        clientId: CLIENT_ID,
        hostname: os.hostname(),
        ip: getLocalIP(),
        user: currentSession.user,
        startTime: currentSession.startTime,
        endTime: endTime,
        durationMinutes: Math.round((new Date(endTime) - new Date(currentSession.startTime)) / 60000),

        // File Activity Summary (categorized)
        filesCreated: currentSession.filesCreated,
        fileStats: fileMonitor ? fileMonitor.getStats() : null,
        fileCategorySummary: fileMonitor ? fileMonitor.getCategorySummary() : null,

        // Print Jobs
        printJobs: currentSession.printJobs,

        // USB Devices
        usbDevicesUsed: connectedUsbDevices,

        // App & Browser Usage
        appUsage: appUsageTracker.getSummary(),
        browsedUrls: urlTracker.getHistory()
    };

    await sendToServer(SESSION_API_URL, sessionReport);

    currentSession = null;
    console.log('Session Ended');
}

function lockSession() {
    isLocked = true;
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.bounds;

    mainWindow.setSize(width, height);
    mainWindow.setPosition(0, 0);
    mainWindow.setKiosk(true);
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.focus();

    mainWindow.webContents.send('lock-session');
}

// ==================== DATA COLLECTION ====================

async function startDataCollection() {
    let activeWindow = null;
    let screenshot = null;

    // Dynamic imports with fallbacks
    try {
        const module = await import('active-win');
        activeWindow = module.default;
    } catch (e) {
        console.error('active-win not available:', e.message);
    }

    try {
        screenshot = require('screenshot-desktop');
    } catch (e) {
        console.error('screenshot-desktop not available:', e.message);
    }

    setInterval(async () => {
        try {
            // System Metrics
            const [load, mem, disk] = await Promise.all([
                si.currentLoad(),
                si.mem(),
                si.fsSize()
            ]);

            // Active Window (only when unlocked)
            let currentApp = { title: 'LOCKED STATION', owner: 'System', url: '' };
            if (!isLocked && activeWindow) {
                try {
                    const win = await activeWindow();
                    if (win) {
                        currentApp = {
                            title: win.title || '',
                            owner: win.owner?.name || '',
                            url: win.url || ''
                        };

                        // Track app usage
                        appUsageTracker.tick(currentApp.owner, currentApp.title);

                        // Track URLs from browsers
                        if (currentApp.url && currentApp.url.startsWith('http')) {
                            urlTracker.addUrl(currentApp.url, currentApp.title);
                        }
                    }
                } catch (e) { }
            }

            // Screenshot (less frequently)
            let screenshotBase64 = null;
            const now = Date.now();
            if (!isLocked && screenshot && config.monitoring.captureScreenshots && (now - lastScreenshotTime >= SCREENSHOT_INTERVAL)) {
                try {
                    const imgBuffer = await screenshot({ format: 'jpg' });
                    screenshotBase64 = imgBuffer.toString('base64');
                    lastScreenshotTime = now;
                } catch (e) { }
            }

            // Print Jobs
            let printJobs = [];
            try {
                printJobs = await getRecentPrintJobs();
                // Add new print jobs to session
                if (currentSession && printJobs.length > 0) {
                    for (const job of printJobs) {
                        const exists = currentSession.printJobs.find(j => j.id === job.id);
                        if (!exists) currentSession.printJobs.push(job);
                    }
                }
            } catch (e) { }

            // USB Devices
            try {
                const { current, newDevices } = await getUsbDevices();
                if (newDevices.length > 0) {
                    connectedUsbDevices.push(...newDevices);
                    console.log('New USB devices detected:', newDevices);
                }
            } catch (e) { }

            // Build Payload
            const payload = {
                clientId: CLIENT_ID,
                hostname: os.hostname(),
                ip: getLocalIP(),
                timestamp: new Date().toISOString(),
                status: isLocked ? 'locked' : 'active',
                sessionId: currentSession?.id || null,
                sessionUser: currentSession?.user || null,
                uptime: process.uptime(),

                metrics: {
                    cpu: {
                        load: parseFloat(load.currentLoad.toFixed(2)),
                        cores: os.cpus().length
                    },
                    memory: {
                        used: mem.used,
                        total: mem.total,
                        percentUsed: parseFloat(((mem.used / mem.total) * 100).toFixed(2))
                    },
                    disk: disk.length > 0 ? {
                        used: disk[0].used,
                        total: disk[0].size,
                        percentUsed: parseFloat(disk[0].use.toFixed(2))
                    } : null
                },

                activity: {
                    window: currentApp,
                    screenshot: screenshotBase64,
                    printJobsActive: printJobs.length
                }
            };

            await sendToServer(ADMIN_API_URL, payload);

            // Process any queued data
            dataQueue.processQueue();

        } catch (error) {
            if (error?.code !== 'ECONNREFUSED') {
                console.error('Collection Error:', error.message);
            }
        }
    }, HEARTBEAT_INTERVAL);
}

// ==================== SERVER COMMUNICATION ====================

async function sendToServer(url, data) {
    try {
        await axios.post(url, data, { timeout: 10000 });
    } catch (error) {
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            // Queue for retry
            dataQueue.enqueue(url, data);
        } else {
            console.error('API Error:', error.message);
        }
    }
}

// ==================== APP LIFECYCLE ====================

app.whenReady().then(() => {
    createWindow();
    startDataCollection();

    // Periodically retry queued data
    setInterval(() => dataQueue.processQueue(), 30000);
});

app.on('window-all-closed', () => {
    // Prevent quitting
});

// Handle uncaught errors gracefully
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', reason);
});
