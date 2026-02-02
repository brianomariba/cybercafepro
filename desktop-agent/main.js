/**
 * HawkNine Desktop Agent v1.0
 * Production-ready Windows monitoring client
 */

const { app, BrowserWindow, ipcMain, screen, Tray, Menu } = require('electron');
const path = require('path');
const si = require('systeminformation');
const axios = require('axios');
const os = require('os');
const fs = require('fs');
const { exec } = require('child_process');
const { randomUUID: uuidv4 } = require('crypto');
const io = require('socket.io-client');

// SINGLE INSTANCE LOCK
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

// Custom Modules
const FileMonitor = require('./file-monitor');
const DataQueue = require('./data-queue');
const AppUsageTracker = require('./app-usage-tracker');
const { getUsbDevices, resetDeviceTracking } = require('./usb-monitor');
const { getRecentPrintJobs, getInstalledPrinters } = require('./print-monitor');
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
const LOG_API_URL = config.server.baseUrl + '/api/v1/agent/log';
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
let windows = []; // Support multiple monitors
let tray = null;
let mainWindow = null;
let isLocked = true;
let currentSession = null;
let fileMonitor = null;
let dataQueue = new DataQueue();
let appUsageTracker = new AppUsageTracker();
let urlTracker = new LiveUrlTracker();
let lastScreenshotTime = 0;
let connectedUsbDevices = [];
let sentPrintJobIds = new Set(); // Track sent print jobs to avoid duplicates
let lastSentBrowserUrl = ''; // Track last sent URL to avoid duplicates
let socket = null; // Socket.io connection for real-time commands

console.log(`HawkNine Agent Starting - Client ID: ${CLIENT_ID}`);

// ==================== WINDOW CREATION ====================

async function createWindows() {
    const displays = screen.getAllDisplays();
    windows = [];

    // Initialize System Tray
    setupTray();

    displays.forEach((display, index) => {
        const isPrimary = index === 0;

        let win = new BrowserWindow({
            x: display.bounds.x,
            y: display.bounds.y,
            width: display.bounds.width,
            height: display.bounds.height,
            kiosk: true,
            fullscreen: true,
            alwaysOnTop: true,
            frame: false,
            transparent: false,
            resizable: false,
            skipTaskbar: true,
            type: 'toolbar', // Helps hide from task switcher on some systems
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
            },
        });

        win.loadFile(path.join(__dirname, 'src/index.html'));

        // Only the primary window handles logic/IPC
        if (isPrimary) {
            mainWindow = win;
        } else {
            // Secondary windows just show a blank lock screen or logo
            win.webContents.on('did-finish-load', () => {
                win.webContents.send('secondary-lock');
            });
        }

        win.on('close', (e) => {
            if (isLocked) e.preventDefault();
        });

        windows.push(win);
    });

    // --- AUTO-LAUNCH ---
    setupAutoLaunch();

    // --- SECURITY: PERSISTENT FOCUS ---
    setInterval(() => {
        if (!isLocked) return;

        windows.forEach(win => {
            if (win && !win.isDestroyed()) {
                if (!win.isFocused()) win.focus();
                win.setAlwaysOnTop(true, 'screen-saver', 1);
                if (win.isMinimized()) win.restore();
            }
        });
    }, 500);

    mainWindow.webContents.on('did-finish-load', async () => {
        sendUpdateInfo();
        if (isLocked) mainWindow.webContents.send('lock-session');
    });
}

function setupTray() {
    const iconPath = path.join(__dirname, 'src/logo.jpg');
    try {
        tray = new Tray(iconPath);

        const updateTrayMenu = () => {
            const contextMenu = Menu.buildFromTemplate([
                { label: `HawkNine Agent (${CLIENT_ID})`, enabled: false },
                { type: 'separator' },
                {
                    label: isLocked ? 'Station Locked' : `Active: ${currentSession ? currentSession.user : 'User'}`,
                    enabled: false
                },
                {
                    label: 'Show/Hide Info Widget',
                    visible: !isLocked,
                    click: () => {
                        if (mainWindow) {
                            if (mainWindow.isVisible()) mainWindow.hide();
                            else {
                                mainWindow.show();
                                mainWindow.focus();
                            }
                        }
                    }
                },
                { type: 'separator' },
                {
                    label: 'End Session & Lock',
                    visible: !isLocked,
                    click: async () => {
                        await endSession();
                        lockSession();
                    }
                },
                {
                    label: 'Restart Station',
                    click: () => {
                        exec('shutdown /r /t 0');
                    }
                }
            ]);
            tray.setContextMenu(contextMenu);
        };

        tray.setToolTip('HawkNine Security Agent');
        updateTrayMenu();

        tray.on('double-click', () => {
            if (!isLocked && mainWindow) {
                if (mainWindow.isVisible()) mainWindow.hide();
                else mainWindow.show();
            }
        });

        // Listen for internal state changes to update menu
        ipcMain.on('update-tray', updateTrayMenu);
    } catch (e) {
        console.error('Tray initialization failed:', e);
    }
}

function setupAutoLaunch() {
    try {
        const AutoLaunch = require('auto-launch');
        const hawkNineLauncher = new AutoLaunch({
            name: 'HawkNine Agent',
            path: process.execPath,
        });
        hawkNineLauncher.isEnabled().then((isEnabled) => {
            if (!isEnabled) hawkNineLauncher.enable();
        });
    } catch (e) {
        if (process.platform === 'win32') {
            const regPath = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
            const appPath = process.execPath;
            exec(`reg add "${regPath}" /v "HawkNineAgent" /t REG_SZ /d "${appPath}" /f`, (err) => {
                if (err) console.error('Manual auto-launch failed:', err);
            });
        }
    }
}

function sendUpdateInfo() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const ip = getLocalIP();
    mainWindow.webContents.send('update-info', {
        hostname: os.hostname(),
        ip: ip,
        clientId: CLIENT_ID
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

ipcMain.on('buy-item', async (event, { itemId, quantity = 1 }) => {
    if (!currentSession) {
        event.reply('buy-item-response', { success: false, message: 'No active session' });
        return;
    }

    try {
        const response = await axios.post(`${config.server.baseUrl}/api/v1/inventory/${itemId}/sell`, {
            quantity,
            sessionId: currentSession.id,
            clientId: CLIENT_ID,
            hostname: os.hostname()
        });

        if (response.data.success) {
            event.reply('buy-item-response', { success: true, message: 'Item purchased successfully' });
        } else {
            event.reply('buy-item-response', { success: false, message: response.data.error || 'Purchase failed' });
        }
    } catch (error) {
        event.reply('buy-item-response', { success: false, message: error.response?.data?.error || 'Network error' });
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
            if (currentSession) {
                currentSession.filesCreated.push(fileInfo);

                // Real-Time Log
                const filePayload = {
                    type: 'file',
                    clientId: CLIENT_ID,
                    hostname: os.hostname(),
                    sessionId: currentSession.id,
                    sessionUser: currentSession.user,
                    receivedAt: new Date(),
                    data: fileInfo
                };
                // Fire and forget
                sendToServer(LOG_API_URL, filePayload).catch(e => console.error('RT Log Error:', e.message));
            }
        });
    }
    fileMonitor.start();

    // Transition to Widget Mode
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    // Transition to Background Mode
    mainWindow.setKiosk(false);
    mainWindow.setFullScreen(false);
    mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);

    // Hide the window completely as requested - user will use Tray
    mainWindow.hide();

    // Hide secondary windows
    windows.forEach(win => {
        if (win !== mainWindow && win && !win.isDestroyed()) {
            win.hide();
        }
    });

    // Ensure info is populated for whenever it's shown
    sendUpdateInfo();

    // Update Tray Menu to show "Active" state
    if (ipcMain.emit) {
        ipcMain.emit('update-tray');
    }

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
    const displays = screen.getAllDisplays();

    displays.forEach((display, index) => {
        const win = windows[index];
        if (!win || win.isDestroyed()) return;

        win.show();
        win.setKiosk(true);
        win.setFullScreen(true);
        win.setBounds(display.bounds);
        win.setAlwaysOnTop(true, 'screen-saver', 1);
        win.focus();
    });

    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('lock-session');
        sendUpdateInfo();
    }

    // Update Tray
    ipcMain.emit('update-tray');
}

// ==================== DATA COLLECTION ====================

async function startDataCollection() {
    let screenshot = null;
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
            if (!isLocked) {
                try {
                    const activeWin = require('active-win');
                    // active-win 6.0.1 uses sync() for synchronous capture
                    const win = activeWin.sync();
                    if (win) {
                        currentApp = {
                            title: win.title || '',
                            owner: win.owner?.name || '',
                            url: win.url || ''
                        };

                        // Track app usage
                        appUsageTracker.tick(currentApp.owner, currentApp.title);


                        // Track URLs from browsers & Real-Time Log using enhanced browser tracking
                        const isBrowser = ['chrome', 'msedge', 'firefox', 'opera', 'brave', 'edge', 'chromium', 'vivaldi', 'safari'].some(b =>
                            (currentApp.owner || '').toLowerCase().includes(b)
                        );

                        // Use enhanced browser tracking if it's a browser window
                        if (isBrowser) {
                            // Use the enhanced addFromWindow method that extracts URLs from titles
                            const browserData = urlTracker.addFromWindow(currentApp.title, currentApp.owner, currentApp.url);

                            // Send Real-Time Browser Log if we got valid data
                            if (browserData && browserData.url !== lastSentBrowserUrl) {
                                lastSentBrowserUrl = browserData.url;
                                const browserPayload = {
                                    type: 'browser',
                                    clientId: CLIENT_ID,
                                    hostname: os.hostname(),
                                    sessionId: currentSession?.id || null,
                                    sessionUser: currentSession?.user || null,
                                    data: {
                                        url: browserData.url,
                                        title: browserData.title,
                                        category: browserData.category,
                                        browser: browserData.browser,
                                        timestamp: browserData.timestamp
                                    }
                                };
                                // Don't await strictly to avoid blocking heartbeat
                                sendToServer(LOG_API_URL, browserPayload).catch(e => console.error('Browser Log Failed:', e.message));
                            }
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

            // Print Jobs - Real-Time Logging
            let printJobs = [];
            try {
                printJobs = await getRecentPrintJobs();
                if (printJobs.length > 0) {
                    for (const job of printJobs) {
                        // Check if already sent
                        if (!sentPrintJobIds.has(job.jobId)) {
                            sentPrintJobIds.add(job.jobId);

                            // Send Real-Time Print Log
                            const printPayload = {
                                type: 'print',
                                clientId: CLIENT_ID,
                                hostname: os.hostname(),
                                sessionId: currentSession?.id || null,
                                sessionUser: currentSession?.user || null,
                                data: job
                            };
                            sendToServer(LOG_API_URL, printPayload).catch(e => console.error('Print Log Failed:', e.message));

                            // Also add to session summary for billing consistency
                            if (currentSession) {
                                const exists = currentSession.printJobs.find(j => j.id === job.id);
                                if (!exists) currentSession.printJobs.push(job);
                            }
                        }
                    }
                }
            } catch (e) { }

            // USB Devices
            try {
                const { newDevices } = await getUsbDevices();
                if (newDevices.length > 0) {
                    connectedUsbDevices.push(...newDevices);
                }
            } catch (e) { }

            // Send printer information periodically (every 5 heartbeats = ~50 seconds)
            try {
                if (!global.printerLogCounter) global.printerLogCounter = 0;
                global.printerLogCounter++;

                if (global.printerLogCounter >= 5) {
                    global.printerLogCounter = 0;
                    const printers = await getInstalledPrinters();
                    if (printers.length > 0) {
                        const printerPayload = {
                            type: 'printers',
                            clientId: CLIENT_ID,
                            hostname: os.hostname(),
                            sessionId: currentSession?.id || null,
                            sessionUser: currentSession?.user || null,
                            data: {
                                printers: printers,
                                timestamp: new Date().toISOString()
                            }
                        };
                        sendToServer(LOG_API_URL, printerPayload).catch(e => console.error('Printer Log Failed:', e.message));
                    }
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
            dataQueue.processQueue();

        } catch (error) {
            if (error?.code !== 'ECONNREFUSED') {
                console.error('Collection Error:', error.message);
            }
        }
    }, HEARTBEAT_INTERVAL);
}

// ==================== SERVER COMMUNICATION & SOCKETS ====================

function setupSocket() {
    if (!config || !config.server || !config.server.baseUrl) return;

    // Connect to server
    socket = io(config.server.baseUrl);

    socket.on('connect', () => {
        console.log('Connected to HawkNine Socket Server');
        socket.emit('agent-register', { clientId: CLIENT_ID, hostname: os.hostname() });
    });

    socket.on('agent-command', (data) => {
        if (data.clientId && data.clientId !== CLIENT_ID && data.clientId !== 'all') return;
        console.log(`Received Command: ${data.command}`);
        handleSocketCommand(data);
    });

    socket.on('document-for-agent', (data) => {
        if (data.targetClientId && data.targetClientId !== CLIENT_ID) return;
        console.log(`Received Document: ${data.document.filename}`);
        if (data.document && data.document.downloadUrl) {
            downloadFile(data.document.downloadUrl, data.document.filename, data.document.message);
        }
    });
}

async function handleSocketCommand(data) {
    const { command, params } = data;
    const { dialog } = require('electron');

    switch (command) {
        case 'lock':
            // End current session gracefully before locking
            if (currentSession) {
                await endSession();
            }
            lockSession();
            console.log('[COMMAND] Lock executed');
            break;

        case 'unlock':
            unlockSession();
            console.log('[COMMAND] Unlock executed');
            break;

        case 'restart':
            console.log('[COMMAND] Restarting...');
            // Show brief notification
            dialog.showMessageBox(null, {
                type: 'info',
                title: 'Admin Command',
                message: 'This computer will restart in 5 seconds.',
                buttons: ['OK']
            }).then(() => {
                exec('shutdown /r /t 5');
            });
            // Fallback if dialog not closed
            setTimeout(() => exec('shutdown /r /t 0'), 6000);
            break;

        case 'shutdown':
            console.log('[COMMAND] Shutting down...');
            dialog.showMessageBox(null, {
                type: 'info',
                title: 'Admin Command',
                message: 'This computer will shut down in 5 seconds.',
                buttons: ['OK']
            }).then(() => {
                exec('shutdown /s /t 5');
            });
            setTimeout(() => exec('shutdown /s /t 0'), 6000);
            break;

        case 'message':
            if (params && params.text) {
                dialog.showMessageBox(null, {
                    type: 'info',
                    title: 'Message from Admin',
                    message: params.text,
                    buttons: ['OK']
                });
            }
            break;

        case 'sendFile':
            // Handle direct file send command (alternative to socket event)
            if (params && params.url && params.filename) {
                downloadFile(params.url, params.filename, params.message || 'File from Admin');
            }
            break;

        default:
            console.log(`[COMMAND] Unknown command: ${command}`);
    }
}

function unlockSession() {
    isLocked = false;
    windows.forEach(win => {
        if (!win || win.isDestroyed()) return;
        win.hide();
        win.setAlwaysOnTop(false);
        // Reset flags
        win.setKiosk(false);
        win.setFullScreen(false);
    });

    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('unlock-session');
    }

    // Update tray to show "Active"
    ipcMain.emit('update-tray');
}

async function downloadFile(url, filename, messageText) {
    try {
        const desktopPath = path.join(os.homedir(), 'Desktop');
        if (!fs.existsSync(desktopPath)) {
            try { fs.mkdirSync(desktopPath); } catch (e) { }
        }

        const destPath = path.join(desktopPath, filename);
        console.log(`Downloading to ${destPath}...`);

        const writer = fs.createWriteStream(destPath);

        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream'
        });

        response.data.pipe(writer);

        writer.on('finish', () => {
            console.log('Download complete');
            const { dialog } = require('electron');
            dialog.showMessageBox(null, {
                type: 'info',
                title: 'New Document Received',
                message: messageText || 'File received from Admin',
                detail: `File "${filename}" has been saved to your Desktop.`,
                buttons: ['OK']
            });
        });

        writer.on('error', (err) => {
            console.error('File write error:', err);
        });
    } catch (e) {
        console.error('Download failed:', e.message);
    }
}


async function sendToServer(url, data) {
    try {
        const response = await axios.post(url, data, { timeout: 10000 });
        if (url.includes('/sync')) {
            console.log(`[SYNC] Success - Client: ${data.clientId}, Status: ${data.status}`);
        }
    } catch (error) {
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            // Queue for retry
            dataQueue.enqueue(url, data);
            console.log(`[SYNC] Queued for retry - ${error.code}`);
        } else {
            console.error('API Error:', error.message, error.response?.data);
        }
    }
}

// ==================== APP LIFECYCLE ====================

app.whenReady().then(() => {
    createWindows();
    setupSocket(); // Establish socket connection for receiving commands
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
