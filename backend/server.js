/**
 * HawkNine Backend API Server v2.0
 * Enhanced with detailed activity tracking, print management, and browser history
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});

// ==================== SECURITY: RATE LIMITING ====================

// Simple in-memory rate limiter
const rateLimitStore = new Map();

const rateLimit = (options = {}) => {
    const windowMs = options.windowMs || 15 * 60 * 1000; // 15 minutes
    const max = options.max || 100;
    const message = options.message || 'Too many requests, please try again later';

    return (req, res, next) => {
        const key = req.ip || req.connection.remoteAddress;
        const now = Date.now();

        if (!rateLimitStore.has(key)) {
            rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
            return next();
        }

        const record = rateLimitStore.get(key);

        if (now > record.resetTime) {
            rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
            return next();
        }

        if (record.count >= max) {
            return res.status(429).json({ error: message });
        }

        record.count++;
        next();
    };
};

// Clean up rate limit store periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of rateLimitStore) {
        if (now > value.resetTime) {
            rateLimitStore.delete(key);
        }
    }
}, 60000); // Every minute

// ==================== AUTHENTICATION SYSTEM ====================

// Admin credentials (in production, store hashed in DB)
// ==================== AUTHENTICATION SYSTEM (OTP) ====================

// Admin Email Configuration
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@hawknine.co.ke'; // Change this!
const OTP_STORE = new Map(); // email -> { otp, expiresAt }

// Email Transporter
const transporter = nodemailer.createTransport({
    service: 'gmail', // Use your email service
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Helper: Generate 6-digit OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// Helper: Send Email
const sendOTPEmail = async (email, otp) => {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.log(`[DEV MODE] OTP for ${email}: ${otp}`);
        return true; // Mock success if no email config
    }

    try {
        await transporter.sendMail({
            from: '"HawkNine Security" <noreply@hawknine.co.ke>',
            to: email,
            subject: 'Your HawkNine Admin Login OTP',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                    <h2 style="color: #00B4D8;">HawkNine Cybercafe Admin</h2>
                    <p>Your One-Time Password (OTP) for login is:</p>
                    <h1 style="font-size: 32px; letter-spacing: 5px; color: #023047;">${otp}</h1>
                    <p>This code expires in 5 minutes.</p>
                    <p>If you did not request this code, please ignore this email.</p>
                </div>
            `
        });
        return true;
    } catch (error) {
        console.error('Email error:', error);
        return false;
    }
};

// Active admin sessions
const adminSessions = new Map();

// User accounts for agents (Cleaned - No demo data)
const agentUsers = new Map();

// Generate secure token
const generateToken = () => crypto.randomBytes(32).toString('hex');

// Hash password (keep for agents)
const hashPassword = (password) => crypto.createHash('sha256').update(password).digest('hex');

// Verify password
const verifyPassword = (password, hash) => hashPassword(password) === hash;

// Auth middleware for admin routes
const requireAdminAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const session = adminSessions.get(token);

    if (!session || Date.now() > session.expiresAt) {
        adminSessions.delete(token);
        return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.admin = session;
    next();
};

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    fileFilter: (req, file, cb) => {
        // Allow common document types
        const allowedTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'text/plain',
            'image/jpeg',
            'image/png',
            'image/gif',
            'application/zip',
            'application/x-rar-compressed'
        ];
        if (allowedTypes.includes(file.mimetype) || file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(null, true); // Allow all for now
        }
    }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(UPLOADS_DIR)); // Serve uploaded files

// Apply rate limiting to all API routes
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));

// Stricter rate limit for auth endpoints
const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Too many login attempts, please try again later'
});



// ==================== IN-MEMORY DATA STORES ====================
// In production, replace these with MongoDB/PostgreSQL

const computers = new Map();          // clientId -> computer status
const sessions = [];                  // All session records
const activityLogs = [];              // Recent activity snapshots
const printJobs = [];                 // All print jobs across all computers
const browserHistory = [];            // Aggregated browser history
const fileActivity = [];              // File creation/modification logs
const usbEvents = [];                 // USB device connection events
const sharedDocuments = [];           // Documents shared between users/admin

// NEW: Task and Service Management
const tasks = [];                     // Admin-defined tasks/activities
const services = [                    // Service catalog with pricing
    { id: 'svc-1', name: 'Computer Usage', category: 'usage', price: 200, unit: 'per_hour', isActive: true },
    { id: 'svc-2', name: 'B&W Printing', category: 'printing', price: 10, unit: 'per_page', isActive: true },
    { id: 'svc-3', name: 'Color Printing', category: 'printing', price: 50, unit: 'per_page', isActive: true },
    { id: 'svc-4', name: 'Document Scanning', category: 'scanning', price: 20, unit: 'per_page', isActive: true },
    { id: 'svc-5', name: 'Photocopying B&W', category: 'photocopy', price: 8, unit: 'per_copy', isActive: true },
    { id: 'svc-6', name: 'Photocopying Color', category: 'photocopy', price: 40, unit: 'per_copy', isActive: true },
    { id: 'svc-7', name: 'Typing Services', category: 'typing', price: 50, unit: 'per_page', isActive: true },
    { id: 'svc-8', name: 'CV Creation', category: 'document', price: 500, unit: 'flat', isActive: true },
    { id: 'svc-9', name: 'Email Setup', category: 'service', price: 200, unit: 'flat', isActive: true },
    { id: 'svc-10', name: 'Internet Browsing', category: 'usage', price: 100, unit: 'per_hour', isActive: true },
];
const users = new Map();              // User accounts (userId -> user data)
const transactions = [];              // Financial transactions

// Pricing configuration (matches admin Settings.jsx)
const pricing = {
    computerUsage: 200,    // KSH per hour
    printBW: 10,           // KSH per page B&W
    printColor: 50,        // KSH per page Color
    scanning: 20,          // KSH per page
    photocopyBW: 8,        // KSH per copy
    photocopyColor: 40     // KSH per copy
};

// ==================== AUTHENTICATION ENDPOINTS ====================

/**
 * POST /api/v1/auth/admin/request-otp
 * Step 1: Request OTP for admin login
 */
app.post('/api/v1/auth/admin/request-otp', authRateLimit, async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        // Verify email matches admin email (simple check for now)
        // In a real app, you'd check a database of admins
        if (email.trim().toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
            console.log(`[AUTH] Unauthorized email attempt: ${email}`);
            // Return specific error for clarity since this is admin portal
            return res.status(401).json({ error: 'Unauthorized email address. Please use the registered admin email.' });
        }

        const otp = generateOTP();
        OTP_STORE.set(email, {
            otp,
            expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes
        });

        const sent = await sendOTPEmail(email, otp);

        if (sent) {
            res.json({ success: true, message: 'OTP sent to email' });
        } else {
            res.status(500).json({ error: 'Failed to send email' });
        }
    } catch (error) {
        console.error('OTP Request Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/v1/auth/admin/verify-otp
 * Step 2: Verify OTP and login
 */
app.post('/api/v1/auth/admin/verify-otp', authRateLimit, (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ error: 'Email and OTP required' });
        }

        const record = OTP_STORE.get(email);

        if (!record) {
            return res.status(400).json({ error: 'No OTP requested for this email' });
        }

        if (Date.now() > record.expiresAt) {
            OTP_STORE.delete(email);
            return res.status(400).json({ error: 'OTP expired' });
        }

        if (record.otp !== otp) {
            return res.status(401).json({ error: 'Invalid OTP' });
        }

        // Success! Clear OTP and generate session
        OTP_STORE.delete(email);

        const token = generateToken();
        const session = {
            username: email.split('@')[0], // Use part before @ as username
            email,
            loginAt: new Date().toISOString(),
            expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
        };
        adminSessions.set(token, session);

        console.log(`Admin login success: ${email}`);

        res.json({
            success: true,
            token,
            user: {
                username: session.username,
                email: session.email,
                role: 'Super Admin'
            },
            expiresIn: 86400
        });

    } catch (error) {
        console.error('OTP Verify Error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

/**
 * POST /api/v1/auth/admin/logout
 * Admin dashboard logout
 */
app.post('/api/v1/auth/admin/logout', (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        adminSessions.delete(token);
    }
    res.json({ success: true });
});

/**
 * GET /api/v1/auth/admin/verify
 * Verify admin token is still valid
 */
app.get('/api/v1/auth/admin/verify', requireAdminAuth, (req, res) => {
    res.json({
        valid: true,
        user: { username: req.admin.username },
        expiresAt: req.admin.expiresAt
    });
});

/**
 * POST /api/v1/auth/agent/login
 * Desktop agent user authentication
 */
app.post('/api/v1/auth/agent/login', authRateLimit, (req, res) => {
    try {
        const { username, password, clientId, hostname } = req.body;

        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Username and password required' });
        }

        // Check if user exists
        const user = agentUsers.get(username);

        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        if (!user.active) {
            return res.status(401).json({ success: false, message: 'Account is disabled' });
        }

        // Verify password
        if (!verifyPassword(password, user.passwordHash)) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        console.log(`Agent user login: ${username} on ${hostname || clientId}`);

        res.json({
            success: true,
            user: {
                username: user.username,
                name: user.name
            }
        });
    } catch (error) {
        console.error('Agent login error:', error);
        res.status(500).json({ success: false, message: 'Authentication failed' });
    }
});

/**
 * POST /api/v1/auth/agent/users
 * Create new agent user (admin only)
 */
app.post('/api/v1/auth/agent/users', requireAdminAuth, (req, res) => {
    try {
        const { username, password, name } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        if (agentUsers.has(username)) {
            return res.status(409).json({ error: 'Username already exists' });
        }

        const newUser = {
            username,
            passwordHash: hashPassword(password),
            name: name || username,
            active: true,
            createdAt: new Date().toISOString()
        };
        agentUsers.set(username, newUser);

        res.json({
            success: true,
            user: { username: newUser.username, name: newUser.name }
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create user' });
    }
});

/**
 * GET /api/v1/auth/agent/users
 * List all agent users (admin only)
 */
app.get('/api/v1/auth/agent/users', requireAdminAuth, (req, res) => {
    const userList = Array.from(agentUsers.values()).map(u => ({
        username: u.username,
        name: u.name,
        active: u.active,
        createdAt: u.createdAt
    }));
    res.json(userList);
});

/**
 * PUT /api/v1/auth/agent/users/:username
 * Update agent user (admin only)
 */
app.put('/api/v1/auth/agent/users/:username', requireAdminAuth, (req, res) => {
    const { username } = req.params;
    const { password, name, active } = req.body;

    const user = agentUsers.get(username);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    if (password) user.passwordHash = hashPassword(password);
    if (name !== undefined) user.name = name;
    if (active !== undefined) user.active = active;

    agentUsers.set(username, user);

    res.json({
        success: true,
        user: { username: user.username, name: user.name, active: user.active }
    });
});

/**
 * DELETE /api/v1/auth/agent/users/:username
 * Delete agent user (admin only)
 */
app.delete('/api/v1/auth/agent/users/:username', requireAdminAuth, (req, res) => {
    const { username } = req.params;

    if (!agentUsers.has(username)) {
        return res.status(404).json({ error: 'User not found' });
    }

    agentUsers.delete(username);
    res.json({ success: true });
});

// ==================== AGENT API ENDPOINTS ====================

/**
 * POST /api/v1/agent/sync
 * Receives heartbeat/status updates from agents
 */
app.post('/api/v1/agent/sync', (req, res) => {
    try {
        const data = req.body;

        if (!data.clientId) {
            return res.status(400).json({ error: 'Missing clientId' });
        }

        // Update computer status
        const existing = computers.get(data.clientId) || {};
        const computerData = {
            ...existing,
            clientId: data.clientId,
            hostname: data.hostname,
            ip: data.ip,
            status: data.status,
            sessionId: data.sessionId,
            sessionUser: data.sessionUser,
            uptime: data.uptime,
            metrics: data.metrics,
            lastSeen: new Date().toISOString(),
            activity: {
                window: data.activity?.window,
                printJobsActive: data.activity?.printJobsActive || 0,
                hasScreenshot: !!data.activity?.screenshot
            }
        };
        computers.set(data.clientId, computerData);

        // Store activity log (without screenshot for size)
        const logEntry = {
            ...data,
            receivedAt: new Date().toISOString(),
            activity: {
                ...data.activity,
                screenshot: data.activity?.screenshot ? '[CAPTURED]' : null
            }
        };
        activityLogs.unshift(logEntry);
        if (activityLogs.length > 2000) activityLogs.pop();

        // Broadcast to admin dashboards
        io.emit('computer-update', computerData);

        // Emit screenshot separately if included
        if (data.activity?.screenshot) {
            io.emit('screenshot-update', {
                clientId: data.clientId,
                hostname: data.hostname,
                screenshot: data.activity.screenshot,
                timestamp: data.timestamp
            });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Sync Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/v1/agent/session
 * Receives session events (LOGIN/LOGOUT) with detailed reports
 */
app.post('/api/v1/agent/session', (req, res) => {
    try {
        const data = req.body;

        if (!data.type || !data.clientId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Calculate session charges if LOGOUT
        let sessionCharges = null;
        if (data.type === 'LOGOUT' && data.durationMinutes) {
            // Calculate computer usage charge
            const usageHours = data.durationMinutes / 60;
            const usageCharge = Math.ceil(usageHours * pricing.computerUsage);

            // Calculate print charges
            let printBWPages = 0;
            let printColorPages = 0;
            if (data.printJobs && data.printJobs.length > 0) {
                for (const job of data.printJobs) {
                    if (job.printType === 'color') {
                        printColorPages += job.totalPages || job.pages || 1;
                    } else {
                        printBWPages += job.totalPages || job.pages || 1;
                    }
                }
            }
            const printBWCharge = printBWPages * pricing.printBW;
            const printColorCharge = printColorPages * pricing.printColor;

            sessionCharges = {
                usage: {
                    hours: parseFloat(usageHours.toFixed(2)),
                    rate: pricing.computerUsage,
                    total: usageCharge
                },
                printing: {
                    bwPages: printBWPages,
                    colorPages: printColorPages,
                    bwRate: pricing.printBW,
                    colorRate: pricing.printColor,
                    bwTotal: printBWCharge,
                    colorTotal: printColorCharge,
                    total: printBWCharge + printColorCharge
                },
                grandTotal: usageCharge + printBWCharge + printColorCharge
            };
        }

        // Store session record
        const sessionRecord = {
            ...data,
            charges: sessionCharges,
            receivedAt: new Date().toISOString()
        };
        sessions.unshift(sessionRecord);
        if (sessions.length > 1000) sessions.pop();

        // Store print jobs from this session
        if (data.printJobs && data.printJobs.length > 0) {
            for (const job of data.printJobs) {
                printJobs.unshift({
                    ...job,
                    clientId: data.clientId,
                    hostname: data.hostname,
                    sessionId: data.sessionId,
                    sessionUser: data.user,
                    receivedAt: new Date().toISOString()
                });
            }
            if (printJobs.length > 500) printJobs.splice(500);
        }

        // Store browser history from this session
        if (data.browsedUrls && data.browsedUrls.length > 0) {
            for (const url of data.browsedUrls) {
                browserHistory.unshift({
                    ...url,
                    clientId: data.clientId,
                    hostname: data.hostname,
                    sessionId: data.sessionId,
                    sessionUser: data.user,
                    receivedAt: new Date().toISOString()
                });
            }
            if (browserHistory.length > 1000) browserHistory.splice(1000);
        }

        // Store file activity from this session
        if (data.filesCreated && data.filesCreated.length > 0) {
            for (const file of data.filesCreated) {
                fileActivity.unshift({
                    ...file,
                    clientId: data.clientId,
                    hostname: data.hostname,
                    sessionId: data.sessionId,
                    sessionUser: data.user,
                    action: 'created',
                    receivedAt: new Date().toISOString()
                });
            }
            if (fileActivity.length > 500) fileActivity.splice(500);
        }

        // Store USB events from this session
        if (data.usbDevicesUsed && data.usbDevicesUsed.length > 0) {
            for (const device of data.usbDevicesUsed) {
                usbEvents.unshift({
                    ...device,
                    clientId: data.clientId,
                    hostname: data.hostname,
                    sessionId: data.sessionId,
                    sessionUser: data.user,
                    receivedAt: new Date().toISOString()
                });
            }
            if (usbEvents.length > 200) usbEvents.splice(200);
        }

        // Broadcast session event to admin
        io.emit('session-event', {
            ...data,
            charges: sessionCharges
        });

        // IMPORTANT: Record session charges as a transaction for revenue tracking
        if (data.type === 'LOGOUT' && sessionCharges && sessionCharges.grandTotal > 0) {
            const sessionTransaction = {
                id: 'txn-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                type: 'session',
                sessionId: data.sessionId,
                description: `Session - ${data.user || 'Guest'} (${Math.round(sessionCharges.usage.hours * 60)} min)`,
                amount: sessionCharges.grandTotal,
                clientId: data.clientId,
                hostname: data.hostname,
                userId: data.user,
                breakdown: {
                    usage: sessionCharges.usage.total,
                    printBW: sessionCharges.printing.bwTotal,
                    printColor: sessionCharges.printing.colorTotal
                },
                createdAt: new Date().toISOString()
            };
            transactions.unshift(sessionTransaction);
            if (transactions.length > 1000) transactions.pop();

            // Emit transaction event
            io.emit('transaction-created', sessionTransaction);
            console.log(`[TRANSACTION] Session revenue: KSH ${sessionCharges.grandTotal} from ${data.hostname}`);
        }

        console.log(`[SESSION] ${data.type} - ${data.hostname || data.clientId} - User: ${data.user || 'N/A'}${sessionCharges ? ` - Total: KSH ${sessionCharges.grandTotal}` : ''}`);

        res.json({ success: true, sessionId: data.sessionId, charges: sessionCharges });
    } catch (error) {
        console.error('Session Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// NOTE: Old /api/v1/agent/auth endpoint removed - use /api/v1/auth/agent/login instead

// ==================== ADMIN API ENDPOINTS ====================

/**
 * GET /api/v1/admin/computers
 * Returns list of all computers and their real-time status
 */
app.get('/api/v1/admin/computers', (req, res) => {
    const now = new Date();
    const computerList = Array.from(computers.values()).map(c => ({
        ...c,
        isOnline: (now - new Date(c.lastSeen)) < 30000
    }));
    res.json(computerList);
});

/**
 * GET /api/v1/admin/computers/:clientId
 * Returns detailed info for a specific computer
 */
app.get('/api/v1/admin/computers/:clientId', (req, res) => {
    const computer = computers.get(req.params.clientId);
    if (!computer) {
        return res.status(404).json({ error: 'Computer not found' });
    }

    // Include recent activity for this computer
    const recentActivity = activityLogs
        .filter(l => l.clientId === req.params.clientId)
        .slice(0, 20);

    res.json({ ...computer, recentActivity });
});

/**
 * GET /api/v1/admin/sessions
 * Returns session records with filtering
 */
app.get('/api/v1/admin/sessions', (req, res) => {
    const { limit = 100, clientId, user, type } = req.query;

    let filtered = sessions;
    if (clientId) filtered = filtered.filter(s => s.clientId === clientId);
    if (user) filtered = filtered.filter(s => s.user?.toLowerCase().includes(user.toLowerCase()));
    if (type) filtered = filtered.filter(s => s.type === type);

    res.json(filtered.slice(0, parseInt(limit)));
});

/**
 * GET /api/v1/admin/print-jobs
 * Returns print job records with filtering
 */
app.get('/api/v1/admin/print-jobs', (req, res) => {
    const { limit = 100, clientId, user, printType } = req.query;

    let filtered = printJobs;
    if (clientId) filtered = filtered.filter(j => j.clientId === clientId);
    if (user) filtered = filtered.filter(j => j.sessionUser?.toLowerCase().includes(user.toLowerCase()));
    if (printType) filtered = filtered.filter(j => j.printType === printType);

    // Calculate totals
    const totals = {
        totalJobs: filtered.length,
        bwPages: filtered.filter(j => j.printType === 'bw').reduce((sum, j) => sum + (j.totalPages || j.pages || 1), 0),
        colorPages: filtered.filter(j => j.printType === 'color').reduce((sum, j) => sum + (j.totalPages || j.pages || 1), 0),
        bwRevenue: 0,
        colorRevenue: 0
    };
    totals.bwRevenue = totals.bwPages * pricing.printBW;
    totals.colorRevenue = totals.colorPages * pricing.printColor;
    totals.totalRevenue = totals.bwRevenue + totals.colorRevenue;

    res.json({
        jobs: filtered.slice(0, parseInt(limit)),
        totals
    });
});

/**
 * GET /api/v1/admin/browser-history
 * Returns browser history records
 */
app.get('/api/v1/admin/browser-history', (req, res) => {
    const { limit = 100, clientId, user } = req.query;

    let filtered = browserHistory;
    if (clientId) filtered = filtered.filter(h => h.clientId === clientId);
    if (user) filtered = filtered.filter(h => h.sessionUser?.toLowerCase().includes(user.toLowerCase()));

    res.json(filtered.slice(0, parseInt(limit)));
});

/**
 * GET /api/v1/admin/file-activity
 * Returns file creation/modification logs with category support
 */
app.get('/api/v1/admin/file-activity', (req, res) => {
    const { limit = 100, clientId, user, category, groupByCategory } = req.query;

    let filtered = fileActivity;
    if (clientId) filtered = filtered.filter(f => f.clientId === clientId);
    if (user) filtered = filtered.filter(f => f.sessionUser?.toLowerCase().includes(user.toLowerCase()));
    if (category) filtered = filtered.filter(f => f.category === category);

    // Group by category if requested
    if (groupByCategory === 'true') {
        const grouped = {};
        for (const file of filtered) {
            const cat = file.category || 'other';
            if (!grouped[cat]) {
                grouped[cat] = { count: 0, totalSize: 0, files: [] };
            }
            grouped[cat].count++;
            grouped[cat].totalSize += file.sizeBytes || 0;
            grouped[cat].files.push({
                name: file.name,
                size: file.size,
                folder: file.folder,
                user: file.sessionUser,
                computer: file.hostname,
                timestamp: file.timestamp || file.receivedAt
            });
        }

        // Format sizes
        for (const cat of Object.keys(grouped)) {
            const bytes = grouped[cat].totalSize;
            grouped[cat].totalSizeFormatted = formatBytes(bytes);
            grouped[cat].files = grouped[cat].files.slice(0, 20); // Limit files per category
        }

        res.json({
            categories: grouped,
            totalFiles: filtered.length
        });
    } else {
        res.json(filtered.slice(0, parseInt(limit)));
    }
});

// Helper function for byte formatting
function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * GET /api/v1/admin/file-stats
 * Returns aggregated file statistics by category
 */
app.get('/api/v1/admin/file-stats', (req, res) => {
    const { clientId } = req.query;

    let filtered = fileActivity;
    if (clientId) filtered = filtered.filter(f => f.clientId === clientId);

    // Aggregate by category
    const categoryStats = {};
    for (const file of filtered) {
        const cat = file.category || 'other';
        if (!categoryStats[cat]) {
            categoryStats[cat] = {
                category: cat,
                count: 0,
                totalSizeBytes: 0,
                extensions: new Set()
            };
        }
        categoryStats[cat].count++;
        categoryStats[cat].totalSizeBytes += file.sizeBytes || 0;
        if (file.extension) categoryStats[cat].extensions.add(file.extension);
    }

    // Convert to array and format
    const stats = Object.values(categoryStats).map(c => ({
        category: c.category,
        count: c.count,
        totalSize: formatBytes(c.totalSizeBytes),
        totalSizeBytes: c.totalSizeBytes,
        extensions: Array.from(c.extensions)
    })).sort((a, b) => b.count - a.count);

    // Recent files by type
    const recentByCategory = {};
    const categories = ['documents', 'spreadsheets', 'images', 'videos', 'audio', 'archives'];
    for (const cat of categories) {
        recentByCategory[cat] = filtered
            .filter(f => f.category === cat)
            .slice(0, 5)
            .map(f => ({
                name: f.name,
                size: f.size,
                user: f.sessionUser,
                computer: f.hostname,
                timestamp: f.timestamp || f.receivedAt
            }));
    }

    res.json({
        totalFiles: filtered.length,
        totalSize: formatBytes(filtered.reduce((s, f) => s + (f.sizeBytes || 0), 0)),
        categoryStats: stats,
        recentByCategory: recentByCategory
    });
});

/**
 * GET /api/v1/admin/usb-events
 * Returns USB device connection events
 */
app.get('/api/v1/admin/usb-events', (req, res) => {
    const { limit = 100, clientId } = req.query;

    let filtered = usbEvents;
    if (clientId) filtered = filtered.filter(u => u.clientId === clientId);

    res.json(filtered.slice(0, parseInt(limit)));
});

/**
 * GET /api/v1/admin/activity
 * Returns recent activity logs
 */
app.get('/api/v1/admin/activity', (req, res) => {
    const { limit = 50, clientId } = req.query;

    let filtered = activityLogs;
    if (clientId) filtered = filtered.filter(l => l.clientId === clientId);

    res.json(filtered.slice(0, parseInt(limit)));
});

/**
 * GET /api/v1/admin/stats
 * Returns aggregate dashboard statistics
 */
app.get('/api/v1/admin/stats', (req, res) => {
    const allComputers = Array.from(computers.values());
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Filter today's data
    const todaySessions = sessions.filter(s => new Date(s.receivedAt) >= todayStart);
    const todayPrintJobs = printJobs.filter(j => new Date(j.receivedAt) >= todayStart);

    // Calculate revenues
    const todaySessionRevenue = todaySessions
        .filter(s => s.type === 'LOGOUT' && s.charges)
        .reduce((sum, s) => sum + (s.charges.grandTotal || 0), 0);

    const todayPrintBWPages = todayPrintJobs
        .filter(j => j.printType === 'bw')
        .reduce((sum, j) => sum + (j.totalPages || j.pages || 1), 0);

    const todayPrintColorPages = todayPrintJobs
        .filter(j => j.printType === 'color')
        .reduce((sum, j) => sum + (j.totalPages || j.pages || 1), 0);

    const stats = {
        computers: {
            total: allComputers.length,
            online: allComputers.filter(c => (now - new Date(c.lastSeen)) < 30000).length,
            locked: allComputers.filter(c => c.status === 'locked').length,
            activeSessions: allComputers.filter(c => c.status === 'active' && c.sessionUser).length
        },
        today: {
            sessions: todaySessions.filter(s => s.type === 'LOGIN').length,
            uniqueUsers: [...new Set(todaySessions.map(s => s.user).filter(Boolean))].length,
            printJobsBW: todayPrintBWPages,
            printJobsColor: todayPrintColorPages,
            filesCreated: fileActivity.filter(f => new Date(f.receivedAt) >= todayStart).length,
            usbDevices: usbEvents.filter(u => new Date(u.receivedAt) >= todayStart).length
        },
        revenue: {
            today: todaySessionRevenue,
            printBW: todayPrintBWPages * pricing.printBW,
            printColor: todayPrintColorPages * pricing.printColor,
            totalPrint: (todayPrintBWPages * pricing.printBW) + (todayPrintColorPages * pricing.printColor)
        },
        pricing: pricing
    };

    res.json(stats);
});

/**
 * POST /api/v1/admin/command
 * Send a command to a specific agent
 */
app.post('/api/v1/admin/command', (req, res) => {
    const { clientId, command, params } = req.body;

    io.emit('agent-command', { clientId, command, params });
    console.log(`[COMMAND] ${command} -> ${clientId}`);

    res.json({ success: true, message: 'Command sent' });
});

/**
 * GET /api/v1/admin/pricing
 * Returns current pricing configuration
 */
app.get('/api/v1/admin/pricing', (req, res) => {
    res.json(pricing);
});

/**
 * PUT /api/v1/admin/pricing
 * Updates pricing configuration
 */
app.put('/api/v1/admin/pricing', (req, res) => {
    const updates = req.body;
    Object.assign(pricing, updates);
    io.emit('pricing-updated', pricing);
    res.json({ success: true, pricing });
});

// ==================== SERVICE CATALOG ====================

/**
 * GET /api/v1/admin/services
 * List all services with pricing
 */
app.get('/api/v1/admin/services', (req, res) => {
    res.json(services);
});

/**
 * POST /api/v1/admin/services
 * Create a new service
 */
app.post('/api/v1/admin/services', (req, res) => {
    const { name, category, price, unit, description } = req.body;

    if (!name || !price) {
        return res.status(400).json({ error: 'Name and price required' });
    }

    const service = {
        id: 'svc-' + Date.now(),
        name,
        category: category || 'custom',
        description: description || '',
        price: parseFloat(price),
        unit: unit || 'flat',
        isActive: true,
        createdAt: new Date().toISOString()
    };

    services.push(service);
    io.emit('service-created', service);
    res.json({ success: true, service });
});

/**
 * PUT /api/v1/admin/services/:id
 * Update a service
 */
app.put('/api/v1/admin/services/:id', (req, res) => {
    const idx = services.findIndex(s => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Service not found' });

    services[idx] = { ...services[idx], ...req.body };
    io.emit('service-updated', services[idx]);
    res.json({ success: true, service: services[idx] });
});

/**
 * DELETE /api/v1/admin/services/:id
 * Delete a service
 */
app.delete('/api/v1/admin/services/:id', (req, res) => {
    const idx = services.findIndex(s => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Service not found' });

    const deleted = services.splice(idx, 1)[0];
    io.emit('service-deleted', { id: deleted.id });
    res.json({ success: true });
});

// ==================== TASK MANAGEMENT ====================

/**
 * GET /api/v1/admin/tasks
 * List all tasks with optional filters
 */
app.get('/api/v1/admin/tasks', (req, res) => {
    const { status, clientId, userId, limit = 100 } = req.query;

    let filtered = tasks;
    if (status) filtered = filtered.filter(t => t.status === status);
    if (clientId) filtered = filtered.filter(t => t.assignedTo?.clientId === clientId);
    if (userId) filtered = filtered.filter(t => t.assignedTo?.userId === userId);

    res.json(filtered.slice(0, parseInt(limit)));
});

/**
 * POST /api/v1/admin/tasks
 * Create a new task
 */
app.post('/api/v1/admin/tasks', (req, res) => {
    const { title, description, serviceId, price, priority, dueAt, assignTo } = req.body;

    if (!title) {
        return res.status(400).json({ error: 'Title required' });
    }

    // Get price from service if serviceId provided
    let taskPrice = price || 0;
    let serviceName = null;
    if (serviceId) {
        const service = services.find(s => s.id === serviceId);
        if (service) {
            taskPrice = service.price;
            serviceName = service.name;
        }
    }

    const task = {
        id: 'task-' + Date.now() + Math.random().toString(36).substr(2, 5),
        title,
        description: description || '',
        serviceId: serviceId || null,
        serviceName,
        price: taskPrice,
        priority: priority || 'normal', // low, normal, high, urgent
        status: assignTo ? 'assigned' : 'available', // available, assigned, in-progress, completed, cancelled
        assignedTo: assignTo ? {
            userId: assignTo.userId || null,
            clientId: assignTo.clientId || null,
            hostname: assignTo.hostname || null,
            userName: assignTo.userName || null
        } : null,
        assignedAt: assignTo ? new Date().toISOString() : null,
        dueAt: dueAt || null,
        completedAt: null,
        createdAt: new Date().toISOString()
    };

    tasks.unshift(task);
    if (tasks.length > 1000) tasks.pop();

    // Notify if assigned to a computer
    if (task.assignedTo?.clientId) {
        io.emit('task-assigned', {
            targetClientId: task.assignedTo.clientId,
            task: {
                id: task.id,
                title: task.title,
                price: task.price,
                priority: task.priority,
                dueAt: task.dueAt
            }
        });
    }

    console.log(`[TASK] Created: ${task.title} - KSH ${task.price}`);
    res.json({ success: true, task });
});

/**
 * PUT /api/v1/admin/tasks/:id
 * Update a task
 */
app.put('/api/v1/admin/tasks/:id', (req, res) => {
    const idx = tasks.findIndex(t => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Task not found' });

    const oldStatus = tasks[idx].status;
    tasks[idx] = { ...tasks[idx], ...req.body, updatedAt: new Date().toISOString() };

    // If status changed to completed, record transaction
    if (req.body.status === 'completed' && oldStatus !== 'completed') {
        tasks[idx].completedAt = new Date().toISOString();

        // Create transaction record
        const transaction = {
            id: 'txn-' + Date.now(),
            type: 'task_completion',
            taskId: tasks[idx].id,
            description: tasks[idx].title,
            amount: tasks[idx].price,
            clientId: tasks[idx].assignedTo?.clientId,
            userId: tasks[idx].assignedTo?.userId,
            hostname: tasks[idx].assignedTo?.hostname,
            createdAt: new Date().toISOString()
        };
        transactions.unshift(transaction);
        if (transactions.length > 2000) transactions.pop();

        io.emit('transaction-created', transaction);
    }

    io.emit('task-updated', tasks[idx]);
    res.json({ success: true, task: tasks[idx] });
});

/**
 * DELETE /api/v1/admin/tasks/:id
 * Delete a task
 */
app.delete('/api/v1/admin/tasks/:id', (req, res) => {
    const idx = tasks.findIndex(t => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Task not found' });

    const deleted = tasks.splice(idx, 1)[0];
    io.emit('task-deleted', { id: deleted.id });
    res.json({ success: true });
});

/**
 * POST /api/v1/admin/tasks/:id/assign
 * Assign a task to a user/computer
 */
app.post('/api/v1/admin/tasks/:id/assign', (req, res) => {
    const { clientId, hostname, userId, userName } = req.body;

    const idx = tasks.findIndex(t => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Task not found' });

    tasks[idx].status = 'assigned';
    tasks[idx].assignedTo = { clientId, hostname, userId, userName };
    tasks[idx].assignedAt = new Date().toISOString();

    // Notify the assigned computer
    io.emit('task-assigned', {
        targetClientId: clientId,
        task: {
            id: tasks[idx].id,
            title: tasks[idx].title,
            price: tasks[idx].price,
            priority: tasks[idx].priority,
            dueAt: tasks[idx].dueAt
        }
    });

    res.json({ success: true, task: tasks[idx] });
});

// ==================== USER TASKS (for user portal) ====================

/**
 * GET /api/v1/user/tasks
 * Get tasks for a specific user/computer
 */
app.get('/api/v1/user/tasks', (req, res) => {
    const { clientId, userId, status, period } = req.query;

    let filtered = tasks;

    // Filter by assignment (clientId or userId)
    if (clientId || userId) {
        filtered = filtered.filter(t =>
            t.assignedTo?.clientId === clientId ||
            t.assignedTo?.userId === userId
        );
    }

    // Filter by status
    if (status) {
        filtered = filtered.filter(t => t.status === status);
    }

    // Filter by period
    if (period) {
        const now = new Date();
        let startDate;
        switch (period) {
            case 'today':
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                break;
            case 'week':
                startDate = new Date(now.setDate(now.getDate() - 7));
                break;
            case 'month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
        }
        if (startDate) {
            filtered = filtered.filter(t => new Date(t.createdAt) >= startDate);
        }
    }

    res.json(filtered);
});

/**
 * PUT /api/v1/user/tasks/:id/status
 * Update task status (for user to mark as completed, etc.)
 */
app.put('/api/v1/user/tasks/:id/status', (req, res) => {
    const { status } = req.body;
    const idx = tasks.findIndex(t => t.id === req.params.id);

    if (idx === -1) return res.status(404).json({ error: 'Task not found' });

    tasks[idx].status = status;
    if (status === 'in-progress' && !tasks[idx].startedAt) {
        tasks[idx].startedAt = new Date().toISOString();
    }
    if (status === 'completed') {
        tasks[idx].completedAt = new Date().toISOString();

        // Create transaction
        const transaction = {
            id: 'txn-' + Date.now(),
            type: 'task_completion',
            taskId: tasks[idx].id,
            description: tasks[idx].title,
            amount: tasks[idx].price,
            clientId: tasks[idx].assignedTo?.clientId,
            createdAt: new Date().toISOString()
        };
        transactions.unshift(transaction);
        io.emit('transaction-created', transaction);
    }

    io.emit('task-updated', tasks[idx]);
    res.json({ success: true, task: tasks[idx] });
});

// ==================== TRANSACTIONS ====================

/**
 * GET /api/v1/admin/transactions
 * List all transactions
 */
app.get('/api/v1/admin/transactions', (req, res) => {
    const { type, clientId, limit = 100, period } = req.query;

    let filtered = transactions;
    if (type) filtered = filtered.filter(t => t.type === type);
    if (clientId) filtered = filtered.filter(t => t.clientId === clientId);

    // Filter by period
    if (period) {
        const now = new Date();
        let startDate;
        switch (period) {
            case 'today':
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                break;
            case 'week':
                startDate = new Date(now.setDate(now.getDate() - 7));
                break;
            case 'month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
        }
        if (startDate) {
            filtered = filtered.filter(t => new Date(t.createdAt) >= startDate);
        }
    }

    res.json(filtered.slice(0, parseInt(limit)));
});

/**
 * GET /api/v1/admin/transactions/summary
 * Get transaction summary/totals
 */
app.get('/api/v1/admin/transactions/summary', (req, res) => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now.setDate(now.getDate() - now.getDay()));
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const todayTxns = transactions.filter(t => new Date(t.createdAt) >= todayStart);
    const weekTxns = transactions.filter(t => new Date(t.createdAt) >= weekStart);
    const monthTxns = transactions.filter(t => new Date(t.createdAt) >= monthStart);

    // Also include session charges
    const todaySessions = sessions.filter(s =>
        new Date(s.receivedAt) >= todayStart && s.type === 'LOGOUT' && s.charges
    );
    const weekSessions = sessions.filter(s =>
        new Date(s.receivedAt) >= weekStart && s.type === 'LOGOUT' && s.charges
    );
    const monthSessions = sessions.filter(s =>
        new Date(s.receivedAt) >= monthStart && s.type === 'LOGOUT' && s.charges
    );

    const todaySessionRevenue = todaySessions.reduce((sum, s) => sum + (s.charges?.grandTotal || 0), 0);
    const weekSessionRevenue = weekSessions.reduce((sum, s) => sum + (s.charges?.grandTotal || 0), 0);
    const monthSessionRevenue = monthSessions.reduce((sum, s) => sum + (s.charges?.grandTotal || 0), 0);

    const todayTaskRevenue = todayTxns.reduce((sum, t) => sum + (t.amount || 0), 0);
    const weekTaskRevenue = weekTxns.reduce((sum, t) => sum + (t.amount || 0), 0);
    const monthTaskRevenue = monthTxns.reduce((sum, t) => sum + (t.amount || 0), 0);

    res.json({
        today: {
            sessions: todaySessions.length,
            sessionRevenue: todaySessionRevenue,
            tasks: todayTxns.length,
            taskRevenue: todayTaskRevenue,
            totalRevenue: todaySessionRevenue + todayTaskRevenue
        },
        week: {
            sessions: weekSessions.length,
            sessionRevenue: weekSessionRevenue,
            tasks: weekTxns.length,
            taskRevenue: weekTaskRevenue,
            totalRevenue: weekSessionRevenue + weekTaskRevenue
        },
        month: {
            sessions: monthSessions.length,
            sessionRevenue: monthSessionRevenue,
            tasks: monthTxns.length,
            taskRevenue: monthTaskRevenue,
            totalRevenue: monthSessionRevenue + monthTaskRevenue
        }
    });
});


// ==================== DOCUMENT SHARING ====================

/**
 * POST /api/v1/documents/upload
 * Upload a document to share with users or admin
 */
app.post('/api/v1/documents/upload', upload.single('file'), (req, res) => {
    try {
        const { fromUser, fromClientId, toUser, toClientId, message } = req.body;

        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const document = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            filename: req.file.originalname,
            storedName: req.file.filename,
            path: `/uploads/${req.file.filename}`,
            size: req.file.size,
            sizeFormatted: formatBytes(req.file.size),
            mimetype: req.file.mimetype,
            from: {
                user: fromUser || 'Admin',
                clientId: fromClientId || 'admin'
            },
            to: {
                user: toUser || 'all',
                clientId: toClientId || 'all'
            },
            message: message || '',
            status: 'pending', // pending, downloaded, expired
            uploadedAt: new Date().toISOString(),
            downloadedAt: null
        };

        sharedDocuments.unshift(document);
        if (sharedDocuments.length > 500) sharedDocuments.pop();

        // Notify recipient via WebSocket
        io.emit('document-received', {
            ...document,
            path: undefined, // Don't expose server path
            storedName: undefined
        });

        console.log(`[DOCUMENT] ${document.from.user} -> ${document.to.user}: ${document.filename}`);

        res.json({ success: true, documentId: document.id, document });
    } catch (error) {
        console.error('Upload Error:', error);
        res.status(500).json({ error: 'Upload failed' });
    }
});

/**
 * GET /api/v1/documents
 * List documents (filtered by user/client)
 */
app.get('/api/v1/documents', (req, res) => {
    const { clientId, user, direction } = req.query;

    let filtered = sharedDocuments;

    if (clientId || user) {
        if (direction === 'sent') {
            // Documents sent by this user
            filtered = filtered.filter(d =>
                d.from.clientId === clientId || d.from.user === user
            );
        } else if (direction === 'received') {
            // Documents sent TO this user
            filtered = filtered.filter(d =>
                d.to.clientId === clientId ||
                d.to.user === user ||
                d.to.user === 'all' ||
                d.to.clientId === 'all'
            );
        } else {
            // All documents involving this user
            filtered = filtered.filter(d =>
                d.from.clientId === clientId ||
                d.from.user === user ||
                d.to.clientId === clientId ||
                d.to.user === user ||
                d.to.user === 'all'
            );
        }
    }

    res.json(filtered.map(d => ({
        ...d,
        storedName: undefined // Hide internal filename
    })));
});

/**
 * GET /api/v1/documents/:id/download
 * Download a specific document
 */
app.get('/api/v1/documents/:id/download', (req, res) => {
    const doc = sharedDocuments.find(d => d.id === req.params.id);

    if (!doc) {
        return res.status(404).json({ error: 'Document not found' });
    }

    const filePath = path.join(UPLOADS_DIR, doc.storedName);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found on server' });
    }

    // Mark as downloaded
    doc.status = 'downloaded';
    doc.downloadedAt = new Date().toISOString();

    // Notify sender
    io.emit('document-downloaded', { id: doc.id, downloadedBy: req.query.user || 'Unknown' });

    res.download(filePath, doc.filename);
});

/**
 * DELETE /api/v1/documents/:id
 * Delete a shared document
 */
app.delete('/api/v1/documents/:id', (req, res) => {
    const index = sharedDocuments.findIndex(d => d.id === req.params.id);

    if (index === -1) {
        return res.status(404).json({ error: 'Document not found' });
    }

    const doc = sharedDocuments[index];

    // Delete file from disk
    const filePath = path.join(UPLOADS_DIR, doc.storedName);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }

    sharedDocuments.splice(index, 1);

    io.emit('document-deleted', { id: doc.id });

    res.json({ success: true });
});

/**
 * POST /api/v1/documents/send-to-computer
 * Admin sends document to specific computer
 */
app.post('/api/v1/documents/send-to-computer', upload.single('file'), (req, res) => {
    const { targetClientId, targetHostname, message } = req.body;

    if (!req.file || !targetClientId) {
        return res.status(400).json({ error: 'File and target computer required' });
    }

    const document = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        filename: req.file.originalname,
        storedName: req.file.filename,
        path: `/uploads/${req.file.filename}`,
        size: req.file.size,
        sizeFormatted: formatBytes(req.file.size),
        mimetype: req.file.mimetype,
        from: { user: 'Admin', clientId: 'admin' },
        to: { user: targetHostname || targetClientId, clientId: targetClientId },
        message: message || 'Document from Admin',
        status: 'pending',
        uploadedAt: new Date().toISOString()
    };

    sharedDocuments.unshift(document);

    // Emit to specific computer
    io.emit('document-for-agent', {
        targetClientId,
        document: {
            id: document.id,
            filename: document.filename,
            size: document.sizeFormatted,
            from: 'Admin',
            message: document.message,
            downloadUrl: `http://localhost:5000/api/v1/documents/${document.id}/download`
        }
    });

    console.log(`[DOCUMENT] Admin -> ${targetHostname || targetClientId}: ${document.filename}`);

    res.json({ success: true, documentId: document.id });
});

/**
 * GET /api/v1/documents/stats
 * Document sharing statistics
 */
app.get('/api/v1/documents/stats', (req, res) => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const todayDocs = sharedDocuments.filter(d => new Date(d.uploadedAt) >= todayStart);

    res.json({
        total: sharedDocuments.length,
        today: todayDocs.length,
        pending: sharedDocuments.filter(d => d.status === 'pending').length,
        downloaded: sharedDocuments.filter(d => d.status === 'downloaded').length,
        totalSize: formatBytes(sharedDocuments.reduce((s, d) => s + d.size, 0))
    });
});


// ==================== PUBLIC API (LANDING PAGE) ====================

// Store for public document requests
const documentRequests = [];

/**
 * POST /api/v1/public/document-request
 * Public endpoint for customers to submit document work requests
 */
app.post('/api/v1/public/document-request', upload.array('files', 10), (req, res) => {
    try {
        const { serviceType, customerName, customerPhone, instructions, source } = req.body;
        const files = req.files || [];

        if (!serviceType || !customerName || !customerPhone) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        if (files.length === 0) {
            return res.status(400).json({ error: 'Please upload at least one file' });
        }

        // Generate order ID
        const orderId = 'HN-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 5).toUpperCase();

        // Create request record
        const request = {
            orderId,
            serviceType,
            customerName,
            customerPhone: customerPhone.replace(/\s/g, ''),
            instructions: instructions || '',
            source: source || 'landing_page',
            files: files.map(f => ({
                originalName: f.originalname,
                filename: f.filename,
                size: f.size,
                mimetype: f.mimetype,
                path: f.path
            })),
            status: 'pending', // pending, processing, ready, completed, cancelled
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        documentRequests.unshift(request);
        if (documentRequests.length > 500) documentRequests.pop();

        // Emit to admin dashboard
        io.emit('new-document-request', request);

        console.log(`[PUBLIC] New document request: ${orderId} from ${customerName} (${customerPhone})`);

        res.json({
            success: true,
            orderId,
            message: 'Your request has been submitted. We will contact you shortly.'
        });
    } catch (error) {
        console.error('Document request error:', error);
        res.status(500).json({ error: 'Failed to submit request' });
    }
});

/**
 * GET /api/v1/public/track/:orderId
 * Track status of a document request
 */
app.get('/api/v1/public/track/:orderId', (req, res) => {
    const { orderId } = req.params;

    const request = documentRequests.find(r => r.orderId === orderId);

    if (!request) {
        return res.status(404).json({ error: 'Order not found' });
    }

    res.json({
        orderId: request.orderId,
        status: request.status,
        serviceType: request.serviceType,
        filesCount: request.files.length,
        createdAt: request.createdAt,
        updatedAt: request.updatedAt
    });
});

/**
 * GET /api/v1/admin/document-requests
 * Admin endpoint to view all document requests
 */
app.get('/api/v1/admin/document-requests', (req, res) => {
    const { status, limit = 50 } = req.query;

    let results = documentRequests;
    if (status) {
        results = results.filter(r => r.status === status);
    }

    res.json(results.slice(0, parseInt(limit)));
});

/**
 * PUT /api/v1/admin/document-requests/:orderId/status
 * Update status of a document request
 */
app.put('/api/v1/admin/document-requests/:orderId/status', (req, res) => {
    const { orderId } = req.params;
    const { status, notes } = req.body;

    const validStatuses = ['pending', 'processing', 'ready', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    const request = documentRequests.find(r => r.orderId === orderId);
    if (!request) {
        return res.status(404).json({ error: 'Order not found' });
    }

    request.status = status;
    request.notes = notes || request.notes;
    request.updatedAt = new Date().toISOString();

    // Emit update
    io.emit('document-request-updated', { orderId, status, updatedAt: request.updatedAt });

    console.log(`[PUBLIC] Order ${orderId} status updated to: ${status}`);

    res.json({ success: true, request });
});


// ==================== SOCKET.IO ====================

io.on('connection', (socket) => {
    console.log(`[SOCKET] Admin connected: ${socket.id}`);

    // Send current state on connect
    socket.emit('init-data', {
        computers: Array.from(computers.values()),
        recentSessions: sessions.slice(0, 20),
        pricing: pricing
    });

    socket.on('disconnect', () => {
        console.log(`[SOCKET] Admin disconnected: ${socket.id}`);
    });
});

// ==================== SERVER START ====================

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║           HawkNine Backend API Server v2.0                    ║
║           Running on http://localhost:${PORT}                    ║
╠═══════════════════════════════════════════════════════════════╣
║  Endpoints:                                                   ║
║  • POST /api/v1/agent/sync        - Agent heartbeat           ║
║  • POST /api/v1/agent/session     - Session events            ║
║  • GET  /api/v1/admin/computers   - All computers             ║
║  • GET  /api/v1/admin/sessions    - Session history           ║
║  • GET  /api/v1/admin/print-jobs  - Print job records         ║
║  • GET  /api/v1/admin/browser-history - Browser history       ║
║  • GET  /api/v1/admin/file-activity   - File activity         ║
║  • GET  /api/v1/admin/stats       - Dashboard stats           ║
╚═══════════════════════════════════════════════════════════════╝
    `);
});
