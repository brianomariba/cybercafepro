/**
 * HawkNine Self-Hosted WhatsApp Service
 * Uses Baileys (WhatsApp Web API) for direct WhatsApp messaging
 * No 3rd-party APIs, no rate limits, no IP blocking
 */

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const pino = require('pino');

// Auth credentials storage path
const AUTH_DIR = path.join(__dirname, 'whatsapp_auth');

// Module state
let sock = null;
let currentQR = null;
let connectionStatus = 'disconnected'; // disconnected | qr_ready | connecting | connected
let linkedPhone = null;
let retryCount = 0;
const MAX_RETRIES = 5;
let reconnectTimeout = null;

// Silent logger for Baileys (it's very chatty)
const logger = pino({ level: 'silent' });

/**
 * Initialize the WhatsApp connection
 * Call this once on server startup
 */
async function initWhatsApp() {
    try {
        // Ensure auth directory exists
        if (!fs.existsSync(AUTH_DIR)) {
            fs.mkdirSync(AUTH_DIR, { recursive: true });
        }

        // Load or create auth state
        const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

        // Fetch latest Baileys version info
        const { version } = await fetchLatestBaileysVersion();

        console.log('[WHATSAPP] Initializing WhatsApp Web connection...');
        connectionStatus = 'connecting';
        currentQR = null;

        // Create the WhatsApp socket
        sock = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger)
            },
            printQRInTerminal: false, // We handle QR ourselves
            logger,
            browser: ['HawkNine', 'Chrome', '120.0.0'],
            generateHighQualityLinkPreview: false,
            syncFullHistory: false,
            markOnlineOnConnect: false
        });

        // Handle connection updates
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                // New QR code generated — convert to base64 data URL
                try {
                    currentQR = await QRCode.toDataURL(qr, {
                        width: 300,
                        margin: 2,
                        color: {
                            dark: '#000000',
                            light: '#FFFFFF'
                        }
                    });
                    connectionStatus = 'qr_ready';
                    console.log('[WHATSAPP] QR Code generated — waiting for scan...');
                } catch (err) {
                    console.error('[WHATSAPP] Failed to generate QR code:', err.message);
                }
            }

            if (connection === 'close') {
                currentQR = null;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const reason = DisconnectReason;

                if (statusCode === reason.loggedOut) {
                    // User logged out from phone — clear auth and stop
                    console.log('[WHATSAPP] Logged out from WhatsApp. Clearing session...');
                    connectionStatus = 'disconnected';
                    linkedPhone = null;
                    retryCount = 0;
                    await clearAuthState();
                } else if (statusCode === reason.restartRequired) {
                    // Simple restart needed
                    console.log('[WHATSAPP] Restart required, reconnecting...');
                    retryCount = 0;
                    await initWhatsApp();
                } else {
                    // Connection lost — attempt reconnect with backoff
                    retryCount++;
                    if (retryCount <= MAX_RETRIES) {
                        const delay = Math.min(retryCount * 3000, 15000);
                        console.log(`[WHATSAPP] Connection closed (code: ${statusCode}). Retrying in ${delay / 1000}s... (${retryCount}/${MAX_RETRIES})`);
                        connectionStatus = 'connecting';
                        linkedPhone = null;
                        if (reconnectTimeout) clearTimeout(reconnectTimeout);
                        reconnectTimeout = setTimeout(() => initWhatsApp(), delay);
                    } else {
                        console.log('[WHATSAPP] Max retries reached. Stopping reconnection. Re-scan QR from dashboard.');
                        connectionStatus = 'disconnected';
                        linkedPhone = null;
                        retryCount = 0;
                    }
                }
            }

            if (connection === 'open') {
                console.log('[WHATSAPP] ✅ Connected to WhatsApp!');
                connectionStatus = 'connected';
                currentQR = null;
                retryCount = 0;

                // Extract linked phone number from credentials
                if (sock.user) {
                    linkedPhone = sock.user.id.split(':')[0].split('@')[0];
                    console.log(`[WHATSAPP] Linked as: +${linkedPhone}`);
                }
            }
        });

        // Save credentials whenever they update
        sock.ev.on('creds.update', saveCreds);

    } catch (err) {
        console.error('[WHATSAPP] Failed to initialize:', err.message);
        connectionStatus = 'disconnected';
        
        // Retry after delay
        retryCount++;
        if (retryCount <= MAX_RETRIES) {
            const delay = Math.min(retryCount * 5000, 30000);
            console.log(`[WHATSAPP] Will retry initialization in ${delay / 1000}s...`);
            if (reconnectTimeout) clearTimeout(reconnectTimeout);
            reconnectTimeout = setTimeout(() => initWhatsApp(), delay);
        }
    }
}

/**
 * Get current connection status
 * @returns {{ status: string, phone: string|null }}
 */
function getStatus() {
    return {
        status: connectionStatus,
        phone: linkedPhone
    };
}

/**
 * Get QR code as base64 data URL
 * @returns {string|null}
 */
function getQRCode() {
    return currentQR;
}

/**
 * Send a WhatsApp text message
 * @param {string} phone - Phone number with country code (e.g. "254724384646")
 * @param {string} text - Message text
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function sendMessage(phone, text) {
    if (connectionStatus !== 'connected' || !sock) {
        return {
            success: false,
            error: 'WhatsApp is not connected. Please scan the QR code in Settings to link your device.'
        };
    }

    try {
        // Clean up phone number — ensure it's just digits
        let cleanPhone = phone.replace(/[^0-9]/g, '');
        
        // Handle Kenyan numbers
        if (cleanPhone.startsWith('0') && cleanPhone.length === 10) {
            cleanPhone = '254' + cleanPhone.substring(1);
        }
        if (cleanPhone.startsWith('2540')) {
            cleanPhone = '254' + cleanPhone.substring(4);
        }

        // WhatsApp JID format: number@s.whatsapp.net
        const jid = cleanPhone + '@s.whatsapp.net';

        console.log(`[WHATSAPP] Sending message to: +${cleanPhone}`);

        await sock.sendMessage(jid, { text });

        console.log(`[WHATSAPP] ✅ Message sent to +${cleanPhone}`);
        return { success: true, phone: cleanPhone };

    } catch (err) {
        console.error('[WHATSAPP] Failed to send message:', err.message);
        return {
            success: false,
            error: `Failed to send WhatsApp message: ${err.message}`
        };
    }
}

/**
 * Logout — disconnect device and clear auth files
 * @returns {Promise<{success: boolean}>}
 */
async function logout() {
    try {
        if (sock) {
            try {
                await sock.logout();
            } catch (e) {
                // Ignore logout errors
            }
            sock = null;
        }

        await clearAuthState();

        connectionStatus = 'disconnected';
        linkedPhone = null;
        currentQR = null;
        retryCount = 0;
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
        }

        console.log('[WHATSAPP] Logged out and session cleared.');
        return { success: true };
    } catch (err) {
        console.error('[WHATSAPP] Logout error:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Restart WhatsApp connection (e.g. after logout to show new QR)
 */
async function restart() {
    if (sock) {
        try {
            sock.end(undefined);
        } catch (e) { /* ignore */ }
        sock = null;
    }
    retryCount = 0;
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
    }
    await initWhatsApp();
}

/**
 * Clear stored auth state
 */
async function clearAuthState() {
    try {
        if (fs.existsSync(AUTH_DIR)) {
            const files = fs.readdirSync(AUTH_DIR);
            for (const file of files) {
                fs.unlinkSync(path.join(AUTH_DIR, file));
            }
            console.log('[WHATSAPP] Auth state cleared.');
        }
    } catch (err) {
        console.error('[WHATSAPP] Failed to clear auth state:', err.message);
    }
}

module.exports = {
    initWhatsApp,
    getStatus,
    getQRCode,
    sendMessage,
    logout,
    restart
};
