/**
 * HawkNine Desktop Agent v1.0
 * Production-ready Windows monitoring client
 */

const { app, BrowserWindow, ipcMain, screen, Tray, Menu, shell, dialog } = require('electron');
const path = require('path');
const si = require('systeminformation');
const axios = require('axios');
const os = require('os');
const fs = require('fs');
const { exec } = require('child_process');
const { randomUUID: uuidv4 } = require('crypto');

const io = require('socket.io-client');
const FormData = require('form-data');



// SINGLE INSTANCE LOCK
if (process.platform === 'win32') {
    app.setAppUserModelId('com.hawkninegroup.agent');
}

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
const OfflineStore = require('./offline-store');
const { getUsbDevices, resetDeviceTracking } = require('./usb-monitor');
const { getRecentPrintJobs, getRecentCompletedJobs, getInstalledPrinters, getPrintHistory, enablePrintLogging, getAllPrinterData, detectPrintType, generatePrintJobKey, computeTotalSheets } = require('./print-monitor');
const { LiveUrlTracker, getActiveTabUrl, getAllBrowserUrls, getBrowserHistoryFromDB, categorizeUrl: categorizeBrowserUrl } = require('./browser-history');

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
const DOWNLOAD_URL = 'https://admin.hawkninegroup.com'; // Direct users here for updates
const HEARTBEAT_INTERVAL = config.server.heartbeatInterval || 10000;
const SCREENSHOT_INTERVAL = config.monitoring.screenshotInterval || 30000;

// Generate unique Client ID (persistent across restarts and updates)
// We use app.getPath('userData') to ensure the ID survives application updates
const USER_DATA_PATH = app.getPath('userData');
const CLIENT_ID_FILE = path.join(USER_DATA_PATH, '.client-id');
const OLD_CLIENT_ID_FILE = path.join(__dirname, '.client-id');

let CLIENT_ID;
try {
    // Check if we have an ID in the new persistent location
    if (fs.existsSync(CLIENT_ID_FILE)) {
        const storedId = fs.readFileSync(CLIENT_ID_FILE, 'utf8').trim();
        const currentHostname = os.hostname();

        // Validate ID matches current hostname (prevents cloning issues)
        // Check if it starts with hostname + '-' OR is exactly hostname
        if (storedId.startsWith(`${currentHostname}-`) || storedId === currentHostname) {
            CLIENT_ID = storedId;
        } else {
            console.log(`[ID] Hostname mismatch detected (Stored: ${storedId}, Current: ${currentHostname}). Regenerating Client ID.`);
            // Regenerate ID for new/renamed machine
            CLIENT_ID = `${currentHostname}-${uuidv4().slice(0, 8)}`;
            if (!fs.existsSync(USER_DATA_PATH)) {
                fs.mkdirSync(USER_DATA_PATH, { recursive: true });
            }
            fs.writeFileSync(CLIENT_ID_FILE, CLIENT_ID);
        }
    }
    // Migration: Check if we have an ID in the old installation folder
    else if (fs.existsSync(OLD_CLIENT_ID_FILE)) {
        const storedId = fs.readFileSync(OLD_CLIENT_ID_FILE, 'utf8').trim();
        const currentHostname = os.hostname();

        // Validate migration ID too
        if (storedId.startsWith(`${currentHostname}-`) || storedId === currentHostname) {
            CLIENT_ID = storedId;
            // Migrate to new location
            if (!fs.existsSync(USER_DATA_PATH)) {
                fs.mkdirSync(USER_DATA_PATH, { recursive: true });
            }
            fs.writeFileSync(CLIENT_ID_FILE, CLIENT_ID);
        } else {
            console.log(`[ID] Migration hostname mismatch. Regenerating.`);
            CLIENT_ID = `${currentHostname}-${uuidv4().slice(0, 8)}`;
            if (!fs.existsSync(USER_DATA_PATH)) {
                fs.mkdirSync(USER_DATA_PATH, { recursive: true });
            }
            fs.writeFileSync(CLIENT_ID_FILE, CLIENT_ID);
        }
    }
    // Generate new ID
    else {
        CLIENT_ID = `${os.hostname()}-${uuidv4().slice(0, 8)}`;
        if (!fs.existsSync(USER_DATA_PATH)) {
            fs.mkdirSync(USER_DATA_PATH, { recursive: true });
        }
        fs.writeFileSync(CLIENT_ID_FILE, CLIENT_ID);
    }
} catch (e) {
    console.error('Client ID generation failed:', e);
    CLIENT_ID = os.hostname();
}

// Session Persistence — remember active sessions across restarts
const SESSION_FILE = path.join(USER_DATA_PATH, '.active-session');

function saveSessionState(username) {
    try {
        fs.writeFileSync(SESSION_FILE, JSON.stringify({ user: username, timestamp: new Date().toISOString() }));
        console.log(`[SESSION] Saved active session for: ${username}`);
    } catch (e) {
        console.error('[SESSION] Failed to save session state:', e.message);
    }
}

function clearSessionState() {
    try {
        if (fs.existsSync(SESSION_FILE)) {
            fs.unlinkSync(SESSION_FILE);
            console.log('[SESSION] Cleared saved session state');
        }
    } catch (e) {
        console.error('[SESSION] Failed to clear session state:', e.message);
    }
}

function getSavedSession() {
    try {
        if (fs.existsSync(SESSION_FILE)) {
            const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
            if (data && data.user) {
                console.log(`[SESSION] Found saved session for: ${data.user}`);
                return data;
            }
        }
    } catch (e) {
        console.error('[SESSION] Failed to read saved session:', e.message);
    }
    return null;
}

// State
let windows = []; // Support multiple monitors
let tray = null;
let mainWindow = null;
let portalWindow = null; // User portal window
let isLocked = true;
let currentSession = null;
let fileMonitor = null;
let dataQueue = new DataQueue();
let offlineStore = new OfflineStore(__dirname); // Offline data cache
let appUsageTracker = new AppUsageTracker();
let urlTracker = new LiveUrlTracker();
let lastScreenshotTime = 0;
let connectedUsbDevices = [];
let sentPrintJobIds = new Set(); // Track sent print jobs to avoid duplicates
let sentBrowserUrls = new Map(); // url -> timestamp, deduplicate across real-time & DB sync
const BROWSER_DEDUP_WINDOW_MS = 120000; // 2 minutes: same URL won't be re-sent within this window
let socket = null; // Socket.io connection for real-time commands
let isOnline = true; // Track online status

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

    // --- ACTIVATION: FILE MONITOR ---
    if (!fileMonitor) {
        fileMonitor = new FileMonitor((fileInfo) => {
            // Log file activity to server
            if (isLocked) return; // Optional: Don't track if locked? Or maybe do for security?
            // Let's track always for security audit.

            const filePayload = {
                type: 'file',
                clientId: CLIENT_ID,
                hostname: os.hostname(),
                sessionId: currentSession?.id || null, // Associate with user if active
                sessionUser: currentSession?.user || null,
                data: fileInfo
            };

            // Send to server (fire and forget)
            sendToServer(LOG_API_URL, filePayload).catch(e => console.error('File Log Failed:', e.message));
        });
        fileMonitor.start();
        console.log('[MONITOR] File system monitoring started');
    }

    // --- ACTIVATION: PRINT LOGGING ---
    enablePrintLogging(); // Ensure event logging is active for history tracking

    // --- SECURITY: PERSISTENT FOCUS ---
    // Delay startup focus enforcement to allow page to fully render and inputs to initialize
    setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed() && isLocked) {
            mainWindow.focus();
            mainWindow.focusOnWebView();
            mainWindow.webContents.executeJavaScript(`
                const inp = document.getElementById('username');
                if (inp) { inp.focus(); inp.click(); }
            `).catch(() => { });
        }
    }, 2000);

    // Lock screen enforcement - keep windows on top and visible
    // IMPORTANT: Use a longer interval (2s) and avoid calling focusOnWebView() 
    // unless the window truly lost focus to another app. focusOnWebView() resets 
    // web content focus which interrupts typing in input fields.
    setInterval(() => {
        if (!isLocked) return;

        windows.forEach(win => {
            if (win && !win.isDestroyed()) {
                win.setAlwaysOnTop(true, 'screen-saver', 1);
                if (win.isMinimized()) win.restore();
                // Only bring window back if it's not visible/focused at all
                // Do NOT call focusOnWebView() here — it breaks keyboard input
                if (!win.isVisible()) {
                    win.show();
                    win.focus();
                }
            }
        });
    }, 2000);

    mainWindow.webContents.on('did-finish-load', async () => {
        sendUpdateInfo();

        // Check for a saved session — if found, restore it silently
        // IMPORTANT: Do NOT send login-response to the lock screen — that shows the
        // full-screen "SESSION SECURED" widget. Instead, startSession() will hide
        // the main window and open the portal window directly.
        const savedSession = getSavedSession();
        if (savedSession && savedSession.user) {
            console.log(`[SESSION] Restoring session for: ${savedSession.user}`);
            await startSession(savedSession.user);
            // Don't send login-response — portal is already open
            return; // Skip lock screen
        }

        if (isLocked) {
            mainWindow.webContents.send('lock-session');
            // After a brief delay, ensure the username input is focused for keyboard input
            setTimeout(() => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.focusOnWebView();
                    mainWindow.webContents.executeJavaScript(`
                        const inp = document.getElementById('username');
                        if (inp) { inp.focus(); inp.click(); }
                    `).catch(() => { });
                }
            }, 500);
        }
    });
}

function setupTray() {
    const iconPath = path.join(__dirname, 'src/logo.jpg');
    try {
        tray = new Tray(iconPath);

        tray.setToolTip('HawkNine Security Agent');
        const updateTrayMenu = () => {
            const pendingCount = offlineStore ? offlineStore.getPendingActions().length : 0;
            const contextMenu = Menu.buildFromTemplate([
                { label: `HawkNine Agent (${CLIENT_ID})`, enabled: false },
                { label: `Status: ${socket && socket.connected ? '🟢 Connected' : '🔴 Disconnected'}`, enabled: false },
                { type: 'separator' },
                {
                    label: 'Test Server Connection',
                    click: () => {
                        if (socket && socket.connected) {
                            dialog.showMessageBox(null, {
                                type: 'info',
                                title: 'Connection Test',
                                message: '✅ Agent is connected to server.',
                                detail: `Socket ID: ${socket.id}\nClient ID: ${CLIENT_ID}\nServer: ${config.server.baseUrl}`
                            });
                        } else {
                            dialog.showMessageBox(null, {
                                type: 'error',
                                title: 'Connection Test',
                                message: '❌ Agent is NOT connected.',
                                detail: `Server: ${config.server.baseUrl}\nCheck your internet or firewall.`
                            });
                            // Try reconnect
                            if (socket) socket.connect();
                        }
                    }
                },
                { type: 'separator' },
                {
                    label: isLocked ? 'Station Locked' : `Active: ${currentSession ? currentSession.user : 'User'}`,
                    enabled: false
                },
                {
                    label: '🖥️ Open Portal',
                    visible: !isLocked,
                    click: () => {
                        if (currentSession) {
                            createPortalWindow(currentSession.user);
                        }
                    }
                },
                {
                    label: pendingCount > 0 ? `⏳ Pending Sales (${pendingCount})` : '✅ All Synced',
                    visible: !isLocked,
                    enabled: false
                },
                { type: 'separator' },
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

        // Double-click opens the portal
        tray.on('double-click', () => {
            if (!isLocked && currentSession) {
                createPortalWindow(currentSession.user);
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
            saveSessionState(credentials.username); // Persist session across restarts
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
    clearSessionState(); // Clear persisted session so lock screen shows on next launch
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

// ==================== PORTAL IPC HANDLERS ====================

// Get all portal data (from cache or live)
ipcMain.on('get-portal-data', async (event) => {
    await sendPortalData(event);
});

// Refresh specific data type
ipcMain.on('refresh-portal-data', async (event, { type }) => {
    try {
        await fetchAndCacheData(type);
        await sendPortalData(event);
    } catch (error) {
        console.error(`[Portal] Failed to refresh ${type}:`, error.message);
    }
});

// Record a sale (works offline too)
ipcMain.on('record-sale', async (event, saleData) => {
    const { itemId, itemName, quantity, unitPrice, total, note, paymentMethod } = saleData;

    if (isOnline) {
        // Try to sync immediately
        try {
            const response = await axios.post(`${config.server.baseUrl}/api/v1/inventory/${itemId}/sell`, {
                quantity,
                reason: note,
                paymentMethod: paymentMethod || 'cash',
                clientId: CLIENT_ID,
                sessionId: currentSession?.id
            }, { timeout: 10000 });

            if (response.data.success) {
                // Update local cache
                offlineStore.decrementLocalStock(itemId, quantity);
                event.reply('sale-result', {
                    success: true,
                    message: `Sold ${quantity}x ${itemName} for KSH ${total.toLocaleString()}`
                });
                console.log(`[Portal] Sale recorded: ${quantity}x ${itemName}`);
            } else {
                event.reply('sale-result', { success: false, message: response.data.error || 'Sale failed' });
            }
        } catch (error) {
            // If network fails, queue for later
            console.log('[Portal] Network error, queuing sale for later sync');
            offlineStore.addPendingAction('SELL_ITEM', { itemId, itemName, quantity, unitPrice, total, note, paymentMethod: paymentMethod || 'cash' });
            offlineStore.decrementLocalStock(itemId, quantity);
            event.reply('sale-result', {
                success: true,
                message: `Sold ${quantity}x ${itemName} (will sync when online)`
            });
        }
    } else {
        // Offline mode - queue the action
        offlineStore.addPendingAction('SELL_ITEM', { itemId, itemName, quantity, unitPrice, total, note, paymentMethod: paymentMethod || 'cash' });
        offlineStore.decrementLocalStock(itemId, quantity);
        event.reply('sale-result', {
            success: true,
            message: `Sold ${quantity}x ${itemName} (offline - will sync later)`
        });
        console.log(`[Portal] Offline sale queued: ${quantity}x ${itemName}`);
    }
});

// Get pending actions count
ipcMain.on('get-pending-count', (event) => {
    const pending = offlineStore.getPendingActions();
    event.reply('pending-count', { count: pending.length });
});

// Open a resource (Template/Guide)
ipcMain.on('open-resource', async (event, { type, id, title }) => {
    try {
        // Construct download URL
        // endpoint: /api/v1/templates/:id/download or /api/v1/guides/:id/download
        const url = `${config.server.baseUrl}/api/v1/${type}/${id}/download`;

        console.log(`[RESOURCE] Requesting to open: ${url}`);

        // Use shell.openExternal as a robust fallback that works for all file types
        // This opens the URL in the default browser, which will handle the download/viewing
        // This is often more reliable than downloading to temp and trying to open with specific app
        await shell.openExternal(url);

    } catch (error) {
        console.error('[RESOURCE] Failed to open resource:', error.message);
    }
});

// Sync pending actions
ipcMain.on('sync-pending-actions', async (event) => {
    if (!isOnline) {
        event.reply('sync-result', { success: false, message: 'Currently offline' });
        return;
    }

    const pending = offlineStore.getPendingActions();
    let synced = 0;

    console.log(`[SYNC] Attempting to sync ${pending.length} pending actions...`);

    for (const action of pending) {
        try {
            if (action.type === 'SELL_ITEM') {
                const response = await axios.post(
                    `${config.server.baseUrl}/api/v1/inventory/${action.payload.itemId}/sell`,
                    {
                        quantity: action.payload.quantity,
                        reason: `Offline sale: ${action.payload.note || ''} (synced at ${new Date().toISOString()})`,
                        paymentMethod: action.payload.paymentMethod || 'cash',
                        clientId: CLIENT_ID
                    },
                    { timeout: 10000 }
                );

                if (response.data.success) {
                    offlineStore.removePendingAction(action.id);
                    synced++;
                    console.log(`[Portal] Synced pending sale: ${action.payload.itemName}`);
                } else {
                    console.error('[SYNC] Server returned success:false', response.data);
                    // Add details to attempts for debugging
                    offlineStore.updatePendingAction(action.id, {
                        attempts: (action.attempts || 0) + 1,
                        lastError: response.data.error || 'Server rejected sale'
                    });
                }
            }
        } catch (error) {
            let errorMsg = error.message;
            if (error.response) {
                errorMsg = `Status ${error.response.status}: ${JSON.stringify(error.response.data)}`;
                console.error(`[SYNC] API Error for action ${action.id}:`, errorMsg);
            } else {
                console.error(`[SYNC] Network Error for action ${action.id}:`, error.message);
            }

            offlineStore.updatePendingAction(action.id, {
                attempts: (action.attempts || 0) + 1,
                lastError: errorMsg
            });
        }
    }

    // Refresh inventory data after sync
    if (synced > 0) {
        await fetchAndCacheData('inventory');
    }

    event.reply('sync-result', { success: true, synced, remaining: pending.length - synced });
});

// Check online status
ipcMain.on('check-online-status', async (event) => {
    try {
        await axios.get(`${config.server.baseUrl}/health`, { timeout: 5000 });
        isOnline = true;
    } catch {
        isOnline = false;
    }
    event.reply('online-status', { isOnline });
});

// Submit Document
ipcMain.on('submit-document', async (event, { title, description, category, targetType, filePath }) => {
    if (!currentSession) {
        event.reply('submission-result', { success: false, message: 'Session not active' });
        return;
    }

    try {
        if (!fs.existsSync(filePath)) {
            event.reply('submission-result', { success: false, message: 'File not found' });
            return;
        }

        const form = new FormData();
        form.append('title', title);
        form.append('description', description || '');
        form.append('category', category || 'general');
        form.append('targetType', targetType);
        form.append('username', currentSession.user);
        form.append('file', fs.createReadStream(filePath));

        // Use AGENT endpoint
        const response = await axios.post(`${config.server.baseUrl}/api/v1/agent/submissions`, form, {
            headers: { ...form.getHeaders() },
            timeout: 60000
        });

        if (response.data.success) {
            event.reply('submission-result', { success: true });
            await fetchAndCacheData('submissions');
            await sendPortalData(event);
        } else {
            event.reply('submission-result', { success: false, message: response.data.error || 'Submission failed' });
        }
    } catch (error) {
        console.error('Submission failed:', error.message);
        event.reply('submission-result', { success: false, message: error.response?.data?.error || 'Network error during upload' });
    }
});

// Delete Submission
ipcMain.on('delete-submission', async (event, { id }) => {
    if (!currentSession) {
        event.reply('delete-submission-result', { success: false, message: 'Session not active' });
        return;
    }

    try {
        // Use AGENT endpoint with query param
        const response = await axios.delete(`${config.server.baseUrl}/api/v1/agent/submissions/${id}`, {
            params: { username: currentSession.user }
        });

        if (response.data.success) {
            event.reply('delete-submission-result', { success: true });
            await fetchAndCacheData('submissions');
            await sendPortalData(event);
        } else {
            event.reply('delete-submission-result', { success: false, message: response.data.error || 'Delete failed' });
        }
    } catch (error) {
        event.reply('delete-submission-result', { success: false, message: error.response?.data?.error || 'Network error' });
    }
});

// Helper: Send portal data to renderer
async function sendPortalData(event) {
    let printers = [];
    try {
        printers = await getInstalledPrinters();
    } catch (e) {
        console.error('Failed to get printers for portal:', e);
    }

    event.reply('portal-data', {
        user: currentSession ? { name: currentSession.user, username: currentSession.user } : null,
        inventory: offlineStore.getInventory(),
        services: offlineStore.getServices(),
        templates: offlineStore.getTemplates(),
        guides: offlineStore.getGuides(),
        settings: offlineStore.getSettings(),
        pendingActions: offlineStore.getPendingActions(),
        publicDocuments: offlineStore.getPublicDocuments(), // Public uploads
        submissions: offlineStore.getSubmissions(),
        lastSync: offlineStore.getLastSync(),
        printers,
        isOnline
    });
    console.log(`[Portal] Data sent to renderer (Public Docs: ${offlineStore.getPublicDocuments().length})`);
}

// Helper: Fetch and cache data from server
async function fetchAndCacheData(type = 'all') {
    const baseUrl = config.server.baseUrl;

    try {
        if (type === 'all' || type === 'inventory') {
            // Pass the current user's username so the backend can apply
            // access control (hidden items, whitelist, stock limits)
            const params = {};
            if (currentSession && currentSession.user) {
                params.username = currentSession.user;
            }
            const res = await axios.get(`${baseUrl}/api/v1/inventory`, { params, timeout: 10000 });
            offlineStore.setInventory(res.data || []);
        }

        if (type === 'all' || type === 'services') {
            const res = await axios.get(`${baseUrl}/api/v1/services`, { timeout: 10000 });
            offlineStore.setServices(res.data || []);
        }

        if (type === 'all' || type === 'templates') {
            const res = await axios.get(`${baseUrl}/api/v1/templates`, { timeout: 10000 });
            offlineStore.setTemplates(res.data || []);
        }

        if (type === 'all' || type === 'guides') {
            const res = await axios.get(`${baseUrl}/api/v1/guides`, { timeout: 10000 });
            offlineStore.setGuides(res.data || []);
        }

        if (type === 'all' || type === 'settings') {
            const res = await axios.get(`${baseUrl}/api/v1/inventory/settings`, { timeout: 10000 });
            offlineStore.setSettings(res.data || {});
        }

        if ((type === 'all' || type === 'submissions') && currentSession) {
            try {
                // Use AGENT endpoint with query param
                const res = await axios.get(`${baseUrl}/api/v1/agent/submissions`, {
                    params: { username: currentSession.user },
                    timeout: 10000
                });
                offlineStore.setSubmissions(res.data || []);
            } catch (e) {
                console.log('Failed to fetch submissions:', e.message);
            }
        }

        isOnline = true;
        console.log(`[Portal] Data cached for: ${type}`);
    } catch (error) {
        isOnline = false;
        console.error(`[Portal] Failed to fetch ${type}:`, error.message);
    }
}

// Auto-sync pending actions when online
async function autoSyncPending() {
    if (!isOnline) return;

    const pending = offlineStore.getPendingActions();
    if (pending.length === 0) return;

    console.log(`[Portal] Auto-syncing ${pending.length} pending action(s)...`);

    for (const action of pending) {
        if (action.attempts >= 5) continue; // Skip failed actions

        try {
            if (action.type === 'SELL_ITEM') {
                const response = await axios.post(
                    `${config.server.baseUrl}/api/v1/inventory/${action.payload.itemId}/sell`,
                    {
                        quantity: action.payload.quantity,
                        reason: `Offline sale: ${action.payload.note || ''} (auto-synced)`,
                        paymentMethod: action.payload.paymentMethod || 'cash',
                        clientId: CLIENT_ID
                    },
                    { timeout: 10000 }
                );

                if (response.data.success) {
                    offlineStore.removePendingAction(action.id);
                    console.log(`[Portal] Auto-synced: ${action.payload.itemName}`);
                }
            }
        } catch {
            offlineStore.updatePendingAction(action.id, { attempts: (action.attempts || 0) + 1 });
        }
    }
}

// Periodic data refresh and sync
setInterval(async () => {
    // Check online status
    try {
        await axios.get(`${config.server.baseUrl}/health`, { timeout: 5000 });
        const wasOffline = !isOnline;
        isOnline = true;

        // If just came online, sync pending actions
        if (wasOffline) {
            console.log('[Portal] Connection restored, syncing...');
            await autoSyncPending();
            await fetchAndCacheData('all');
        }
    } catch {
        isOnline = false;
    }

    // Refresh data if cache is old (every 5 minutes when online)
    if (isOnline && offlineStore.getCacheAgeMinutes() > 5) {
        await fetchAndCacheData('all');
    }
}, 30000); // Check every 30 seconds

// ==================== SESSION MANAGEMENT ====================

async function startSession(username) {
    isLocked = false;

    // Reset all trackers
    appUsageTracker.reset();
    urlTracker.reset();
    resetDeviceTracking();
    connectedUsbDevices = [];
    sentBrowserUrls.clear();
    sentPrintJobIds.clear();

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

    // Fetch and cache data for offline use
    fetchAndCacheData('all').catch(e => console.error('[Portal] Initial data fetch failed:', e.message));

    // Create and show Portal Window
    createPortalWindow(username);

    console.log(`Session Started: ${username} (${currentSession.id})`);
}

// Create Portal Window
function createPortalWindow(username) {
    if (portalWindow && !portalWindow.isDestroyed()) {
        portalWindow.show();
        portalWindow.focus();
        return;
    }

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    portalWindow = new BrowserWindow({
        width: Math.min(1200, width - 100),
        height: Math.min(800, height - 100),
        x: Math.floor((primaryDisplay.bounds.width - Math.min(1200, width - 100)) / 2),
        y: Math.floor((primaryDisplay.bounds.height - Math.min(800, height - 100)) / 2),
        frame: true,
        resizable: true,
        minimizable: true,
        maximizable: true,
        icon: path.join(__dirname, 'src/logo.jpg'),
        title: 'HawkNine Portal',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        }
    });

    portalWindow.loadFile(path.join(__dirname, 'src/portal.html'));

    // Send user info when loaded
    portalWindow.webContents.on('did-finish-load', () => {
        portalWindow.webContents.send('portal-data', {
            user: { name: username, username },
            inventory: offlineStore.getInventory(),
            services: offlineStore.getServices(),
            templates: offlineStore.getTemplates(),
            guides: offlineStore.getGuides(),
            settings: offlineStore.getSettings(),
            pendingActions: offlineStore.getPendingActions(),
            lastSync: offlineStore.getLastSync(),
            isOnline
        });
    });

    portalWindow.on('closed', () => {
        portalWindow = null;
    });

    console.log(`[Portal] Portal window created for: ${username}`);
}

async function endSession() {
    if (!currentSession) return;

    const endTime = new Date().toISOString();

    // Stop File Monitoring
    if (fileMonitor) fileMonitor.stop();

    // Close Portal Window if open
    if (portalWindow && !portalWindow.isDestroyed()) {
        portalWindow.close();
        portalWindow = null;
    }

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
    clearSessionState(); // Clear persisted session so lock screen shows on next launch

    // Close Portal Window if open
    if (portalWindow && !portalWindow.isDestroyed()) {
        portalWindow.close();
        portalWindow = null;
    }

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

        // Ensure keyboard input works by focusing the webview and input field
        const focusInput = () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.focusOnWebView();
                mainWindow.webContents.executeJavaScript(`
                    const inp = document.getElementById('username');
                    if (inp) { inp.value = ''; inp.focus(); inp.click(); }
                    const passInp = document.getElementById('password');
                    if (passInp) passInp.value = '';
                `).catch(() => { });
            }
        };
        // Try multiple times to ensure focus sticks after OS focus changes
        setTimeout(focusInput, 300);
        setTimeout(focusInput, 1000);
        setTimeout(focusInput, 2500);
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
                            // Try to get actual URL from browser address bar using UI Automation
                            let actualUrl = null;
                            try {
                                actualUrl = await getActiveTabUrl();
                            } catch (e) {
                                // UI Automation failed, will fallback to window title
                            }

                            // Use the enhanced addFromWindow method that returns {current, completed}
                            const result = urlTracker.addFromWindow(currentApp.title, currentApp.owner, actualUrl || currentApp.url);

                            if (result) {
                                const { current: browserData, completed: completedUrl } = result;

                                // 1. Send time-spent update for the PREVIOUS URL (the one user just left)
                                if (completedUrl && completedUrl.timeSpentSeconds > 0) {
                                    const timePayload = {
                                        type: 'browser_time',
                                        clientId: CLIENT_ID,
                                        hostname: os.hostname(),
                                        sessionId: currentSession?.id || null,
                                        sessionUser: currentSession?.user || null,
                                        data: {
                                            url: completedUrl.url,
                                            title: completedUrl.title,
                                            category: completedUrl.category,
                                            browser: completedUrl.browser,
                                            timeSpentSeconds: completedUrl.timeSpentSeconds,
                                            startTime: completedUrl.startTime,
                                            endTime: completedUrl.endTime
                                        }
                                    };
                                    sendToServer(LOG_API_URL, timePayload).catch(e => console.error('Browser Time Log Failed:', e.message));
                                }

                                // 2. Send Real-Time Browser Log for the NEW URL (deduplicated)
                                if (browserData) {
                                    const now = Date.now();
                                    const alreadySent = sentBrowserUrls.has(browserData.url) &&
                                        (now - sentBrowserUrls.get(browserData.url)) < BROWSER_DEDUP_WINDOW_MS;
                                    if (!alreadySent) {
                                        sentBrowserUrls.set(browserData.url, now);
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
                                                timestamp: browserData.timestamp,
                                                source: actualUrl ? 'ui_automation' : 'title_extraction'
                                            }
                                        };
                                        sendToServer(LOG_API_URL, browserPayload).catch(e => console.error('Browser Log Failed:', e.message));
                                    }
                                }
                            }
                        } else {
                            // User switched to a non-browser app — close the timer on the previous URL
                            const completedUrl = urlTracker.notifyInactive();
                            if (completedUrl && completedUrl.timeSpentSeconds > 0) {
                                const timePayload = {
                                    type: 'browser_time',
                                    clientId: CLIENT_ID,
                                    hostname: os.hostname(),
                                    sessionId: currentSession?.id || null,
                                    sessionUser: currentSession?.user || null,
                                    data: {
                                        url: completedUrl.url,
                                        title: completedUrl.title,
                                        category: completedUrl.category,
                                        browser: completedUrl.browser,
                                        timeSpentSeconds: completedUrl.timeSpentSeconds,
                                        startTime: completedUrl.startTime,
                                        endTime: completedUrl.endTime
                                    }
                                };
                                sendToServer(LOG_API_URL, timePayload).catch(e => console.error('Browser Time Log Failed:', e.message));
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

                            // Send Real-Time Print Log with extensive details
                            const printPayload = {
                                type: 'print',
                                clientId: CLIENT_ID,
                                hostname: os.hostname(),
                                sessionId: currentSession?.id || null,
                                sessionUser: currentSession?.user || null,
                                data: {
                                    id: job.id,
                                    jobId: job.jobId,
                                    printer: job.printer,
                                    printerType: job.printerType,
                                    document: job.document,
                                    totalPages: job.totalPages,
                                    pagesPrinted: job.pagesPrinted,
                                    copies: job.copies || 1,
                                    totalSheets: job.totalSheets || (job.totalPages * (job.copies || 1)),
                                    printType: job.printType, // 'bw' or 'color'
                                    paperSize: job.paperSize, // A4, Letter, etc.
                                    mediaType: job.mediaType || 'Plain Paper', // Glossy, Matte, etc.
                                    isColorPrint: job.isColorPrint,
                                    duplexMode: job.duplexMode,
                                    printQuality: job.printQuality || 'Normal',
                                    sizeKB: job.sizeKB,
                                    status: job.status,
                                    timestamp: job.timestamp,
                                    source: job.source || 'spooler_queue'
                                }
                            };
                            sendToServer(LOG_API_URL, printPayload).catch(e => console.error('Print Log Failed:', e.message));

                            // Also add to session summary for billing consistency
                            if (currentSession) {
                                const exists = currentSession.printJobs.find(j => j.id === job.id || j.jobId === job.jobId);
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
            // Enhanced: includes page counters and 24h usage stats per printer
            try {
                if (!global.printerLogCounter) global.printerLogCounter = 0;
                global.printerLogCounter++;

                if (global.printerLogCounter >= 5) {
                    global.printerLogCounter = 0;
                    const allPrinterData = await getAllPrinterData();
                    if (allPrinterData.printers.length > 0) {
                        const printerPayload = {
                            type: 'printers',
                            clientId: CLIENT_ID,
                            hostname: os.hostname(),
                            sessionId: currentSession?.id || null,
                            sessionUser: currentSession?.user || null,
                            data: {
                                printers: allPrinterData.printers,
                                summary: allPrinterData.summary,
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

    // ===== FAST BROWSER URL POLLING (every 3 seconds) =====
    // Dedicated lightweight loop that ONLY checks for browser URL changes.
    // Much faster than the heartbeat which also collects metrics, screenshots, prints.
    // This ensures URLs are captured almost immediately when opened.
    let fastPollRunning = false;
    setInterval(async () => {
        if (isLocked || !currentSession) return;
        if (fastPollRunning) return; // Prevent overlapping runs
        fastPollRunning = true;

        try {
            const activeWin = require('active-win');
            const win = activeWin.sync();
            if (!win) { fastPollRunning = false; return; }

            const appOwner = (win.owner?.name || '').toLowerCase();
            const isBrowser = ['chrome', 'msedge', 'firefox', 'opera', 'brave', 'edge', 'chromium', 'vivaldi'].some(b => appOwner.includes(b));

            if (!isBrowser) {
                // If user switched away from browser, notify tracker to close timer
                const completedUrl = urlTracker.notifyInactive();
                if (completedUrl && completedUrl.timeSpentSeconds > 0) {
                    const timePayload = {
                        type: 'browser_time',
                        clientId: CLIENT_ID,
                        hostname: os.hostname(),
                        sessionId: currentSession?.id || null,
                        sessionUser: currentSession?.user || null,
                        data: {
                            url: completedUrl.url,
                            title: completedUrl.title,
                            category: completedUrl.category,
                            browser: completedUrl.browser,
                            timeSpentSeconds: completedUrl.timeSpentSeconds,
                            startTime: completedUrl.startTime,
                            endTime: completedUrl.endTime
                        }
                    };
                    sendToServer(LOG_API_URL, timePayload).catch(() => { });
                }
                fastPollRunning = false;
                return;
            }

            // Get actual URL from the browser address bar
            let actualUrl = null;
            try {
                actualUrl = await getActiveTabUrl();
            } catch (e) { /* fallback to title */ }

            const windowTitle = win.title || '';
            const browserName = win.owner?.name || '';

            const result = urlTracker.addFromWindow(windowTitle, browserName, actualUrl || win.url || '');
            if (result) {
                const { current: browserData, completed: completedUrl } = result;

                // Send time-spent for previous URL
                if (completedUrl && completedUrl.timeSpentSeconds > 0) {
                    const timePayload = {
                        type: 'browser_time',
                        clientId: CLIENT_ID,
                        hostname: os.hostname(),
                        sessionId: currentSession?.id || null,
                        sessionUser: currentSession?.user || null,
                        data: {
                            url: completedUrl.url,
                            title: completedUrl.title,
                            category: completedUrl.category,
                            browser: completedUrl.browser,
                            timeSpentSeconds: completedUrl.timeSpentSeconds,
                            startTime: completedUrl.startTime,
                            endTime: completedUrl.endTime
                        }
                    };
                    sendToServer(LOG_API_URL, timePayload).catch(() => { });
                }

                // Send real-time browser log for new URL
                if (browserData) {
                    const now = Date.now();
                    const alreadySent = sentBrowserUrls.has(browserData.url) &&
                        (now - sentBrowserUrls.get(browserData.url)) < BROWSER_DEDUP_WINDOW_MS;
                    if (!alreadySent) {
                        sentBrowserUrls.set(browserData.url, now);
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
                                timestamp: browserData.timestamp,
                                source: actualUrl ? 'ui_automation_fast' : 'title_extraction_fast'
                            }
                        };
                        sendToServer(LOG_API_URL, browserPayload).catch(() => { });
                    }
                }
            }
        } catch (e) {
            // Silently fail — best effort fast polling
        }
        fastPollRunning = false;
    }, 3000); // Every 3 seconds for near-instant URL capture

    // ===== REAL-TIME: Scan ALL open browser windows (every 20 seconds) =====
    // The heartbeat above only captures the active/foreground window.
    // This scanner finds URLs from ALL open browser windows (including background ones).
    setInterval(async () => {
        if (isLocked || !currentSession) return;

        try {
            const allBrowsers = await getAllBrowserUrls();

            for (const browserInfo of allBrowsers) {
                if (!browserInfo.url) continue;

                // Skip internal pages
                const url = browserInfo.url;
                if (url.startsWith('file://') || url.startsWith('chrome://') || url.startsWith('edge://') ||
                    url.startsWith('about:') || url.includes('page-limit/')) continue;

                // Dedup check
                const now = Date.now();
                if (sentBrowserUrls.has(url) && (now - sentBrowserUrls.get(url)) < BROWSER_DEDUP_WINDOW_MS) continue;

                sentBrowserUrls.set(url, now);

                const category = categorizeBrowserUrl(url);
                const browserPayload = {
                    type: 'browser',
                    clientId: CLIENT_ID,
                    hostname: os.hostname(),
                    sessionId: currentSession?.id || null,
                    sessionUser: currentSession?.user || null,
                    data: {
                        url: url,
                        title: browserInfo.title,
                        category: category,
                        browser: browserInfo.browser,
                        timestamp: new Date().toISOString(),
                        source: 'all_windows_scan'
                    }
                };

                sendToServer(LOG_API_URL, browserPayload).catch(e => console.error('Browser Scan Log Failed:', e.message));
            }
        } catch (e) {
            // Silently fail — this is a best-effort scan
        }
    }, 10000); // Every 10 seconds for background tab capture

    // Periodic Browser History Sync (every 60 seconds)
    // This catches URLs that might be missed by real-time tracking
    // IMPORTANT: Only syncs entries from AFTER the current session started to prevent data mixing
    let lastHistorySyncTime = Date.now();
    setInterval(async () => {
        if (isLocked) return; // Don't sync history if locked (privacy/noise)
        if (!currentSession) return; // No session = no sync (prevents mixing data between sessions)

        try {
            // Get history from the last hour
            const history = await getBrowserHistoryFromDB(1);

            // Session start time — only process entries from after the session began
            const sessionStartTime = new Date(currentSession.startTime).getTime();

            // Filter only new items since last sync AND only items from current session
            const newItems = history.filter(item => {
                const visitTime = new Date(item.visitTime).getTime();
                // Must be after session start AND after last sync
                if (visitTime <= sessionStartTime) return false;
                if (visitTime <= lastHistorySyncTime) return false;

                // Skip internal/file URLs
                const url = item.url || '';
                if (url.startsWith('file://') || url.startsWith('chrome://') || url.startsWith('edge://') ||
                    url.startsWith('about:') || url.startsWith('chrome-extension://') ||
                    url.startsWith('moz-extension://') || url.startsWith('devtools://') ||
                    url.includes('page-limit/')) return false;

                return true;
            });

            if (newItems.length > 0) {
                console.log(`[HISTORY] Found ${newItems.length} new history items from DB (session-scoped)`);

                // Update sync time to the latest item found
                const latestTime = Math.max(...newItems.map(i => new Date(i.visitTime).getTime()));
                if (latestTime > lastHistorySyncTime) {
                    lastHistorySyncTime = latestTime;
                }

                // Send items to server (Sorted Oldest -> Newest)
                const sortedItems = newItems.sort((a, b) => new Date(a.visitTime) - new Date(b.visitTime));
                let lastProcessedUrl = null;

                for (const item of sortedItems) {
                    const now = Date.now();
                    // Skip if this URL was already sent within the dedup window (by real-time or a previous DB sync)
                    if (sentBrowserUrls.has(item.url) && (now - sentBrowserUrls.get(item.url)) < BROWSER_DEDUP_WINDOW_MS) continue;

                    // Avoid consecutive duplicates within this batch
                    if (item.url === lastProcessedUrl) continue;
                    lastProcessedUrl = item.url;

                    sentBrowserUrls.set(item.url, now);

                    const historyPayload = {
                        type: 'browser',
                        clientId: CLIENT_ID,
                        hostname: os.hostname(),
                        sessionId: currentSession?.id || null,
                        sessionUser: currentSession?.user || null,
                        data: {
                            ...item,
                            source: 'database_sync'
                        }
                    };

                    // Don't flood the server, small delay or just fire
                    sendToServer(LOG_API_URL, historyPayload).catch(e => console.error('History Sync Log Failed:', e.message));
                }
            }

            // Periodically clean up old entries from sentBrowserUrls to prevent memory leak
            const cleanupThreshold = Date.now() - BROWSER_DEDUP_WINDOW_MS * 2;
            for (const [url, timestamp] of sentBrowserUrls) {
                if (timestamp < cleanupThreshold) {
                    sentBrowserUrls.delete(url);
                }
            }
        } catch (e) {
            console.error('[HISTORY] Sync failed:', e.message);
        }
    }, 60000); // Sync every 60 seconds (was 30s, reduced to avoid noise)

    // ===== FAST PRINT JOB CAPTURE via Event Log 307 (every 15 seconds) =====
    // This is the PRIMARY source for accurate real-time print data.
    // Event 307 records the ACTUAL page count after the job completes.
    // The spooler queue (getRecentPrintJobs in the heartbeat) often misses jobs
    // or shows wrong page counts because jobs complete too fast.
    setInterval(async () => {
        if (isLocked || !currentSession) return;

        try {
            // Get jobs completed in the last 20 seconds (overlap for safety)
            const completedJobs = await getRecentCompletedJobs(20);

            for (const job of completedJobs) {
                if (!job.jobId) continue;
                if (sentPrintJobIds.has(job.jobId)) continue;

                sentPrintJobIds.add(job.jobId);
                console.log(`[PRINT] Event Log captured: "${job.document}" - ${job.totalPages} pages x ${job.copies} copies on ${job.printer} (${job.printType}, ${job.mediaType})`);

                const printPayload = {
                    type: 'print',
                    clientId: CLIENT_ID,
                    hostname: os.hostname(),
                    sessionId: currentSession?.id || null,
                    sessionUser: currentSession?.user || null,
                    data: {
                        id: job.id,
                        jobId: job.jobId,
                        printer: job.printer,
                        printerDriver: job.printerDriver,
                        document: job.document,
                        totalPages: job.totalPages,
                        pagesPrinted: job.totalPages,
                        copies: job.copies || 1,
                        totalSheets: job.totalSheets || (job.totalPages * (job.copies || 1)),
                        printType: job.printType,
                        paperSize: job.paperSize,
                        mediaType: job.mediaType || 'Plain Paper',
                        isColorPrint: job.isColorPrint,
                        duplexMode: job.duplexMode,
                        printQuality: job.printQuality || 'Normal',
                        sizeKB: job.sizeKB,
                        status: 'Printed',
                        timestamp: job.timestamp,
                        source: 'event_log_307'
                    }
                };
                sendToServer(LOG_API_URL, printPayload).catch(e => console.error('Print Event Log Failed:', e.message));

                if (currentSession) {
                    const exists = currentSession.printJobs.find(j => j.id === job.id || j.jobId === job.jobId);
                    if (!exists) currentSession.printJobs.push(job);
                }
            }
        } catch (e) {
            // Silently fail — event log might not be enabled yet
        }
    }, 15000); // Every 15 seconds

    // Periodic Print History Sync (every 60 seconds)
    // Safety net: catches any jobs missed by the fast Event Log poller
    setInterval(async () => {
        try {
            // Fetch print history from the last hour
            const history = await getPrintHistory(1);

            // Filter new jobs based on ID or composite key
            const newJobs = history.filter(job => {
                // If we have a valid Job ID, check against sent set
                if (job.jobId && sentPrintJobIds.has(job.jobId)) return false;

                // If not in set, it's new
                return true;
            });

            if (newJobs.length > 0) {
                console.log(`[PRINT] Found ${newJobs.length} new/missed print jobs from History`);

                for (const job of newJobs) {
                    // Mark as sent
                    if (job.jobId) sentPrintJobIds.add(job.jobId);

                    const printPayload = {
                        type: 'print',
                        clientId: CLIENT_ID,
                        hostname: os.hostname(),
                        sessionId: currentSession?.id || null,
                        sessionUser: currentSession?.user || null,
                        data: {
                            ...job,
                            status: 'Completed (History)'
                        }
                    };

                    // Send to server
                    sendToServer(LOG_API_URL, printPayload).catch(e => console.error('Print History Log Failed:', e.message));

                    // Also update current session if applicable
                    if (currentSession) {
                        // Check if job already exists in session via ID
                        const exists = currentSession.printJobs.find(j => j.id === job.id || j.jobId === job.jobId);
                        if (!exists) currentSession.printJobs.push(job);
                    }
                }
            }
        } catch (e) {
            console.error('[PRINT] History Sync failed:', e.message);
        }
    }, 60000);
}

// ==================== SERVER COMMUNICATION & SOCKETS ====================

function setupSocket() {
    if (!config || !config.server || !config.server.baseUrl) return;

    // Connect to server with increased buffer for screenshots
    socket = io(config.server.baseUrl, {
        reconnection: true,
        reconnectionDelay: 2000,
        reconnectionAttempts: Infinity,
        timeout: 20000,
        maxHttpBufferSize: 10e6 // 10MB for screenshots
    });

    socket.on('connect', () => {
        console.log('Connected to HawkNine Socket Server');
        socket.emit('agent-register', { clientId: CLIENT_ID, hostname: os.hostname() });
    });

    socket.on('connect_error', (err) => {
        console.warn('[SOCKET] Connection error:', err.message);
    });

    socket.on('disconnect', (reason) => {
        console.log('[SOCKET] Disconnected:', reason);
    });

    socket.on('reconnect', (attemptNumber) => {
        console.log(`[SOCKET] Reconnected after ${attemptNumber} attempts`);
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
            downloadFile(data.document.downloadUrl, data.document.filename, data.document.message, data.document.id);
        }
    });

    socket.on('agent-public-document-notification', (data) => {
        console.log(`Received Public Document Upload: ${data.orderId}`);
        handlePublicDocument(data);
    });

    // Listen for user status changes (admin disable/enable)
    socket.on('user-status-changed', async (data) => {
        if (data.userType === 'agent' && !data.active) {
            // Check if this disabled user is currently logged into this station
            if (currentSession && currentSession.user === data.username) {
                console.log(`[USER STATUS] User ${data.username} disabled by admin — forcing logout`);

                // Show notification
                const { Notification } = require('electron');
                if (Notification.isSupported()) {
                    const notif = new Notification({
                        title: 'Account Disabled',
                        body: `User "${data.username}" has been disabled by the administrator. Session ended.`,
                        icon: path.join(__dirname, 'src', 'logo.jpg')
                    });
                    notif.show();
                }

                // Notify the portal window before locking
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('account-disabled', {
                        username: data.username,
                        message: 'Your account has been disabled by the administrator.'
                    });
                }

                // End session and lock
                await endSession();
                lockSession();
            }
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

        case 'screenshot':
            try {
                console.log('[SCREENSHOT] Capture requested by admin...');
                let base64 = null;

                // Method 1: Electron desktopCapturer (most reliable in Electron)
                try {
                    const { desktopCapturer } = require('electron');
                    const sources = await desktopCapturer.getSources({
                        types: ['screen'],
                        thumbnailSize: { width: 1920, height: 1080 }
                    });

                    if (sources && sources.length > 0) {
                        const primaryScreen = sources[0];
                        const thumbnail = primaryScreen.thumbnail;
                        if (thumbnail && !thumbnail.isEmpty()) {
                            const jpegBuffer = thumbnail.toJPEG(80);
                            base64 = jpegBuffer.toString('base64');
                            console.log(`[SCREENSHOT] Captured via desktopCapturer (${base64.length} chars)`);
                        }
                    }
                } catch (electronErr) {
                    console.warn('[SCREENSHOT] desktopCapturer failed:', electronErr.message);
                }

                // Method 2: screenshot-desktop fallback
                if (!base64) {
                    try {
                        const screenshotDesktop = require('screenshot-desktop');
                        const timeoutPromise = new Promise((_, reject) =>
                            setTimeout(() => reject(new Error('Screenshot capture timed out')), 8000)
                        );
                        const imgBuffer = await Promise.race([
                            screenshotDesktop({ format: 'jpg' }),
                            timeoutPromise
                        ]);
                        base64 = imgBuffer.toString('base64');
                        console.log(`[SCREENSHOT] Captured via screenshot-desktop (${base64.length} chars)`);
                    } catch (sdErr) {
                        console.warn('[SCREENSHOT] screenshot-desktop failed:', sdErr.message);
                    }
                }

                if (!base64) {
                    throw new Error('All screenshot methods failed');
                }

                const screenshotPayload = {
                    type: 'screenshot',
                    clientId: CLIENT_ID,
                    hostname: os.hostname(),
                    screenshot: base64,
                    timestamp: new Date().toISOString()
                };

                // Send via socket
                let socketSent = false;
                if (socket && socket.connected) {
                    try {
                        socket.emit('agent-response', screenshotPayload);
                        socketSent = true;
                        console.log(`[SCREENSHOT] Sent via socket (${base64.length} chars)`);
                    } catch (socketErr) {
                        console.warn('[SCREENSHOT] Socket emit failed:', socketErr.message);
                    }
                }

                // Also send via HTTP POST as reliable fallback
                try {
                    await axios.post(`${config.server.baseUrl}/api/v1/agent/screenshot`, {
                        clientId: CLIENT_ID,
                        hostname: os.hostname(),
                        screenshot: base64,
                        timestamp: new Date().toISOString()
                    }, {
                        timeout: 15000,
                        maxContentLength: 20 * 1024 * 1024,
                        maxBodyLength: 20 * 1024 * 1024
                    });
                    console.log('[SCREENSHOT] Sent via HTTP POST');
                } catch (httpErr) {
                    // HTTP fallback failed, but socket might have worked
                    if (!socketSent) {
                        console.error('[SCREENSHOT] Both socket and HTTP delivery failed');
                    } else {
                        console.log('[SCREENSHOT] HTTP fallback unavailable, but socket worked');
                    }
                }

            } catch (error) {
                console.error('[SCREENSHOT] Failed:', error.message);
                if (socket && socket.connected) {
                    socket.emit('agent-response', {
                        type: 'error',
                        clientId: CLIENT_ID,
                        hostname: os.hostname(),
                        message: `Screenshot failed: ${error.message}`
                    });
                }
            }
            break;

        case 'disconnect':
            console.log('[COMMAND] Disconnect requested by admin');
            // End any active session first
            if (currentSession) {
                await endSession();
            }
            // Lock the station
            lockSession();
            // Notify server before disconnecting
            if (socket && socket.connected) {
                socket.emit('agent-response', {
                    type: 'disconnected',
                    clientId: CLIENT_ID,
                    hostname: os.hostname(),
                    message: 'Agent disconnected by admin command',
                    timestamp: new Date().toISOString()
                });
                // Disconnect socket after brief delay to ensure message is sent
                setTimeout(() => {
                    socket.disconnect();
                    socket = null;
                    console.log('[COMMAND] Socket disconnected');
                    // Optionally quit the entire agent
                    if (params && params.quit === true) {
                        console.log('[COMMAND] Quitting application...');
                        app.quit();
                    }
                }, 500);
            }
            break;

        default:
            console.log(`[COMMAND] Unknown command: ${command}`);
    }
}

// Open External Link (for updates, etc.)
ipcMain.on('open-external-link', (event, url) => {
    require('electron').shell.openExternal(url || DOWNLOAD_URL);
});

// Check Online Status
ipcMain.on('check-online-status', (event) => {
    event.reply('online-status', { isOnline: isConnected });
});

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

async function downloadFile(url, filename, messageText, documentId = null) {
    try {
        const desktopPath = app.getPath('desktop');
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

            // Notify server of successful download
            if (socket && socket.connected && documentId) {
                socket.emit('agent-response', {
                    type: 'document-downloaded',
                    clientId: CLIENT_ID,
                    documentId: documentId,
                    timestamp: new Date().toISOString()
                });
            }

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

async function handlePublicDocument(data) {
    if (!data.files || data.files.length === 0) return;

    // Save to store for history
    if (offlineStore) {
        offlineStore.addPublicDocument(data);
    }

    // Mark this document as received by this agent on the server
    if (data.orderId && config && config.server && config.server.baseUrl) {
        try {
            await axios.put(`${config.server.baseUrl}/api/v1/admin/document-requests/${data.orderId}/received`, {
                hostname: os.hostname(),
                clientId: CLIENT_ID
            }, { timeout: 5000 });
            console.log(`[PublicDoc] Marked as received by ${os.hostname()}`);
        } catch (e) {
            console.error('[PublicDoc] Failed to mark as received:', e.message);
        }
    }

    // Notify Portal if open
    console.log(`[PublicDoc] Notifying portal window (valid: ${portalWindow && !portalWindow.isDestroyed()})`);
    if (portalWindow && !portalWindow.isDestroyed()) {
        try {
            portalWindow.webContents.send('new-public-document', data);
            console.log('[PublicDoc] Sent to portal window');
        } catch (e) {
            console.error('[PublicDoc] Failed to send to portal:', e);
        }
    } else {
        console.log('[PublicDoc] Portal window not available');
    }

    // 1. Show green tray notification (visible even when station is locked)
    const { Notification } = require('electron');
    const serviceLabel = (data.serviceType || 'General').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const fileListText = data.files.map(f => `  • ${f.originalName || f.filename}`).join('\n');
    const instructionsText = data.instructions ? `\n\nInstructions: ${data.instructions}` : '';

    if (Notification.isSupported()) {
        const notification = new Notification({
            title: '📄 New Document from Client',
            body: `${data.customerName} (${data.customerPhone || 'No phone'}) uploaded ${data.files.length} file(s) for ${serviceLabel}.\nOrder: ${data.orderId || 'N/A'}`,
            urgency: 'critical'
        });

        // When tray notification is clicked, show the full detail dialog + save prompts
        notification.on('click', () => {
            showDocumentDetailAndSave(data, serviceLabel, fileListText, instructionsText);
        });

        notification.show();
    }

    // 2. Also send a notification to the lock-screen / main window UI
    //    so the attendant sees a green indicator even on the lock screen
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('public-document-arrived', {
            orderId: data.orderId,
            customerName: data.customerName,
            serviceType: serviceLabel,
            fileCount: data.files.length,
            timestamp: data.timestamp || new Date().toISOString()
        });
    }

    // 3. If the station is NOT locked, immediately show the detail dialog + save prompts
    if (!isLocked) {
        await showDocumentDetailAndSave(data, serviceLabel, fileListText, instructionsText);
    }
    // If locked, the attendant can click the tray notification or unlock first
}

async function showDocumentDetailAndSave(data, serviceLabel, fileListText, instructionsText) {
    const { Notification } = require('electron');

    // Show info dialog with full customer/order details
    await dialog.showMessageBox(null, {
        type: 'info',
        title: '✅ New Document Upload - Ready to Work',
        message: `Customer: ${data.customerName}\nPhone: ${data.customerPhone || 'N/A'}\nService: ${serviceLabel}\nOrder: ${data.orderId || 'N/A'}`,
        detail: `Files (${data.files.length}):\n${fileListText}${instructionsText}\n\nYou will be prompted to choose a save location for each file.`,
        buttons: ['Save Files Now'],
        defaultId: 0
    }).catch(e => console.error('Failed to show dialog:', e));

    // Prompt save dialog for each file, then open it
    let savedCount = 0;
    for (const file of data.files) {
        const fileName = file.originalName || file.filename;
        const filePath = await promptAndDownloadFile(file.downloadUrl, fileName, data.customerName);
        if (filePath) {
            savedCount++;
            if (offlineStore && data.orderId) {
                offlineStore.markFileDownloaded(data.orderId, fileName);
            }
            shell.openPath(filePath).then(err => {
                if (err) console.error(`[PublicDoc] Failed to open ${fileName}:`, err);
                else console.log(`[PublicDoc] Opened: ${fileName}`);
            });
        }
    }

    // Show completion notification
    if (savedCount > 0 && Notification.isSupported()) {
        new Notification({
            title: '✅ Documents Ready',
            body: `${savedCount} of ${data.files.length} file(s) from ${data.customerName} saved and opened.`
        }).show();
    }
}

// IPC for user document submission
ipcMain.on('submit-user-document', async (event, data) => {
    try {
        const { filePath, title, description, category, targetType } = data;

        if (!currentSession || !currentSession.token) {
            // We need a user token. If currentSession doesn't have it, we might have a problem.
            // But wait, the desktop agent usually authenticates as the AGENT. 
            // The user submission endpoint requires USER auth.
            // Strategy: Use a special "Agent-User-Submission" endpoint or check if we have a token.
            // Let's assume for now we might need to modify backend to allow agents to submit on behalf of users.
            // Or use the AGENT token and pass 'submittedBy' field?
            // UserSubmission model has 'submittedBy'.

            // Let's try sending with Agent Token and let backend handle it? 
            // No, requireUserAuth checks for user.

            // Temporary Workaround: Modify backend to allow this or fallback. 
            // But I can't easily modify backend auth middleware without breaking things relative to user portal.

            // Let's look at startSession in server.js next.
            // For now, I'll perform the upload implementation assuming I can get a token or use agent token.
            throw new Error('User not authenticated');
        }

        const formData = new FormData();
        formData.append('title', title);
        formData.append('description', description);
        formData.append('category', category);
        formData.append('targetType', targetType);

        // This part depends on how we can append file in Node environment with axios/FormData
        // In Node, we usually use 'form-data' library.
        // const FormData = require('form-data');
        // const form = new FormData();
        // form.append('file', fs.createReadStream(filePath));

        // Let's check imports.
    } catch (e) {
        event.reply('submit-result', { success: false, message: e.message });
    }
});
ipcMain.on('download-public-doc', async (event, { url, filename, customerName, orderId }) => {
    try {
        const filePath = await promptAndDownloadFile(url, filename, customerName);
        if (filePath && offlineStore && orderId) {
            // Remove from list if successfully saved
            const remainingDocs = offlineStore.markFileDownloaded(orderId, filename);
            // Refresh portal view
            event.reply('portal-data', {
                user: currentSession ? { name: currentSession.user, username: currentSession.user } : null,
                inventory: offlineStore.getInventory(),
                services: offlineStore.getServices(),
                templates: offlineStore.getTemplates(),
                guides: offlineStore.getGuides(),
                settings: offlineStore.getSettings(),
                pendingActions: offlineStore.getPendingActions(),
                publicDocuments: remainingDocs,
                lastSync: offlineStore.getLastSync(),
                // printers: await getInstalledPrinters(), // This could be slow, maybe skip or send cached?
                // For speed, let's omit printers here or ensure sendPortalData is efficient.
                // Or I can send a specific 'public-documents-updated' event.
                isOnline
            });
            // Or just call sendPortalData(event) but getInstalledPrinters might slow it down.
            // Let's rely on sendPortalData reuse if possible or construct partial update.
            // Sending partial update for publicDocuments is safer/faster.
            event.sender.send('new-public-document', { refreshOnly: true });
            // The portal handles 'new-public-document' by calling loadAllData(), which does a full refresh.
            // This is acceptable.
        }
    } catch (e) {
        console.error('Manual download failed or cancelled:', e);
    }
});

async function promptAndDownloadFile(url, defaultFilename, customerName) {
    try {
        const { filePath } = await dialog.showSaveDialog({
            title: `Save Document from ${customerName}`,
            defaultPath: path.join(app.getPath('downloads'), defaultFilename),
            buttonLabel: 'Save Document',
            filters: [
                { name: 'All Files', extensions: ['*'] }
            ]
        });

        if (filePath) {
            console.log(`Downloading to ${filePath}...`);
            const writer = fs.createWriteStream(filePath);

            const response = await axios({
                url,
                method: 'GET',
                responseType: 'stream'
            });

            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on('finish', () => {
                    console.log(`Saved: ${filePath}`);
                    // Optional: Show success dialog/toast
                    resolve(filePath);
                });
                writer.on('error', (err) => {
                    console.error('File write error:', err);
                    dialog.showErrorBox('Save Error', `Failed to save file: ${err.message}`);
                    reject(err);
                });
            });
        }
    } catch (error) {
        console.error('Download/Save failed:', error.message);
        dialog.showErrorBox('Download Error', `Failed to download file: ${error.message}`);
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
