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
const mongoose = require('mongoose');

// ==================== DATABASE CONNECTION ====================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hawknine';
mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ Connected to MongoDB persistence layer'))
    .catch(err => {
        console.error('❌ MongoDB connection error:', err);
        console.log('Falling back to limited local state...');
    });

// Load Models
const User = require('./models/User');
const Computer = require('./models/Computer');
const Session = require('./models/Session');
const Task = require('./models/Task');
const Service = require('./models/Service');
const Transaction = require('./models/Transaction');
const SharedDocument = require('./models/SharedDocument');
const Log = require('./models/Log');
const AuthSession = require('./models/AuthSession');
const VerificationCode = require('./models/VerificationCode');
const Template = require('./models/Template');
const Course = require('./models/Course');
const Guide = require('./models/Guide');
const Settings = require('./models/Settings');
const Blocklist = require('./models/Blocklist');
const ServiceCategory = require('./models/ServiceCategory');
const InventoryItem = require('./models/InventoryItem');
const UserSubmission = require('./models/UserSubmission');
const DocumentRequest = require('./models/DocumentRequest');



const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' },
    maxHttpBufferSize: 10e6 // 10MB for screenshots
});

// Store connected agent sockets
const agentSockets = new Map(); // clientId -> socketId

// ==================== SOCKET.IO HANDLERS ====================
io.on('connection', (socket) => {
    console.log(`[SOCKET] New connection: ${socket.id}`);

    // Agent registration
    socket.on('agent-register', (data) => {
        if (data.clientId) {
            agentSockets.set(data.clientId, socket.id);
            socket.clientId = data.clientId;
            socket.hostname = data.hostname;
            console.log(`[SOCKET] Agent registered: ${data.clientId} (${data.hostname})`);
        }
    });

    // Agent response (screenshots, errors, etc.)
    socket.on('agent-response', (data) => {
        // Use explicit clientId from data if available, otherwise use socket property
        const clientId = data.clientId || socket.clientId;
        const hostname = data.hostname || socket.hostname;

        if (data.type === 'screenshot' && data.screenshot) {
            // Broadcast screenshot to admin dashboards
            io.emit('agent-screenshot', {
                clientId: clientId,
                hostname: hostname,
                screenshot: data.screenshot,
                timestamp: data.timestamp || new Date().toISOString()
            });
            console.log(`[SOCKET] Screenshot received from ${clientId} (${hostname})`);
        } else if (data.type === 'error') {
            io.emit('agent-error', {
                clientId: clientId,
                hostname: hostname,
                message: data.message
            });
            console.log(`[SOCKET] Error from ${clientId}: ${data.message}`);
        } else if (data.type === 'document-downloaded') {
            // Update document status in DB
            if (data.documentId) {
                SharedDocument.findOneAndUpdate(
                    { id: data.documentId },
                    {
                        status: 'downloaded',
                        downloadedAt: new Date(data.timestamp)
                    }
                ).then(doc => {
                    if (doc) {
                        io.emit('document-status-update', {
                            id: doc.id,
                            status: 'downloaded',
                            downloadedAt: data.timestamp
                        });
                        console.log(`[DOCUMENT] Download confirmed for ${doc.filename} by ${clientId}`);
                    }
                });
            }
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        if (socket.clientId) {
            agentSockets.delete(socket.clientId);
            console.log(`[SOCKET] Agent disconnected: ${socket.clientId}`);
        }
    });
});

// Trust Nginx Proxy
app.set('trust proxy', 1);

// ==================== HEALTH CHECK ====================
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ==================== SECURITY: RATE LIMITING ====================

// Simple in-memory rate limiter
const rateLimitStore = new Map();

const rateLimit = (options = {}) => {
    const windowMs = options.windowMs || 15 * 60 * 1000; // 15 minutes
    const max = options.max || 100;
    const message = options.message || 'Too many requests, please try again later';

    return (req, res, next) => {
        const key = req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
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
// ==================== AUTHENTICATION SYSTEM (2FA) ====================

// Admin Configuration
const ADMIN_CONFIG = {
    email: process.env.ADMIN_EMAIL || 'admin@hawknine.co.ke',
    username: process.env.ADMIN_USERNAME || 'admin',
    passwordHash: process.env.ADMIN_PASSWORD_HASH || crypto.createHash('sha256').update(process.env.ADMIN_PASSWORD || 'admin123').digest('hex')
};

const OTP_STORE = new Map(); // username -> { otp, expiresAt }
const TEMP_TOKENS = new Map(); // tempToken -> username (for linking step 1 to step 2)

// Email Transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Helper: Generate OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// Helper: Send Email with OTP
const sendOTPEmail = async (email, otp, username) => {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.log(`[DEV MODE] OTP for ${username} (${email}): ${otp}`);
        return true;
    }

    try {
        await transporter.sendMail({
            from: '"HawkNine Security" <noreply@hawknine.co.ke>',
            to: email,
            subject: 'HawkNine Admin Access Code',
            html: `
                <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
                    <h2 style="color: #00B4D8; text-align: center;">Two-Factor Authentication</h2>
                    <p style="color: #333;">Hello <strong>${username}</strong>,</p>
                    <p>A login attempt was made for your HawkNine Admin account.</p>
                    <div style="background-color: #f8f9fa; padding: 20px; text-align: center; border-radius: 5px; margin: 20px 0;">
                        <span style="font-size: 32px; letter-spacing: 5px; color: #023047; font-weight: bold;">${otp}</span>
                    </div>
                    <p style="font-size: 12px; color: #666; text-align: center;">This code expires in 5 minutes. Do not share it with anyone.</p>
                </div>
            `
        });
        return true;
    } catch (error) {
        console.error('Email error:', error);
        return false;
    }
};

// Active sessions
// adminSessions and agentUsers are declared below in the DATA STORES section

// Crypto helpers
const generateToken = () => crypto.randomBytes(32).toString('hex');
const hashPassword = (password) => crypto.createHash('sha256').update(password).digest('hex');
const verifyPassword = (password, hash) => hashPassword(password) === hash;

// Auth middleware for admin routes
const requireAdminAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.split(' ')[1];
        const session = await AuthSession.findOne({ token, type: 'admin' });

        if (!session || Date.now() > session.expiresAt) {
            if (session) await AuthSession.deleteOne({ token });
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        req.admin = session;
        next();
    } catch (error) {
        res.status(500).json({ error: 'Authentication error' });
    }
};

const requireSuperAdminAuth = async (req, res, next) => {
    await requireAdminAuth(req, res, () => {
        if (req.admin.role !== 'Super Admin') {
            return res.status(403).json({ error: 'Super Admin privileges required' });
        }
        next();
    });
};


// Ensure uploads and downloads directory exists
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
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
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 1000,               // Increased limit to handle multiple agents sharing one IP
    message: 'Too many login attempts, please try again later'
});



// ==================== DATA STORES ====================
// Real-time tracking stores
const computers = new Map();          // clientId -> computer status
const documentRequests = [];          // Transient document request tracking (until handled)
const sharedDocuments = [];           // Transient shared documents tracking

// Sessions (handled by MongoDB AuthSession and VerificationCode models)
// No in-memory stores needed for cluster stability


// Pricing configuration (Default)
const pricing = {
    computerUsage: 200,    // KSH per hour
    printBW: 10,           // KSH per page B&W
    printColor: 50,        // KSH per page Color
    scanning: 20,          // KSH per page
    photocopyBW: 8,        // KSH per copy
    photocopyColor: 40     // KSH per copy
};

// ==================== PERSISTENCE SEEDING ====================
async function seedDatabase() {
    try {
        console.log('🌱 Seeding database with initial data...');

        /*
        // Seed Portal User
        const userCount = await User.countDocuments({ type: 'portal' });
        if (userCount === 0) {
            await User.create({
                username: 'demo',
                email: 'demo@example.com',
                name: 'Demo User',
                passwordHash: hashPassword('demo123'),
                type: 'portal',
                active: true
            });
            console.log('✅ Demo portal user created');
        }

        // Seed Agent User
        const agentCount = await User.countDocuments({ type: 'agent' });
        if (agentCount === 0) {
            await User.create({
                username: 'agent1',
                name: 'Agent User 1',
                passwordHash: hashPassword('agent123'),
                type: 'agent',
                active: true
            });
            console.log('✅ Demo agent user created');
        }
        */

        // Seed Services
        const serviceCount = await Service.countDocuments();
        if (serviceCount === 0) {
            const initialServices = [
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
            await Service.insertMany(initialServices);
            console.log('✅ Initial services seeded');
        }
    } catch (err) {
        console.error('❌ Seeding error:', err);
    }
}
// Run seed after connection
mongoose.connection.once('open', async () => {
    await seedDatabase();

    // Sync in-memory computer Map from Database on startup
    try {
        const computerDocs = await Computer.find();
        computerDocs.forEach(c => {
            const doc = c.toObject();
            const now = new Date();
            computers.set(doc.clientId, {
                ...doc,
                isOnline: (now - new Date(doc.lastSeen)) < 45000
            });
        });
        console.log(`📡 Synced ${computers.size} computers from DB to real-time store`);
    } catch (e) {
        console.error('Failed to sync in-memory stores:', e);
    }
});


// ==================== AUTHENTICATION ENDPOINTS ====================

/**
 * POST /api/v1/auth/admin/login-step1
 * Validate credentials and send OTP
 */
app.post('/api/v1/auth/admin/login-step1', authRateLimit, async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        // 1. Verify Credentials
        let adminUser = null;
        const isSuperAdmin = (
            username.toLowerCase() === ADMIN_CONFIG.username.toLowerCase() &&
            verifyPassword(password, ADMIN_CONFIG.passwordHash)
        );

        if (isSuperAdmin) {
            adminUser = {
                username: ADMIN_CONFIG.username,
                email: ADMIN_CONFIG.email,
                role: 'Super Admin'
            };
        } else {
            // Check DB for admin users
            const dbAdmin = await User.findOne({
                username: username,
                type: 'admin',
                active: true
            });

            if (dbAdmin && verifyPassword(password, dbAdmin.passwordHash)) {
                adminUser = {
                    username: dbAdmin.username,
                    email: dbAdmin.email,
                    role: dbAdmin.role || 'Admin'
                };
            }
        }

        if (!adminUser) {
            // Delay to prevent timing attacks
            await new Promise(resolve => setTimeout(resolve, 800));
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        // Check DB connection
        if (mongoose.connection.readyState !== 1) {
            console.error('[AUTH] Login Step 1 blocked: MongoDB not connected');
            return res.status(503).json({ error: 'Database connection failed. Please ensure MongoDB is running.' });
        }

        // 2. Generate and Send OTP
        const otp = generateOTP();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 mins

        // Store OTP linked to username (Persistent for Cluster)
        await VerificationCode.findOneAndUpdate(
            { type: 'admin_otp', key: username },
            { value: otp, expiresAt },
            { upsert: true }
        );

        // Use a temporary token to identify this login flow
        const tempToken = generateToken();
        await VerificationCode.create({
            type: 'admin_temp_token',
            key: tempToken,
            value: username,
            expiresAt
        });

        // Send to registered admin email
        const sent = await sendOTPEmail(adminUser.email, otp, username);


        if (sent) {
            res.json({
                success: true,
                message: '2FA Code sent to email',
                tempToken,
                emailMask: adminUser.email.replace(/(.{2})(.*)(@.*)/, '$1***$3')
            });
        } else {
            res.status(500).json({ error: 'Failed to send verification code' });
        }

    } catch (error) {
        console.error('Login Step 1 Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/v1/auth/admin/login-step2
 * Verify OTP and issue session token
 */
app.post('/api/v1/auth/admin/login-step2', authRateLimit, async (req, res) => {
    try {
        const { tempToken, otp } = req.body;

        if (!tempToken || !otp) {
            return res.status(400).json({ error: 'Missing verification data' });
        }

        // Check DB connection
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({ error: 'Database connection failed. Please try again later.' });
        }

        // Get username from tempToken
        const tokenRecord = await VerificationCode.findOne({ type: 'admin_temp_token', key: tempToken });

        if (!tokenRecord) {
            console.log('[AUTH DEBUG] Step 2 Failed: Temp token not found or expired');
            return res.status(400).json({ error: 'Session expired. Please login again.' });
        }

        const username = tokenRecord.value;

        // Get OTP for this user
        const otpRecord = await VerificationCode.findOne({ type: 'admin_otp', key: username });

        if (!otpRecord) {
            return res.status(400).json({ error: 'Verification code not found' });
        }

        if (Date.now() > otpRecord.expiresAt) {
            await VerificationCode.deleteMany({ key: { $in: [username, tempToken] } });
            return res.status(400).json({ error: 'Code expired' });
        }

        if (String(otpRecord.value).trim() !== String(otp).trim()) {
            console.log(`[AUTH DEBUG] Invalid OTP for ${username}. Expected: ${otpRecord.value}, Got: ${otp}`);
            return res.status(401).json({ error: 'Invalid code' });
        }

        // Success! Cleanup and Create Session
        await VerificationCode.deleteMany({
            $or: [
                { type: 'admin_otp', key: username },
                { type: 'admin_temp_token', key: tempToken }
            ]
        });

        const token = generateToken();
        const expiresAt = new Date(Date.now() + (24 * 60 * 60 * 1000)); // 24 hours

        // Determine user info for session
        let sessionInfo = {
            username: username,
            type: 'admin',
            expiresAt
        };

        if (username.toLowerCase() === ADMIN_CONFIG.username.toLowerCase()) {
            sessionInfo.email = ADMIN_CONFIG.email;
            sessionInfo.role = 'Super Admin';
        } else {
            const dbUser = await User.findOne({ username, type: 'admin' });
            sessionInfo.email = dbUser.email;
            sessionInfo.role = dbUser.role || 'Admin';
        }

        const session = await AuthSession.create({
            token,
            ...sessionInfo
        });

        console.log(`Admin login success: ${username}`);

        res.json({
            success: true,
            token,
            user: {
                username: session.username,
                email: session.email,
                role: session.role
            },
            expiresIn: 86400
        });

    } catch (error) {
        console.error('Login Step 2 Error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});


/**
 * POST /api/v1/auth/admin/logout
 * Admin dashboard logout
 */
app.post('/api/v1/auth/admin/logout', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            await AuthSession.deleteOne({ token, type: 'admin' });
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Logout failed' });
    }
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
app.post('/api/v1/auth/agent/login', authRateLimit, async (req, res) => {
    try {
        const { username, password, clientId, hostname } = req.body;

        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Username and password required' });
        }

        // Find user in MongoDB (either by username or email)
        const user = await User.findOne({
            $or: [{ username }, { email: username }],
            type: 'agent'
        });

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


/* User routes protection will be applied after requireUserAuth is defined. */

/**
 * USER AUTHENTICATION (OTP-based or Direct)
 * POST /api/v1/auth/user/login-step1
 * Validate credentials and either send OTP or login directly based on settings
 */
app.post('/api/v1/auth/user/login-step1', authRateLimit, async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }
        // Find user in MongoDB
        const foundUser = await User.findOne({ username, type: 'portal' });
        if (!foundUser) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        if (!foundUser.active) {
            return res.status(401).json({ error: 'Account is disabled' });
        }
        if (!verifyPassword(password, foundUser.passwordHash)) {
            await new Promise(resolve => setTimeout(resolve, 800));
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Check if OTP is required from settings
        let otpRequired = true;
        try {
            const authSettings = await Settings.findOne({ key: 'portal_auth' });
            if (authSettings?.value?.otpEnabled === false) {
                otpRequired = false;
            }
        } catch (e) {
            // Default to OTP enabled
        }

        if (!otpRequired) {
            // Direct login without OTP
            console.log(`[USER AUTH] Direct login (OTP disabled) for: ${username}`);

            const token = generateToken();
            const expiresAt = new Date(Date.now() + (24 * 60 * 60 * 1000));

            await AuthSession.create({
                token,
                username: foundUser.username,
                email: foundUser.email,
                name: foundUser.name,
                type: 'portal',
                expiresAt
            });

            return res.json({
                success: true,
                skipOtp: true,
                token,
                user: {
                    username: foundUser.username,
                    email: foundUser.email,
                    name: foundUser.name
                },
                expiresIn: 86400
            });
        }

        // OTP is required - proceed with 2FA
        console.log(`[USER AUTH] OTP required for: ${username}`);

        // Generate OTP and send via email
        const otp = generateOTP();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

        // Store OTP linked to username (Persistent for Cluster)
        await VerificationCode.findOneAndUpdate(
            { type: 'user_otp', key: username },
            { value: otp, expiresAt },
            { upsert: true }
        );

        // Use a temporary token identify this login flow
        const tempToken = generateToken();
        await VerificationCode.create({
            type: 'user_temp_token',
            key: tempToken,
            value: username,
            expiresAt
        });

        const emailSent = await sendOTPEmail(foundUser.email, otp, username);

        if (emailSent) {
            res.json({
                success: true,
                skipOtp: false,
                message: '2FA Code sent to email',
                tempToken,
                emailMask: foundUser.email.replace(/(.{2})(.*)(@.*)/, '$1***$3')
            });
        } else {
            res.status(500).json({ error: 'Failed to send verification code' });
        }
    } catch (error) {
        console.error('User Login Step 1 Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/v1/auth/user/login-step2
 * Verify OTP and issue user session token
 */
app.post('/api/v1/auth/user/login-step2', authRateLimit, async (req, res) => {
    try {
        const { tempToken, otp } = req.body;
        if (!tempToken || !otp) {
            return res.status(400).json({ error: 'Missing verification data' });
        }

        // Get username from tempToken
        const tokenRecord = await VerificationCode.findOne({ type: 'user_temp_token', key: tempToken });

        if (!tokenRecord) {
            console.log('[USER AUTH] Step 2 Failed: Temp token not found or expired');
            return res.status(400).json({ error: 'Session expired. Please login again.' });
        }

        const username = tokenRecord.value;

        // Get OTP for this user
        const otpRecord = await VerificationCode.findOne({ type: 'user_otp', key: username });

        if (!otpRecord) {
            return res.status(400).json({ error: 'Verification code not found' });
        }

        if (Date.now() > otpRecord.expiresAt) {
            await VerificationCode.deleteMany({ key: { $in: [username, tempToken] } });
            return res.status(400).json({ error: 'Code expired' });
        }

        if (String(otpRecord.value).trim() !== String(otp).trim()) {
            console.log(`[USER AUTH DEBUG] Invalid OTP for ${username}. Expected: ${otpRecord.value}, Got: ${otp}`);
            return res.status(401).json({ error: 'Invalid code' });
        }

        // Success: create user session
        const foundUserDetails = await User.findOne({ username, type: 'portal' });
        if (!foundUserDetails) {
            return res.status(500).json({ error: 'User not found' });
        }

        // Cleanup codes
        await VerificationCode.deleteMany({
            $or: [
                { type: 'user_otp', key: username },
                { type: 'user_temp_token', key: tempToken }
            ]
        });


        const token = generateToken();
        const expiresAt = new Date(Date.now() + (24 * 60 * 60 * 1000));

        const session = await AuthSession.create({
            token,
            username: foundUserDetails.username,
            email: foundUserDetails.email,
            name: foundUserDetails.name,
            type: 'portal',
            expiresAt
        });

        res.json({
            success: true,
            token,
            user: {
                username: session.username,
                email: session.email,
                name: session.name
            },
            expiresIn: 86400
        });
    } catch (error) {
        console.error('User Login Step 2 Error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});



/**
 * POST /api/v1/auth/user/logout
 * User dashboard logout
 */
const requireUserAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }
        const token = authHeader.split(' ')[1];
        const session = await AuthSession.findOne({ token, type: 'portal' });

        if (!session || Date.now() > session.expiresAt) {
            if (session) await AuthSession.deleteOne({ token });
            return res.status(401).json({ error: 'Invalid or expired token' });
        }
        req.user = session;
        next();
    } catch (error) {
        res.status(500).json({ error: 'Authentication error' });
    }
};

app.post('/api/v1/auth/user/logout', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            await AuthSession.deleteOne({ token, type: 'portal' });
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Logout failed' });
    }
});

/**
 * GET /api/v1/admin/portal-auth-settings
 * Get portal authentication settings (admin only)
 */
app.get('/api/v1/admin/portal-auth-settings', requireAdminAuth, async (req, res) => {
    try {
        let settings = await Settings.findOne({ key: 'portal_auth' });
        if (!settings) {
            settings = {
                value: {
                    otpEnabled: true,
                    sessionDurationHours: 24
                }
            };
        }
        res.json(settings.value);
    } catch (error) {
        console.error('[PORTAL AUTH] Get settings failed:', error);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

/**
 * PUT /api/v1/admin/portal-auth-settings
 * Update portal authentication settings (admin only)
 */
app.put('/api/v1/admin/portal-auth-settings', requireAdminAuth, async (req, res) => {
    try {
        const { otpEnabled, sessionDurationHours } = req.body;

        const settings = await Settings.findOneAndUpdate(
            { key: 'portal_auth' },
            {
                value: {
                    otpEnabled: otpEnabled !== false,
                    sessionDurationHours: sessionDurationHours || 24
                },
                updatedAt: new Date()
            },
            { new: true, upsert: true }
        );

        console.log(`[PORTAL AUTH] Settings updated - OTP: ${settings.value.otpEnabled ? 'Enabled' : 'Disabled'}`);

        // Broadcast to all connected admin clients
        io.emit('settings-update', { key: 'portal_auth', value: settings.value });

        res.json({
            success: true,
            settings: settings.value,
            message: `OTP ${settings.value.otpEnabled ? 'enabled' : 'disabled'} for portal login`
        });
    } catch (error) {
        console.error('[PORTAL AUTH] Update settings failed:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

/**
 * GET /api/v1/auth/portal-config
 * Public endpoint to check if OTP is required (for login page)
 */
app.get('/api/v1/auth/portal-config', async (req, res) => {
    try {
        const settings = await Settings.findOne({ key: 'portal_auth' });
        res.json({
            otpEnabled: settings?.value?.otpEnabled !== false
        });
    } catch (error) {
        res.json({ otpEnabled: true }); // Default to OTP enabled
    }
});


/**
 * GET /api/v1/auth/user/verify
 * Verify user token validity
 */
app.get('/api/v1/auth/user/verify', requireUserAuth, (req, res) => {
    res.json({
        valid: true,
        user: { username: req.user.username, email: req.user.email, name: req.user.name },
        expiresAt: req.user.expiresAt
    });
});


/**
 * POST /api/v1/auth/agent/users
 * Create new agent user (admin only)
 */
app.post('/api/v1/auth/agent/users', requireAdminAuth, async (req, res) => {
    try {
        const { username, password, name, email } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        const existing = await User.findOne({ username });
        if (existing) {
            return res.status(409).json({ error: 'Username already exists' });
        }

        const newUser = await User.create({
            username,
            passwordHash: hashPassword(password),
            email: email,
            name: name || username,
            type: 'agent',
            active: true
        });

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
app.get('/api/v1/auth/agent/users', requireAdminAuth, async (req, res) => {
    try {
        const users = await User.find({ type: 'agent' }).sort({ createdAt: -1 });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

/**
 * PUT /api/v1/auth/agent/users/:username
 * Update agent user (admin only)
 */
app.put('/api/v1/auth/agent/users/:username', requireAdminAuth, async (req, res) => {
    try {
        const { username } = req.params;
        const { password, name, active, email } = req.body;

        const updateData = {};
        if (password) updateData.passwordHash = hashPassword(password);
        if (name !== undefined) updateData.name = name;
        if (active !== undefined) updateData.active = active;
        if (email !== undefined) updateData.email = email;

        const user = await User.findOneAndUpdate(
            { username, type: 'agent' },
            { $set: updateData },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            success: true,
            user: { username: user.username, name: user.name, active: user.active }
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update user' });
    }
});

/**
 * DELETE /api/v1/auth/agent/users/:username
 * Delete agent user (admin only)
 */
app.delete('/api/v1/auth/agent/users/:username', requireAdminAuth, async (req, res) => {
    try {
        const { username } = req.params;
        const result = await User.deleteOne({ username, type: 'agent' });

        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

/**
 * ==================== STAFF/ADMIN MANAGEMENTUS ====================
 * Manage other administrators (Super Admin only)
 */

/**
 * GET /api/v1/auth/admin/staff
 * List all admin users
 */
app.get('/api/v1/auth/admin/staff', requireSuperAdminAuth, async (req, res) => {
    try {
        const admins = await User.find({ type: 'admin' }).sort({ createdAt: -1 });
        res.json(admins);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch staff' });
    }
});

/**
 * POST /api/v1/auth/admin/staff
 * Create new admin user
 */
app.post('/api/v1/auth/admin/staff', requireSuperAdminAuth, async (req, res) => {
    try {
        const { username, password, name, email, role } = req.body;

        if (!username || !password || !email) {
            return res.status(400).json({ error: 'Username, password and email required' });
        }

        const existing = await User.findOne({
            $or: [{ username }, { email }]
        });

        if (existing) {
            return res.status(409).json({ error: 'Username or email already exists' });
        }

        const newUser = await User.create({
            username,
            passwordHash: hashPassword(password),
            email,
            name: name || username,
            type: 'admin',
            role: role || 'Staff',
            active: true
        });

        res.json({
            success: true,
            user: { username: newUser.username, name: newUser.name, role: newUser.role }
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create staff member' });
    }
});

/**
 * PUT /api/v1/auth/admin/staff/:username
 * Update admin user
 */
app.put('/api/v1/auth/admin/staff/:username', requireSuperAdminAuth, async (req, res) => {
    try {
        const { username } = req.params;
        const { password, name, active, email, role } = req.body;

        const updateData = {};
        if (password) updateData.passwordHash = hashPassword(password);
        if (name !== undefined) updateData.name = name;
        if (active !== undefined) updateData.active = active;
        if (email !== undefined) updateData.email = email;
        if (role !== undefined) updateData.role = role;

        const user = await User.findOneAndUpdate(
            { username, type: 'admin' },
            { $set: updateData },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({ error: 'Staff member not found' });
        }

        res.json({
            success: true,
            user: { username: user.username, name: user.name, role: user.role, active: user.active }
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update staff member' });
    }
});

/**
 * DELETE /api/v1/auth/admin/staff/:username
 * Delete admin user
 */
app.delete('/api/v1/auth/admin/staff/:username', requireSuperAdminAuth, async (req, res) => {
    try {
        const { username } = req.params;
        const result = await User.deleteOne({ username, type: 'admin' });

        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Staff member not found' });
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete staff member' });
    }
});

/**
 * ==================== PORTAL USERS (userAccounts) ====================
 * These are users who log into the User Portal (web)
 */

/**
 * GET /api/v1/auth/portal/users
 * List all portal users (admin only)
 */
app.get('/api/v1/auth/portal/users', requireAdminAuth, async (req, res) => {
    try {
        const users = await User.find({ type: 'portal' }).sort({ createdAt: -1 });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch portal users' });
    }
});

/**
 * POST /api/v1/auth/portal/users
 * Create new portal user (admin only)
 */
app.post('/api/v1/auth/portal/users', requireAdminAuth, async (req, res) => {
    try {
        const { username, password, email, name } = req.body;

        if (!username || !password || !email) {
            return res.status(400).json({ error: 'Username, password and email required' });
        }

        const existing = await User.findOne({ username });
        if (existing) {
            return res.status(409).json({ error: 'Username already exists' });
        }

        const newUser = await User.create({
            username,
            email,
            passwordHash: hashPassword(password),
            name: name || username,
            type: 'portal',
            active: true
        });

        res.json({
            success: true,
            user: { username: newUser.username, email: newUser.email, name: newUser.name }
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create portal user' });
    }
});

/**
 * PUT /api/v1/auth/portal/users/:username
 * Update portal user (admin only)
 */
app.put('/api/v1/auth/portal/users/:username', requireAdminAuth, async (req, res) => {
    try {
        const { username } = req.params;
        const { password, email, name, active } = req.body;

        const updateData = {};
        if (password) updateData.passwordHash = hashPassword(password);
        if (email) updateData.email = email;
        if (name !== undefined) updateData.name = name;
        if (active !== undefined) updateData.active = active;

        const user = await User.findOneAndUpdate(
            { username, type: 'portal' },
            { $set: updateData },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            success: true,
            user: { username: user.username, email: user.email, name: user.name, active: user.active }
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update portal user' });
    }
});

/**
 * DELETE /api/v1/auth/portal/users/:username
 * Delete portal user (admin only)
 */
app.delete('/api/v1/auth/portal/users/:username', requireAdminAuth, async (req, res) => {
    try {
        const { username } = req.params;
        const result = await User.deleteOne({ username, type: 'portal' });

        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete portal user' });
    }
});


/**
 * POST /api/v1/admin/cleanup-demo-users
 * Remove all demo/test users (Admin only)
 * This is a protected bulk cleanup endpoint
 */
app.post('/api/v1/admin/cleanup-demo-users', requireAdminAuth, async (req, res) => {
    try {
        console.log('[ADMIN] Starting demo user cleanup...');

        // Pattern matching for demo data
        const demoPatterns = {
            $or: [
                { username: /^agent\d+$/i },           // agent1, agent2, etc.
                { username: 'demo' },
                { username: /test/i },
                { name: 'Demo User' },
                { name: /^Agent User \d+$/i },         // Agent User 1, Agent User 2, etc.
                { email: /example\.com$/i },           // demo@example.com
                { email: /test@/i }
            ]
        };

        // Get users to be deleted for logging
        const usersToDelete = await User.find(demoPatterns);
        const usernames = usersToDelete.map(u => u.username);

        console.log(`[ADMIN] Found ${usersToDelete.length} demo users to delete:`, usernames);

        // Delete demo users
        const deleteResult = await User.deleteMany(demoPatterns);

        // Clean up orphaned sessions
        const sessionDeleteResult = await Session.deleteMany({
            user: { $in: usernames }
        });

        console.log(`[ADMIN] Deleted ${deleteResult.deletedCount} demo users and ${sessionDeleteResult.deletedCount} sessions`);

        res.json({
            success: true,
            deletedUsers: deleteResult.deletedCount,
            deletedSessions: sessionDeleteResult.deletedCount,
            deletedUsernames: usernames
        });
    } catch (error) {
        console.error('[ADMIN] Cleanup failed:', error);
        res.status(500).json({ error: 'Failed to cleanup demo users' });
    }
});


// ==================== SETTINGS API ENDPOINTS ====================

/**
 * GET /api/v1/admin/settings
 * Get all admin settings
 */
app.get('/api/v1/admin/settings', requireAdminAuth, async (req, res) => {
    try {
        const settings = await Settings.find();
        const settingsObj = {};
        settings.forEach(s => {
            settingsObj[s.key] = s.value;
        });
        res.json(settingsObj);
    } catch (error) {
        console.error('[SETTINGS] Get failed:', error);
        res.status(500).json({ error: 'Failed to get settings' });
    }
});

/**
 * POST /api/v1/admin/settings
 * Save admin settings (key-value pairs)
 */
app.post('/api/v1/admin/settings', requireAdminAuth, async (req, res) => {
    try {
        const { settings } = req.body;

        if (!settings || typeof settings !== 'object') {
            return res.status(400).json({ error: 'Settings object required' });
        }

        const updates = [];
        for (const [key, value] of Object.entries(settings)) {
            updates.push(
                Settings.findOneAndUpdate(
                    { key },
                    { value, updatedAt: new Date() },
                    { upsert: true, new: true }
                )
            );
        }

        await Promise.all(updates);
        console.log('[SETTINGS] Updated:', Object.keys(settings));

        res.json({ success: true, message: 'Settings saved successfully' });
    } catch (error) {
        console.error('[SETTINGS] Save failed:', error);
        res.status(500).json({ error: 'Failed to save settings' });
    }
});


// ==================== BLOCKLIST API ENDPOINTS ====================

/**
 * GET /api/v1/admin/blocklist
 * Get all blocked sites
 */
app.get('/api/v1/admin/blocklist', requireAdminAuth, async (req, res) => {
    try {
        const blocklist = await Blocklist.find({ active: true }).sort({ createdAt: -1 });
        res.json(blocklist);
    } catch (error) {
        console.error('[BLOCKLIST] Get failed:', error);
        res.status(500).json({ error: 'Failed to get blocklist' });
    }
});

/**
 * POST /api/v1/admin/blocklist
 * Add a site to blocklist
 */
app.post('/api/v1/admin/blocklist', requireAdminAuth, async (req, res) => {
    try {
        const { url, reason } = req.body;

        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        // Extract domain
        let domain;
        try {
            const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
            domain = urlObj.hostname;
        } catch {
            domain = url;
        }

        // Check if already blocked
        const existing = await Blocklist.findOne({ domain, active: true });
        if (existing) {
            return res.status(400).json({ error: 'This domain is already blocked' });
        }

        const blocked = await Blocklist.create({
            url,
            domain,
            reason: reason || 'Blocked by admin',
            blockedBy: req.admin.username || 'admin'
        });

        console.log(`[BLOCKLIST] Site blocked: ${domain} by ${req.admin.username}`);

        // Notify all connected agents about the new block
        io.emit('blocklist-updated', { action: 'add', domain, url });

        res.json({ success: true, blocked });
    } catch (error) {
        console.error('[BLOCKLIST] Add failed:', error);
        res.status(500).json({ error: 'Failed to add to blocklist' });
    }
});

/**
 * DELETE /api/v1/admin/blocklist/:id
 * Remove a site from blocklist
 */
app.delete('/api/v1/admin/blocklist/:id', requireAdminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const blocked = await Blocklist.findByIdAndUpdate(id, { active: false });

        if (!blocked) {
            return res.status(404).json({ error: 'Block entry not found' });
        }

        console.log(`[BLOCKLIST] Site unblocked: ${blocked.domain}`);

        // Notify all connected agents
        io.emit('blocklist-updated', { action: 'remove', domain: blocked.domain });

        res.json({ success: true, message: 'Site removed from blocklist' });
    } catch (error) {
        console.error('[BLOCKLIST] Delete failed:', error);
        res.status(500).json({ error: 'Failed to remove from blocklist' });
    }
});

/**
 * GET /api/v1/agent/blocklist
 * Get blocklist for agents (public endpoint for agents)
 */
app.get('/api/v1/agent/blocklist', async (req, res) => {
    try {
        const blocklist = await Blocklist.find({ active: true });
        res.json(blocklist.map(b => b.domain));
    } catch (error) {
        res.status(500).json({ error: 'Failed to get blocklist' });
    }
});


// ==================== ADMIN PASSWORD CHANGE ====================

/**
 * POST /api/v1/admin/change-password
 * Change admin password
 */
app.post('/api/v1/admin/change-password', requireAdminAuth, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current and new password required' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'New password must be at least 6 characters' });
        }

        const username = req.admin.username;

        // For super admin, check against env config
        if (username.toLowerCase() === ADMIN_CONFIG.username.toLowerCase()) {
            // Verify current password
            if (!verifyPassword(currentPassword, ADMIN_CONFIG.passwordHash)) {
                return res.status(401).json({ error: 'Current password is incorrect' });
            }

            // Super admin password is stored in env, so we save it to settings
            await Settings.findOneAndUpdate(
                { key: 'super_admin_password_hash' },
                { value: hashPassword(newPassword), updatedAt: new Date() },
                { upsert: true }
            );

            console.log('[ADMIN] Super admin password changed');
            res.json({ success: true, message: 'Password changed successfully' });
        } else {
            // For DB admin users
            const adminUser = await User.findOne({ username, type: 'admin' });
            if (!adminUser) {
                return res.status(404).json({ error: 'Admin user not found' });
            }

            if (!verifyPassword(currentPassword, adminUser.passwordHash)) {
                return res.status(401).json({ error: 'Current password is incorrect' });
            }

            adminUser.passwordHash = hashPassword(newPassword);
            await adminUser.save();

            console.log(`[ADMIN] Password changed for: ${username}`);
            res.json({ success: true, message: 'Password changed successfully' });
        }
    } catch (error) {
        console.error('[ADMIN] Password change failed:', error);
        res.status(500).json({ error: 'Failed to change password' });
    }
});


// ==================== RESOURCE MANAGEMENT: TEMPLATES ====================

/**
 * GET /api/v1/templates
 * Get all templates (public - for user portal)
 */
app.get('/api/v1/templates', async (req, res) => {
    try {
        const templates = await Template.find().sort({ createdAt: -1 });
        res.json(templates);
    } catch (error) {
        console.error('[TEMPLATES] Get failed:', error);
        res.status(500).json({ error: 'Failed to get templates' });
    }
});

/**
 * POST /api/v1/admin/templates
 * Create a new template with optional file upload (admin only)
 */
app.post('/api/v1/admin/templates', requireAdminAuth, upload.single('file'), async (req, res) => {
    try {
        const { title, description, category, type, previewUrl, featured } = req.body;

        if (!title || !description || !category || !type) {
            return res.status(400).json({ error: 'Title, description, category, and type are required' });
        }

        const templateData = {
            title,
            description,
            category,
            type,
            previewUrl,
            featured: featured === 'true' || featured === true
        };

        // Handle file upload
        if (req.file) {
            templateData.fileUrl = `/uploads/${req.file.filename}`;
            templateData.fileOriginalName = req.file.originalname;
            templateData.fileMimeType = req.file.mimetype;
            templateData.fileSize = req.file.size;
        }

        const template = await Template.create(templateData);
        console.log(`[TEMPLATES] Created: ${title}`);
        res.json(template);
    } catch (error) {
        console.error('[TEMPLATES] Create failed:', error);
        res.status(500).json({ error: 'Failed to create template' });
    }
});

/**
 * DELETE /api/v1/admin/templates/:id
 * Delete a template (admin only)
 */
app.delete('/api/v1/admin/templates/:id', requireAdminAuth, async (req, res) => {
    try {
        const template = await Template.findByIdAndDelete(req.params.id);
        if (!template) {
            return res.status(404).json({ error: 'Template not found' });
        }

        // Delete associated file if exists
        if (template.fileUrl) {
            const filePath = path.join(__dirname, template.fileUrl);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        console.log(`[TEMPLATES] Deleted: ${template.title}`);
        res.json({ success: true, message: 'Template deleted' });
    } catch (error) {
        console.error('[TEMPLATES] Delete failed:', error);
        res.status(500).json({ error: 'Failed to delete template' });
    }
});

/**
 * GET /api/v1/templates/:id/download
 * Download a template file (public)
 */
app.get('/api/v1/templates/:id/download', async (req, res) => {
    try {
        const template = await Template.findById(req.params.id);
        if (!template) {
            return res.status(404).json({ error: 'Template not found' });
        }

        if (!template.fileUrl) {
            return res.status(404).json({ error: 'No file attached to this template' });
        }

        const filePath = path.join(__dirname, template.fileUrl);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found on server' });
        }

        // Increment download count
        await Template.findByIdAndUpdate(req.params.id, { $inc: { downloads: 1 } });

        res.download(filePath, template.fileOriginalName || 'template');
    } catch (error) {
        console.error('[TEMPLATES] Download failed:', error);
        res.status(500).json({ error: 'Failed to download template' });
    }
});


// ==================== RESOURCE MANAGEMENT: COURSES (LEARNING) ====================

/**
 * GET /api/v1/courses
 * Get all courses (public - for user portal)
 */
app.get('/api/v1/courses', async (req, res) => {
    try {
        const courses = await Course.find().sort({ createdAt: -1 });
        res.json(courses);
    } catch (error) {
        console.error('[COURSES] Get failed:', error);
        res.status(500).json({ error: 'Failed to get courses' });
    }
});

/**
 * POST /api/v1/admin/courses
 * Create a new course with optional file upload (admin only)
 */
app.post('/api/v1/admin/courses', requireAdminAuth, upload.single('file'), async (req, res) => {
    try {
        const { title, description, category, duration, lessons, level, content, featured } = req.body;

        if (!title || !description || !category || !duration) {
            return res.status(400).json({ error: 'Title, description, category, and duration are required' });
        }

        const courseData = {
            title,
            description,
            category,
            duration,
            lessons: parseInt(lessons) || 0,
            level: level || 'Beginner',
            content,
            featured: featured === 'true' || featured === true
        };

        // Handle file upload
        if (req.file) {
            courseData.fileUrl = `/uploads/${req.file.filename}`;
            courseData.fileOriginalName = req.file.originalname;
            courseData.fileMimeType = req.file.mimetype;
            courseData.fileSize = req.file.size;
        }

        const course = await Course.create(courseData);
        console.log(`[COURSES] Created: ${title}`);
        res.json(course);
    } catch (error) {
        console.error('[COURSES] Create failed:', error);
        res.status(500).json({ error: 'Failed to create course' });
    }
});

/**
 * DELETE /api/v1/admin/courses/:id
 * Delete a course (admin only)
 */
app.delete('/api/v1/admin/courses/:id', requireAdminAuth, async (req, res) => {
    try {
        const course = await Course.findByIdAndDelete(req.params.id);
        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }

        // Delete associated file if exists
        if (course.fileUrl) {
            const filePath = path.join(__dirname, course.fileUrl);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        console.log(`[COURSES] Deleted: ${course.title}`);
        res.json({ success: true, message: 'Course deleted' });
    } catch (error) {
        console.error('[COURSES] Delete failed:', error);
        res.status(500).json({ error: 'Failed to delete course' });
    }
});

/**
 * GET /api/v1/courses/:id/download
 * Download a course file (public)
 */
app.get('/api/v1/courses/:id/download', async (req, res) => {
    try {
        const course = await Course.findById(req.params.id);
        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }

        if (!course.fileUrl) {
            return res.status(404).json({ error: 'No file attached to this course' });
        }

        const filePath = path.join(__dirname, course.fileUrl);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found on server' });
        }

        res.download(filePath, course.fileOriginalName || 'course-material');
    } catch (error) {
        console.error('[COURSES] Download failed:', error);
        res.status(500).json({ error: 'Failed to download course' });
    }
});


// ==================== RESOURCE MANAGEMENT: GUIDES (GUIDANCE) ====================

/**
 * GET /api/v1/guides
 * Get all guides (public - for user portal)
 */
app.get('/api/v1/guides', async (req, res) => {
    try {
        const guides = await Guide.find().sort({ createdAt: -1 });
        res.json(guides);
    } catch (error) {
        console.error('[GUIDES] Get failed:', error);
        res.status(500).json({ error: 'Failed to get guides' });
    }
});

/**
 * POST /api/v1/admin/guides
 * Create a new guide with optional file upload (admin only)
 */
app.post('/api/v1/admin/guides', requireAdminAuth, upload.single('file'), async (req, res) => {
    try {
        const { title, description, objective, type, duration, content, popular } = req.body;

        if (!title || !description || !objective || !duration) {
            return res.status(400).json({ error: 'Title, description, objective, and duration are required' });
        }

        const guideData = {
            title,
            description,
            objective,
            type: type || 'Guide',
            duration,
            content,
            popular: popular === 'true' || popular === true
        };

        // Handle file upload
        if (req.file) {
            guideData.fileUrl = `/uploads/${req.file.filename}`;
            guideData.fileOriginalName = req.file.originalname;
            guideData.fileMimeType = req.file.mimetype;
            guideData.fileSize = req.file.size;
        }

        const guide = await Guide.create(guideData);
        console.log(`[GUIDES] Created: ${title}`);
        res.json(guide);
    } catch (error) {
        console.error('[GUIDES] Create failed:', error);
        res.status(500).json({ error: 'Failed to create guide' });
    }
});

/**
 * DELETE /api/v1/admin/guides/:id
 * Delete a guide (admin only)
 */
app.delete('/api/v1/admin/guides/:id', requireAdminAuth, async (req, res) => {
    try {
        const guide = await Guide.findByIdAndDelete(req.params.id);
        if (!guide) {
            return res.status(404).json({ error: 'Guide not found' });
        }

        // Delete associated file if exists
        if (guide.fileUrl) {
            const filePath = path.join(__dirname, guide.fileUrl);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        console.log(`[GUIDES] Deleted: ${guide.title}`);
        res.json({ success: true, message: 'Guide deleted' });
    } catch (error) {
        console.error('[GUIDES] Delete failed:', error);
        res.status(500).json({ error: 'Failed to delete guide' });
    }
});

/**
 * GET /api/v1/guides/:id/download
 * Download a guide file (public)
 */
app.get('/api/v1/guides/:id/download', async (req, res) => {
    try {
        const guide = await Guide.findById(req.params.id);
        if (!guide) {
            return res.status(404).json({ error: 'Guide not found' });
        }

        if (!guide.fileUrl) {
            return res.status(404).json({ error: 'No file attached to this guide' });
        }

        const filePath = path.join(__dirname, guide.fileUrl);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found on server' });
        }

        res.download(filePath, guide.fileOriginalName || 'guide');
    } catch (error) {
        console.error('[GUIDES] Download failed:', error);
        res.status(500).json({ error: 'Failed to download guide' });
    }
});


// ==================== AGENT API ENDPOINTS ====================


/**
 * POST /api/v1/agent/sync
 * Receives heartbeat/status updates from agents
 */
app.post('/api/v1/agent/sync', async (req, res) => {
    try {
        const data = req.body;

        if (!data.clientId) {
            return res.status(400).json({ error: 'Missing clientId' });
        }

        // Update computer status in MongoDB
        const computerData = {
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

        const computer = await Computer.findOneAndUpdate(
            { clientId: data.clientId },
            { $set: computerData },
            { upsert: true, new: true }
        );

        console.log(`[SYNC] Computer updated: ${data.hostname} (${data.clientId}) - Status: ${data.status}`);

        // SYNC IN-MEMORY MAP (Fixes Dashboard & Socket Stats)
        computers.set(data.clientId, {
            ...computer.toObject(),
            isOnline: true
        });

        // Store activity log in MongoDB
        await Log.create({
            type: 'activity',
            clientId: data.clientId,
            hostname: data.hostname,
            sessionId: data.sessionId,
            sessionUser: data.sessionUser,
            data: {
                ...data.activity,
                screenshot: data.activity?.screenshot ? '[CAPTURED]' : null
            },
            receivedAt: new Date().toISOString()
        });

        // Broadcast to admin dashboards
        io.emit('computer-update', {
            ...computer.toObject(),
            isOnline: true
        });

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
app.post('/api/v1/agent/session', async (req, res) => {
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

        // Store session record in MongoDB
        const session = await Session.create({
            ...data,
            charges: sessionCharges,
            receivedAt: new Date().toISOString()
        });

        // Batch create logs for this session
        const logTasks = [];

        // Store print jobs
        if (data.printJobs && data.printJobs.length > 0) {
            data.printJobs.forEach(job => {
                logTasks.push(Log.create({
                    type: 'print',
                    clientId: data.clientId,
                    hostname: data.hostname,
                    sessionId: data.sessionId,
                    sessionUser: data.user,
                    data: job,
                    receivedAt: new Date().toISOString()
                }));
            });
        }

        // Store browser history
        if (data.browsedUrls && data.browsedUrls.length > 0) {
            data.browsedUrls.forEach(url => {
                logTasks.push(Log.create({
                    type: 'browser',
                    clientId: data.clientId,
                    hostname: data.hostname,
                    sessionId: data.sessionId,
                    sessionUser: data.user,
                    data: url,
                    receivedAt: new Date().toISOString()
                }));
            });
        }

        // Store file activity
        if (data.filesCreated && data.filesCreated.length > 0) {
            data.filesCreated.forEach(file => {
                logTasks.push(Log.create({
                    type: 'file',
                    clientId: data.clientId,
                    hostname: data.hostname,
                    sessionId: data.sessionId,
                    sessionUser: data.user,
                    data: { ...file, action: 'created' },
                    receivedAt: new Date().toISOString()
                }));
            });
        }

        // Store USB events
        if (data.usbDevicesUsed && data.usbDevicesUsed.length > 0) {
            data.usbDevicesUsed.forEach(device => {
                logTasks.push(Log.create({
                    type: 'usb',
                    clientId: data.clientId,
                    hostname: data.hostname,
                    sessionId: data.sessionId,
                    sessionUser: data.user,
                    data: device,
                    receivedAt: new Date().toISOString()
                }));
            });
        }

        // Wait for all logs to be saved
        if (logTasks.length > 0) await Promise.all(logTasks);

        // Broadcast session event to admin
        io.emit('session-event', session);

        // IMPORTANT: Record session charges as a transaction for revenue tracking
        if (data.type === 'LOGOUT' && sessionCharges && sessionCharges.grandTotal > 0) {
            const sessionTransaction = await Transaction.create({
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
                }
            });

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


/**
 * POST /api/v1/agent/log
 * Receives specific event logs (print, browser, file, usb) in real-time
 */
app.post('/api/v1/agent/log', async (req, res) => {
    try {
        const { type, clientId, hostname, sessionId, sessionUser, data } = req.body;

        if (!clientId || !type) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Enhance browser log with category if not provided
        let enhancedData = data;
        if (type === 'browser' && data && !data.category) {
            enhancedData = {
                ...data,
                category: categorizeUrl(data.url)
            };
        }

        const logEntry = await Log.create({
            type,
            clientId,
            hostname,
            sessionId,
            sessionUser,
            data: enhancedData,
            receivedAt: new Date()
        });

        // Broadcast to admin dashboard for real-time updates
        io.emit('new-log', logEntry);

        res.json({ success: true, id: logEntry._id });
    } catch (error) {
        console.error('Log Ingestion Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Categorize a URL based on its domain
 */
function categorizeUrl(url) {
    if (!url) return 'other';

    const CATEGORY_DOMAINS = {
        search: ['google.com', 'bing.com', 'duckduckgo.com', 'yahoo.com', 'baidu.com', 'yandex.com'],
        social: ['facebook.com', 'twitter.com', 'x.com', 'instagram.com', 'linkedin.com', 'tiktok.com', 'reddit.com', 'pinterest.com', 'snapchat.com', 'whatsapp.com', 'telegram.org', 'discord.com'],
        video: ['youtube.com', 'vimeo.com', 'netflix.com', 'twitch.tv', 'dailymotion.com', 'hulu.com', 'disneyplus.com', 'primevideo.com'],
        education: ['wikipedia.org', 'coursera.org', 'udemy.com', 'edx.org', 'khanacademy.org', 'medium.com', 'stackoverflow.com', 'w3schools.com', 'freecodecamp.org', 'udacity.com'],
        development: ['github.com', 'gitlab.com', 'bitbucket.org', 'npmjs.com', 'pypi.org', 'developer.mozilla.org', 'codepen.io', 'jsfiddle.net', 'replit.com', 'vercel.com', 'netlify.com', 'heroku.com'],
        productivity: ['docs.google.com', 'sheets.google.com', 'slides.google.com', 'drive.google.com', 'notion.so', 'trello.com', 'asana.com', 'slack.com', 'zoom.us', 'meet.google.com', 'teams.microsoft.com', 'office.com'],
        shopping: ['amazon.com', 'ebay.com', 'aliexpress.com', 'alibaba.com', 'etsy.com', 'shopify.com', 'walmart.com', 'target.com', 'jumia.co.ke'],
        entertainment: ['spotify.com', 'soundcloud.com', 'pandora.com', 'crunchyroll.com', 'funimation.com'],
        news: ['cnn.com', 'bbc.com', 'nytimes.com', 'washingtonpost.com', 'theguardian.com', 'reuters.com', 'apnews.com', 'aljazeera.com']
    };

    try {
        const hostname = new URL(url).hostname.replace('www.', '');

        for (const [category, domains] of Object.entries(CATEGORY_DOMAINS)) {
            for (const domain of domains) {
                if (hostname === domain || hostname.endsWith('.' + domain)) {
                    return category;
                }
            }
        }
    } catch (e) {
        // URL parsing failed
    }

    return 'other';
}

// User authentication middleware is defined later in the file

// ==================== ADMIN API ENDPOINTS ====================

/**
 * GET /api/v1/admin/download-agent
 * Download the latest desktop agent installer
 */
app.get('/api/v1/admin/download-agent', (req, res) => {
    try {
        const files = fs.readdirSync(DOWNLOADS_DIR);
        const agentFile = files.find(f => f.endsWith('.exe') || f.endsWith('.msi') || f.endsWith('.zip'));

        if (!agentFile) {
            return res.status(404).json({ error: 'Agent installer not found on server' });
        }

        const filePath = path.join(DOWNLOADS_DIR, agentFile);
        res.download(filePath, agentFile);
    } catch (error) {
        res.status(500).json({ error: 'Failed to access downloads' });
    }
});

// NOTE: Inventory management routes are defined later in the file (around line 4700+)
// with proper authentication, email alerts, and enhanced features.
// See the "INVENTORY MANAGEMENT" section near the end of the file.

/**
 * GET /api/v1/admin/computers
 * Returns list of all computers and their real-time status
 */
app.get('/api/v1/admin/computers', async (req, res) => {
    try {
        const computerDocs = await Computer.find();
        const now = new Date();
        const computerList = computerDocs.map(c => {
            const doc = c.toObject();
            return {
                ...doc,
                isOnline: (now - new Date(doc.lastSeen)) < 45000
            };
        });
        res.json(computerList);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch computers' });
    }
});


/**
 * GET /api/v1/admin/computers/:clientId
 * Returns detailed info for a specific computer
 */
app.get('/api/v1/admin/computers/:clientId', async (req, res) => {
    try {
        const computer = await Computer.findOne({ clientId: req.params.clientId });
        if (!computer) {
            return res.status(404).json({ error: 'Computer not found' });
        }

        // Include recent activity for this computer from Log model
        const recentActivity = await Log.find({ clientId: req.params.clientId, type: 'activity' })
            .sort({ receivedAt: -1 })
            .limit(20);

        res.json({ ...computer.toObject(), recentActivity });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch computer details' });
    }
});

/**
 * GET /api/v1/admin/sessions
 * Returns session records with filtering
 */
app.get('/api/v1/admin/sessions', async (req, res) => {
    try {
        const { limit = 100, clientId, user, type } = req.query;

        const query = {};
        if (clientId) query.clientId = clientId;
        if (user) query.user = { $regex: user, $options: 'i' };
        if (type) query.type = type;

        const sessionDocs = await Session.find(query)
            .sort({ receivedAt: -1 })
            .limit(parseInt(limit));

        res.json(sessionDocs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch sessions' });
    }
});


/**
 * GET /api/v1/admin/print-jobs
 * Returns print job records with filtering
 */
/**
 * GET /api/v1/admin/print-jobs
 * Returns print job records with filtering from Logs
 */
app.get('/api/v1/admin/print-jobs', async (req, res) => {
    try {
        const { limit = 100, clientId, user, printType } = req.query;

        const query = { type: 'print' };
        if (clientId) query.clientId = clientId;
        if (user) query.sessionUser = { $regex: user, $options: 'i' };

        const logs = await Log.find(query)
            .sort({ receivedAt: -1 })
            .limit(parseInt(limit));

        const jobs = logs.map(l => {
            const doc = l.toObject();
            return {
                ...doc.data,
                id: doc._id,
                clientId: doc.clientId,
                hostname: doc.hostname,
                sessionUser: doc.sessionUser,
                receivedAt: doc.receivedAt
            };
        });

        // Filter by printType if requested (since it's inside data field)
        const finalJobs = printType ? jobs.filter(j => j.printType === printType) : jobs;

        // Calculate totals (for the set being returned or the whole query?)
        // Usually totals should be for the filtered set
        const totals = {
            totalJobs: finalJobs.length,
            bwPages: finalJobs.filter(j => j.printType === 'bw').reduce((sum, j) => sum + (j.totalPages || j.pages || 1), 0),
            colorPages: finalJobs.filter(j => j.printType === 'color').reduce((sum, j) => sum + (j.totalPages || j.pages || 1), 0),
            bwRevenue: 0,
            colorRevenue: 0
        };
        totals.bwRevenue = totals.bwPages * pricing.printBW;
        totals.colorRevenue = totals.colorPages * pricing.printColor;
        totals.totalRevenue = totals.bwRevenue + totals.colorRevenue;

        res.json({
            jobs: finalJobs,
            totals
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch print jobs' });
    }
});

/**
 * GET /api/v1/admin/printers
 * Returns latest connected printers per computer
 */
app.get('/api/v1/admin/printers', async (req, res) => {
    try {
        const { clientId } = req.query;

        // Find the latest printer log for each client
        const query = { type: 'printers' };
        if (clientId) query.clientId = clientId;

        // Aggregate to get the most recent printer log per clientId
        const printers = await Log.aggregate([
            { $match: query },
            { $sort: { receivedAt: -1 } },
            {
                $group: {
                    _id: '$clientId',
                    hostname: { $first: '$hostname' },
                    printers: { $first: '$data.printers' },
                    lastUpdated: { $first: '$receivedAt' }
                }
            },
            {
                $project: {
                    clientId: '$_id',
                    hostname: 1,
                    printers: 1,
                    lastUpdated: 1,
                    _id: 0
                }
            }
        ]);

        res.json(printers);
    } catch (error) {
        console.error('Fetch Printers Error:', error);
        res.status(500).json({ error: 'Failed to fetch printers' });
    }
});

/**
 * GET /api/v1/admin/browser-history
 * Returns browser history records
 */
/**
 * GET /api/v1/admin/browser-history
 * Returns browser history records from Logs
 */
app.get('/api/v1/admin/browser-history', async (req, res) => {
    try {
        const { limit = 200, clientId, user } = req.query;

        const query = { type: 'browser' };
        if (clientId) query.clientId = clientId;
        if (user) query.sessionUser = { $regex: user, $options: 'i' };

        const logs = await Log.find(query)
            .sort({ receivedAt: -1 })
            .limit(parseInt(limit));

        const history = logs.map(l => {
            const doc = l.toObject();
            return {
                ...doc.data,
                id: doc._id,
                clientId: doc.clientId,
                hostname: doc.hostname,
                sessionUser: doc.sessionUser,
                receivedAt: doc.receivedAt
            };
        });

        res.json(history);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch browser history' });
    }
});

/**
 * GET /api/v1/admin/file-activity
 * Returns file creation/modification logs with category support
 */
/**
 * GET /api/v1/admin/file-activity
 * Returns file creation/modification logs from database
 */
app.get('/api/v1/admin/file-activity', async (req, res) => {
    try {
        const { limit = 200, clientId, user, category, groupByCategory } = req.query;

        const query = { type: 'file' };
        if (clientId) query.clientId = clientId;
        if (user) query.sessionUser = { $regex: user, $options: 'i' };

        const logs = await Log.find(query)
            .sort({ receivedAt: -1 })
            .limit(parseInt(limit));

        let filtered = logs.map(l => {
            const doc = l.toObject();
            return {
                ...doc.data,
                id: doc._id,
                clientId: doc.clientId,
                hostname: doc.hostname,
                sessionUser: doc.sessionUser,
                receivedAt: doc.receivedAt
            };
        });

        if (category) {
            filtered = filtered.filter(f => f.category === category);
        }

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
            res.json(filtered);
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch file activity' });
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
 * Returns aggregated file statistics by category from database
 */
app.get('/api/v1/admin/file-stats', async (req, res) => {
    try {
        const { clientId } = req.query;

        const query = { type: 'file' };
        if (clientId) query.clientId = clientId;

        const logs = await Log.find(query).sort({ receivedAt: -1 });

        const filtered = logs.map(l => {
            const doc = l.toObject();
            return {
                ...doc.data,
                id: doc._id,
                clientId: doc.clientId,
                hostname: doc.hostname,
                sessionUser: doc.sessionUser,
                receivedAt: doc.receivedAt
            };
        });

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
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch file stats' });
    }
});

/**
 * GET /api/v1/admin/usb-events
 * Returns USB device connection events
 */
/**
 * GET /api/v1/admin/usb-events
 * Returns USB device connection events from database
 */
app.get('/api/v1/admin/usb-events', async (req, res) => {
    try {
        const { limit = 100, clientId } = req.query;

        const query = { type: 'usb' };
        if (clientId) query.clientId = clientId;

        const logs = await Log.find(query)
            .sort({ receivedAt: -1 })
            .limit(parseInt(limit));

        res.json(logs.map(l => {
            const doc = l.toObject();
            return {
                ...doc.data,
                id: doc._id,
                clientId: doc.clientId,
                hostname: doc.hostname,
                sessionUser: doc.sessionUser,
                receivedAt: doc.receivedAt
            };
        }));
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch USB events' });
    }
});

/**
 * GET /api/v1/admin/activity
 * Returns recent activity logs
 */
/**
 * GET /api/v1/admin/activity
 * Returns recent activity logs from database
 */
app.get('/api/v1/admin/activity', async (req, res) => {
    try {
        const { limit = 50, clientId } = req.query;

        const query = { type: 'activity' };
        if (clientId) query.clientId = clientId;

        const logs = await Log.find(query)
            .sort({ receivedAt: -1 })
            .limit(parseInt(limit));

        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch activity logs' });
    }
});

/**
 * GET /api/v1/admin/stats
 * Returns aggregate dashboard statistics from database
 */
app.get('/api/v1/admin/stats', async (req, res) => {
    try {
        // Fetch real-time count from DB for reliability
        const computerDocs = await Computer.find();
        const now = new Date();
        const allComputers = computerDocs.map(c => ({
            ...c.toObject(),
            isOnline: (now - new Date(c.lastSeen)) < 45000 // 45s grace period
        }));

        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        // Fetch statistics from DB
        const [todaySessions, todayPrintJobs] = await Promise.all([
            Session.find({ receivedAt: { $gte: todayStart } }),
            Log.find({ type: 'print', receivedAt: { $gte: todayStart } })
        ]);

        // Calculate session revenues
        const todaySessionRevenue = todaySessions
            .filter(s => s.type === 'LOGOUT' && s.charges)
            .reduce((sum, s) => sum + (s.charges.grandTotal || 0), 0);

        // Calculate printing revenues
        const todayPrintRevenue = todayPrintJobs.reduce((sum, j) => {
            const data = j.data || {};
            const pages = data.totalPages || data.pages || 1;
            const rate = data.printType === 'color' ? pricing.printColor : pricing.printBW;
            return sum + (pages * rate);
        }, 0);

        res.json({
            computers: {
                total: allComputers.length,
                online: allComputers.filter(c => c.isOnline).length,
                busy: allComputers.filter(c => c.status === 'unlocked' && c.sessionUser).length,
                offline: allComputers.filter(c => !c.isOnline).length
            },
            revenue: {
                today: todaySessionRevenue + todayPrintRevenue,
                sessions: todaySessionRevenue,
                printing: todayPrintRevenue
            },
            sessions: {
                today: todaySessions.filter(s => s.type === 'LOGIN').length,
                active: allComputers.filter(c => c.status === 'unlocked' && c.sessionUser).length
            },
            recentActivity: todaySessions.slice(0, 10),
            pricing: pricing
        });
    } catch (error) {
        console.error('Stats Error:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
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

// ==================== DOCUMENT SHARING TO COMPUTERS ====================

/**
 * POST /api/v1/documents/send-to-computer
 * Send a file directly to a specific computer
 */
app.post('/api/v1/documents/send-to-computer', upload.single('file'), async (req, res) => {
    try {
        const { targetClientId, targetHostname, message } = req.body;

        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        if (!targetClientId) {
            return res.status(400).json({ error: 'Target client ID required' });
        }

        const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;

        // Create SharedDocument record
        const docRecord = await SharedDocument.create({
            id: 'doc-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
            filename: req.file.originalname,
            storedName: req.file.filename,
            path: req.file.path,
            size: req.file.size,
            sizeFormatted: (req.file.size / 1024).toFixed(1) + ' KB', // Simple format
            mimetype: req.file.mimetype,
            from: {
                user: 'Admin',
                clientId: 'admin'
            },
            to: {
                user: targetHostname || 'Computer',
                clientId: targetClientId
            },
            message: message || 'File from Admin',
            status: 'pending' // pending until downloaded
        });

        // Emit to the specific agent
        io.emit('document-for-agent', {
            targetClientId: targetClientId,
            document: {
                id: docRecord.id, // Include ID for tracking download status
                filename: req.file.originalname,
                downloadUrl: fileUrl,
                message: message || 'File from Admin',
                size: req.file.size,
                mimetype: req.file.mimetype
            }
        });

        // Emit to admin dashboard to update Documents list
        io.emit('document-shared', docRecord);

        console.log(`[DOCUMENT] Sent ${req.file.originalname} to ${targetHostname || targetClientId}`);

        res.json({
            success: true,
            message: `File sent to ${targetHostname || targetClientId}`,
            document: {
                filename: req.file.originalname,
                url: fileUrl,
                size: req.file.size
            }
        });
    } catch (error) {
        console.error('Send to Computer Error:', error);
        res.status(500).json({ error: 'Failed to send file' });
    }
});

// ==================== SERVICE CATALOG ====================

/**
 * GET /api/v1/admin/services
 * List all services with pricing
 */
app.get('/api/v1/admin/services', async (req, res) => {
    try {
        const serviceDocs = await Service.find({ isActive: true });
        res.json(serviceDocs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch services' });
    }
});

/**
 * POST /api/v1/admin/services
 * Create a new service
 */
app.post('/api/v1/admin/services', async (req, res) => {
    try {
        const { name, category, price, unit, description } = req.body;

        if (!name || !price) {
            return res.status(400).json({ error: 'Name and price required' });
        }

        const newService = await Service.create({
            id: 'svc-' + Date.now(),
            name,
            category: category || 'custom',
            description: description || '',
            price: parseFloat(price),
            unit: unit || 'flat',
            isActive: true
        });

        io.emit('service-created', newService);
        res.json({ success: true, service: newService });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create service' });
    }
});

/**
 * PUT /api/v1/admin/services/:id
 * Update a service
 */
app.put('/api/v1/admin/services/:id', async (req, res) => {
    try {
        const updatedService = await Service.findOneAndUpdate(
            { id: req.params.id },
            { $set: req.body },
            { new: true }
        );

        if (!updatedService) return res.status(404).json({ error: 'Service not found' });

        io.emit('service-updated', updatedService);
        res.json({ success: true, service: updatedService });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update service' });
    }
});

/**
 * DELETE /api/v1/admin/services/:id
 * Delete a service
 */
app.delete('/api/v1/admin/services/:id', async (req, res) => {
    try {
        const deleted = await Service.findOneAndDelete({ id: req.params.id });

        if (!deleted) return res.status(404).json({ error: 'Service not found' });

        io.emit('service-deleted', { id: deleted.id });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete service' });
    }
});





// ==================== TASK MANAGEMENT ====================

/**
 * GET /api/v1/admin/tasks
 * List all tasks with optional filters
 */
app.get('/api/v1/admin/tasks', async (req, res) => {
    try {
        const { status, clientId, userId, limit = 100 } = req.query;

        const query = {};
        if (status) query.status = status;
        if (clientId) query['assignedTo.clientId'] = clientId;
        if (userId) query['assignedTo.userId'] = userId;

        const taskDocs = await Task.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit));
        res.json(taskDocs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch tasks' });
    }
});


/**
 * POST /api/v1/admin/tasks
 * Create a new task in database
 */
app.post('/api/v1/admin/tasks', async (req, res) => {
    try {
        const { title, description, serviceId, price, priority, dueAt, assignTo } = req.body;

        if (!title) {
            return res.status(400).json({ error: 'Title required' });
        }

        // Get price from service if serviceId provided
        let taskPrice = price || 0;
        let serviceName = null;
        if (serviceId) {
            const service = await Service.findOne({ id: serviceId });
            if (service) {
                taskPrice = service.price;
                serviceName = service.name;
            }
        }

        const taskData = {
            id: 'task-' + Date.now() + Math.random().toString(36).substr(2, 5),
            title,
            description: description || '',
            serviceId: serviceId || null,
            serviceName,
            price: taskPrice,
            priority: priority || 'normal',
            status: assignTo ? 'assigned' : 'available',
            assignedTo: assignTo ? {
                userId: assignTo.userId || null,
                clientId: assignTo.clientId || null,
                hostname: assignTo.hostname || null,
                userName: assignTo.userName || null
            } : null,
            assignedAt: assignTo ? new Date().toISOString() : null,
            dueAt: dueAt || null,
            createdAt: new Date().toISOString()
        };

        const task = await Task.create(taskData);

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

        console.log(`[TASK] Created in DB: ${task.title} - KSH ${task.price}`);
        res.json({ success: true, task });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create task' });
    }
});

/**
 * PUT /api/v1/admin/tasks/:id
 * Update a task in database
 */
app.put('/api/v1/admin/tasks/:id', async (req, res) => {
    try {
        const task = await Task.findOne({ id: req.params.id });
        if (!task) return res.status(404).json({ error: 'Task not found' });

        const oldStatus = task.status;
        const updates = { ...req.body, updatedAt: new Date().toISOString() };

        if (updates.status === 'completed' && oldStatus !== 'completed') {
            updates.completedAt = new Date().toISOString();
        }

        const updatedTask = await Task.findOneAndUpdate(
            { id: req.params.id },
            { $set: updates },
            { new: true }
        );

        // If status changed to completed, record transaction
        if (updates.status === 'completed' && oldStatus !== 'completed') {
            const transaction = await Transaction.create({
                id: 'txn-' + Date.now(),
                type: 'task_completion',
                taskId: updatedTask.id,
                description: updatedTask.title,
                amount: updatedTask.price,
                clientId: updatedTask.assignedTo?.clientId,
                userId: updatedTask.assignedTo?.userId,
                hostname: updatedTask.assignedTo?.hostname,
                createdAt: new Date().toISOString()
            });
            io.emit('transaction-created', transaction);
        }

        io.emit('task-updated', updatedTask);
        res.json({ success: true, task: updatedTask });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update task' });
    }
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
 * Assign a task to a user/computer in database
 */
app.post('/api/v1/admin/tasks/:id/assign', async (req, res) => {
    try {
        const { clientId, hostname, userId, userName } = req.body;

        const updatedTask = await Task.findOneAndUpdate(
            { id: req.params.id },
            {
                $set: {
                    status: 'assigned',
                    assignedTo: { clientId, hostname, userId, userName },
                    assignedAt: new Date().toISOString()
                }
            },
            { new: true }
        );

        if (!updatedTask) return res.status(404).json({ error: 'Task not found' });

        // Notify the assigned computer
        io.emit('task-assigned', {
            targetClientId: clientId,
            task: {
                id: updatedTask.id,
                title: updatedTask.title,
                price: updatedTask.price,
                priority: updatedTask.priority,
                dueAt: updatedTask.dueAt
            }
        });

        res.json({ success: true, task: updatedTask });
    } catch (error) {
        res.status(500).json({ error: 'Failed to assign task' });
    }
});

// ==================== USER TASKS (for user portal) ====================

/**
 * GET /api/v1/user/tasks
 * Get tasks for a specific user/computer from database
 */
app.get('/api/v1/user/tasks', requireUserAuth, async (req, res) => {
    try {
        const { clientId, userId, status, period } = req.query;

        const query = {};
        if (clientId || userId) {
            query.$or = [
                { 'assignedTo.clientId': clientId },
                { 'assignedTo.userId': userId }
            ];
        }

        if (status) query.status = status;

        if (period) {
            const now = new Date();
            let startDate;
            switch (period) {
                case 'today':
                    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    break;
                case 'week':
                    startDate = new Date(now);
                    startDate.setDate(startDate.getDate() - 7);
                    break;
                case 'month':
                    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                    break;
            }
            if (startDate) {
                query.createdAt = { $gte: startDate };
            }
        }

        const taskDocs = await Task.find(query).sort({ createdAt: -1 });
        res.json(taskDocs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch user tasks' });
    }
});

/**
 * PUT /api/v1/user/tasks/:id/status
 * Update task status in database
 */
app.put('/api/v1/user/tasks/:id/status', requireUserAuth, async (req, res) => {
    try {
        const { status } = req.body;
        const task = await Task.findOne({ id: req.params.id });

        if (!task) return res.status(404).json({ error: 'Task not found' });

        const oldStatus = task.status;
        const updates = { status, updatedAt: new Date().toISOString() };

        if (status === 'in-progress' && !task.startedAt) {
            updates.startedAt = new Date().toISOString();
        }

        if (status === 'completed' && oldStatus !== 'completed') {
            updates.completedAt = new Date().toISOString();
        }

        const updatedTask = await Task.findOneAndUpdate(
            { id: req.params.id },
            { $set: updates },
            { new: true }
        );

        if (status === 'completed' && oldStatus !== 'completed') {
            // Create transaction in DB
            const transaction = await Transaction.create({
                id: 'txn-' + Date.now(),
                type: 'task_completion',
                taskId: updatedTask.id,
                description: updatedTask.title,
                amount: updatedTask.price,
                clientId: updatedTask.assignedTo?.clientId,
                userId: updatedTask.assignedTo?.userId,
                createdAt: new Date().toISOString()
            });
            io.emit('transaction-created', transaction);
        }

        io.emit('task-updated', updatedTask);
        res.json({ success: true, task: updatedTask });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update task status' });
    }
});

// ==================== PUBLIC SERVICES (No Auth Required) ====================

/**
 * GET /api/v1/services
 * Get all active services (public)
 */
app.get('/api/v1/services', async (req, res) => {
    try {
        const services = await Service.find({ isActive: { $ne: false } })
            .sort({ displayOrder: 1, category: 1, name: 1 });
        res.json(services);
    } catch (error) {
        console.error('[PUBLIC SERVICES] Get failed:', error);
        res.status(500).json({ error: 'Failed to get services' });
    }
});

/**
 * GET /api/v1/service-categories
 * Get all active service categories (public)
 */
app.get('/api/v1/service-categories', async (req, res) => {
    try {
        const categories = await ServiceCategory.find({ isActive: { $ne: false } })
            .sort({ displayOrder: 1, name: 1 });
        res.json(categories);
    } catch (error) {
        console.error('[PUBLIC SERVICE CATEGORIES] Get failed:', error);
        res.status(500).json({ error: 'Failed to get categories' });
    }
});


// ==================== ADMIN SERVICES ====================

/**
 * GET /api/v1/admin/services
 * Get all services
 */
app.get('/api/v1/admin/services', async (req, res) => {
    try {
        const services = await Service.find().sort({ displayOrder: 1, category: 1, name: 1 });
        res.json(services);
    } catch (error) {
        console.error('[SERVICES] Get failed:', error);
        res.status(500).json({ error: 'Failed to get services' });
    }
});

/**
 * POST /api/v1/admin/services
 * Create a new service
 */
app.post('/api/v1/admin/services', requireAdminAuth, async (req, res) => {
    try {
        const { name, category, subcategory, description, price, unit, icon, color, displayOrder } = req.body;

        if (!name || !category || price === undefined) {
            return res.status(400).json({ error: 'Name, category, and price are required' });
        }

        // Generate unique ID
        const id = `svc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const service = await Service.create({
            id,
            name,
            category,
            subcategory,
            description,
            price,
            unit: unit || 'flat',
            icon,
            color,
            displayOrder: displayOrder || 0
        });

        console.log(`[SERVICES] Created: ${name}`);
        res.json(service);
    } catch (error) {
        console.error('[SERVICES] Create failed:', error);
        res.status(500).json({ error: 'Failed to create service' });
    }
});

/**
 * PUT /api/v1/admin/services/:id
 * Update a service
 */
app.put('/api/v1/admin/services/:id', requireAdminAuth, async (req, res) => {
    try {
        const service = await Service.findOneAndUpdate(
            { id: req.params.id },
            { $set: req.body },
            { new: true }
        );

        if (!service) {
            return res.status(404).json({ error: 'Service not found' });
        }

        console.log(`[SERVICES] Updated: ${service.name}`);
        res.json(service);
    } catch (error) {
        console.error('[SERVICES] Update failed:', error);
        res.status(500).json({ error: 'Failed to update service' });
    }
});

/**
 * DELETE /api/v1/admin/services/:id
 * Delete a service
 */
app.delete('/api/v1/admin/services/:id', requireAdminAuth, async (req, res) => {
    try {
        const service = await Service.findOneAndDelete({ id: req.params.id });

        if (!service) {
            return res.status(404).json({ error: 'Service not found' });
        }

        console.log(`[SERVICES] Deleted: ${service.name}`);
        res.json({ success: true, message: 'Service deleted' });
    } catch (error) {
        console.error('[SERVICES] Delete failed:', error);
        res.status(500).json({ error: 'Failed to delete service' });
    }
});


// ==================== SERVICE CATEGORIES ====================

/**
 * GET /api/v1/admin/service-categories
 * Get all service categories
 */
app.get('/api/v1/admin/service-categories', async (req, res) => {
    try {
        const categories = await ServiceCategory.find().sort({ displayOrder: 1, name: 1 });
        res.json(categories);
    } catch (error) {
        console.error('[SERVICE CATEGORIES] Get failed:', error);
        res.status(500).json({ error: 'Failed to get categories' });
    }
});

/**
 * POST /api/v1/admin/service-categories
 * Create a new service category
 */
app.post('/api/v1/admin/service-categories', requireAdminAuth, async (req, res) => {
    try {
        const { name, key, icon, color, description, parentCategory, displayOrder } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }

        // Generate key from name if not provided
        const categoryKey = key || name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
        const categoryId = `cat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const category = await ServiceCategory.create({
            id: categoryId,
            name,
            key: categoryKey,
            icon: icon || 'folder',
            color: color || '#00B4D8',
            description,
            parentCategory,
            displayOrder: displayOrder || 0
        });

        console.log(`[SERVICE CATEGORIES] Created: ${name}`);
        res.json(category);
    } catch (error) {
        console.error('[SERVICE CATEGORIES] Create failed:', error);
        if (error.code === 11000) {
            return res.status(400).json({ error: 'Category with this key already exists' });
        }
        res.status(500).json({ error: 'Failed to create category' });
    }
});

/**
 * PUT /api/v1/admin/service-categories/:id
 * Update a service category
 */
app.put('/api/v1/admin/service-categories/:id', requireAdminAuth, async (req, res) => {
    try {
        const category = await ServiceCategory.findOneAndUpdate(
            { id: req.params.id },
            { $set: req.body },
            { new: true }
        );

        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }

        console.log(`[SERVICE CATEGORIES] Updated: ${category.name}`);
        res.json(category);
    } catch (error) {
        console.error('[SERVICE CATEGORIES] Update failed:', error);
        res.status(500).json({ error: 'Failed to update category' });
    }
});

/**
 * DELETE /api/v1/admin/service-categories/:id
 * Delete a service category
 */
app.delete('/api/v1/admin/service-categories/:id', requireAdminAuth, async (req, res) => {
    try {
        const category = await ServiceCategory.findOneAndDelete({ id: req.params.id });

        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }

        console.log(`[SERVICE CATEGORIES] Deleted: ${category.name}`);
        res.json({ success: true, message: 'Category deleted' });
    } catch (error) {
        console.error('[SERVICE CATEGORIES] Delete failed:', error);
        res.status(500).json({ error: 'Failed to delete category' });
    }
});


// ==================== TRANSACTIONS ====================

/**
 * GET /api/v1/admin/transactions
 * List all transactions from database
 */
app.get('/api/v1/admin/transactions', async (req, res) => {
    try {
        const { type, clientId, limit = 100, period } = req.query;

        const query = {};
        if (type) query.type = type;
        if (clientId) query.clientId = clientId;

        // Filter by period
        if (period) {
            const now = new Date();
            let startDate;
            switch (period) {
                case 'today':
                    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    break;
                case 'week':
                    startDate = new Date(now);
                    startDate.setDate(startDate.getDate() - 7);
                    break;
                case 'month':
                    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                    break;
            }
            if (startDate) {
                query.createdAt = { $gte: startDate };
            }
        }

        const transactions = await Transaction.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit));

        res.json(transactions);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
});

/**
 * GET /api/v1/admin/transactions/summary
 * Get transaction summary/totals
 */
/**
 * GET /api/v1/admin/transactions/summary
 * Get transaction summary/totals from database
 */
app.get('/api/v1/admin/transactions/summary', async (req, res) => {
    try {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - 7);
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        const [
            todayTxns, weekTxns, monthTxns,
            todaySessions, weekSessions, monthSessions
        ] = await Promise.all([
            Transaction.find({ createdAt: { $gte: todayStart } }),
            Transaction.find({ createdAt: { $gte: weekStart } }),
            Transaction.find({ createdAt: { $gte: monthStart } }),
            Session.find({ receivedAt: { $gte: todayStart }, type: 'LOGOUT' }),
            Session.find({ receivedAt: { $gte: weekStart }, type: 'LOGOUT' }),
            Session.find({ receivedAt: { $gte: monthStart }, type: 'LOGOUT' })
        ]);

        const calculateRevenue = (txns, sessions) => {
            const txnTotal = txns.reduce((sum, t) => sum + (t.amount || 0), 0);
            const sessionTotal = sessions.reduce((sum, s) => sum + (s.charges?.grandTotal || 0), 0);
            return {
                sessions: sessions.length,
                sessionRevenue: sessionTotal,
                tasks: txns.length,
                taskRevenue: txnTotal,
                totalRevenue: txnTotal + sessionTotal
            };
        };

        res.json({
            today: calculateRevenue(todayTxns, todaySessions),
            week: calculateRevenue(weekTxns, weekSessions),
            month: calculateRevenue(monthTxns, monthSessions)
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch transaction summary' });
    }
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

// Store for public document requests (Already declared at top)

// Allowed file types for document uploads
const ALLOWED_DOC_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx'];
const ALLOWED_DOC_MIMETYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
];

// Helper to categorize files by document type
const categorizeDocumentType = (filename, mimetype) => {
    const ext = path.extname(filename).toLowerCase();
    if (ext === '.pdf' || mimetype === 'application/pdf') return 'pdf';
    if (['.doc', '.docx'].includes(ext) || mimetype?.includes('word')) return 'word';
    if (['.xls', '.xlsx'].includes(ext) || mimetype?.includes('excel') || mimetype?.includes('spreadsheet')) return 'excel';
    return 'other';
};

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

        // Validate file types (server-side)
        const invalidFiles = [];
        for (const file of files) {
            const ext = path.extname(file.originalname).toLowerCase();
            const isAllowed = ALLOWED_DOC_EXTENSIONS.includes(ext) || ALLOWED_DOC_MIMETYPES.includes(file.mimetype);
            if (!isAllowed) {
                invalidFiles.push(file.originalname);
            }
        }

        if (invalidFiles.length > 0) {
            return res.status(400).json({
                error: `Invalid file type(s): ${invalidFiles.join(', ')}. Only PDF, Word (.doc, .docx), and Excel (.xls, .xlsx) files are allowed.`
            });
        }

        // Generate order ID
        const orderId = 'HN-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 5).toUpperCase();

        // Categorize files by type and add metadata
        const categorizedFiles = files.map(f => {
            const docType = categorizeDocumentType(f.originalname, f.mimetype);
            return {
                originalName: f.originalname,
                filename: f.filename,
                size: f.size,
                sizeFormatted: formatBytes(f.size),
                mimetype: f.mimetype,
                path: f.path,
                docType: docType // pdf, word, excel
            };
        });

        // Count by type for summary
        const typeSummary = {
            pdf: categorizedFiles.filter(f => f.docType === 'pdf').length,
            word: categorizedFiles.filter(f => f.docType === 'word').length,
            excel: categorizedFiles.filter(f => f.docType === 'excel').length
        };

        // Create request record
        const request = {
            orderId,
            serviceType,
            customerName,
            customerPhone: customerPhone.replace(/\s/g, ''),
            instructions: instructions || '',
            source: source || 'landing_page',
            files: categorizedFiles,
            typeSummary,
            totalFiles: files.length,
            totalSize: files.reduce((sum, f) => sum + f.size, 0),
            totalSizeFormatted: formatBytes(files.reduce((sum, f) => sum + f.size, 0)),
            status: 'pending', // pending, processing, ready, completed, cancelled
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        documentRequests.unshift(request);
        if (documentRequests.length > 500) documentRequests.pop();

        // =============================================
        // NOTIFICATIONS
        // =============================================

        // 1. Emit to admin dashboard (new document request notification)
        io.emit('new-document-request', {
            ...request,
            notification: {
                title: 'New Document Upload',
                message: `${customerName} uploaded ${files.length} file(s) for ${serviceType}`,
                type: 'document',
                timestamp: new Date().toISOString()
            }
        });

        // 2. Emit to user portal (all users get notified about new work available)
        io.emit('new-document-for-users', {
            orderId: request.orderId,
            serviceType: request.serviceType,
            fileCount: request.totalFiles,
            typeSummary: request.typeSummary,
            instructions: request.instructions,
            status: 'pending',
            createdAt: request.createdAt,
            notification: {
                title: 'New Document Request',
                message: `New ${serviceType} job: ${files.length} file(s) awaiting processing`,
                type: 'work_available'
            }
        });

        console.log(`[PUBLIC] New document request: ${orderId} from ${customerName} (${customerPhone}) - PDF:${typeSummary.pdf} Word:${typeSummary.word} Excel:${typeSummary.excel}`);

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

/**
 * GET /api/v1/admin/document-requests/stats
 * Document request statistics grouped by file type
 */
app.get('/api/v1/admin/document-requests/stats', (req, res) => {
    try {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - 7);

        // Filter by time periods
        const allRequests = documentRequests;
        const todayRequests = documentRequests.filter(r => new Date(r.createdAt) >= todayStart);
        const weekRequests = documentRequests.filter(r => new Date(r.createdAt) >= weekStart);

        // Calculate totals by document type
        const calculateTypeTotals = (requests) => {
            let pdf = 0, word = 0, excel = 0, totalFiles = 0, totalSize = 0;

            for (const request of requests) {
                if (request.typeSummary) {
                    pdf += request.typeSummary.pdf || 0;
                    word += request.typeSummary.word || 0;
                    excel += request.typeSummary.excel || 0;
                }
                totalFiles += request.totalFiles || request.files?.length || 0;
                totalSize += request.totalSize || 0;
            }

            return { pdf, word, excel, totalFiles, totalSize, totalSizeFormatted: formatBytes(totalSize) };
        };

        // Status breakdown
        const statusBreakdown = {
            pending: allRequests.filter(r => r.status === 'pending').length,
            processing: allRequests.filter(r => r.status === 'processing').length,
            ready: allRequests.filter(r => r.status === 'ready').length,
            completed: allRequests.filter(r => r.status === 'completed').length,
            cancelled: allRequests.filter(r => r.status === 'cancelled').length
        };

        // Service type breakdown
        const serviceBreakdown = {};
        for (const request of allRequests) {
            const svc = request.serviceType || 'other';
            serviceBreakdown[svc] = (serviceBreakdown[svc] || 0) + 1;
        }

        res.json({
            totalRequests: allRequests.length,
            today: {
                requests: todayRequests.length,
                ...calculateTypeTotals(todayRequests)
            },
            week: {
                requests: weekRequests.length,
                ...calculateTypeTotals(weekRequests)
            },
            all: {
                requests: allRequests.length,
                ...calculateTypeTotals(allRequests)
            },
            byStatus: statusBreakdown,
            byService: serviceBreakdown,
            // Quick summary for dashboard cards
            summary: {
                totalPdf: calculateTypeTotals(allRequests).pdf,
                totalWord: calculateTypeTotals(allRequests).word,
                totalExcel: calculateTypeTotals(allRequests).excel,
                pendingJobs: statusBreakdown.pending,
                processingJobs: statusBreakdown.processing,
                completedToday: todayRequests.filter(r => r.status === 'completed').length
            }
        });
    } catch (error) {
        console.error('Document stats error:', error);
        res.status(500).json({ error: 'Failed to fetch document stats' });
    }
});

// NOTE: User management routes are defined earlier with requireAdminAuth protection (lines 805-971)
// Do NOT add unprotected user routes here

// ==================== DOCUMENT SHARING ====================

// Helper: Format bytes
const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

/**
 * GET /api/v1/documents
 * List all shared documents
 */
app.get('/api/v1/documents', async (req, res) => {
    try {
        const { clientId, limit = 100 } = req.query;

        const query = {};
        if (clientId) {
            query.$or = [
                { 'from.clientId': clientId },
                { 'to.clientId': clientId }
            ];
        }

        const docs = await SharedDocument.find(query)
            .sort({ uploadedAt: -1 })
            .limit(parseInt(limit));

        res.json(docs);
    } catch (error) {
        console.error('Get documents error:', error);
        res.status(500).json({ error: 'Failed to fetch documents' });
    }
});

/**
 * GET /api/v1/documents/stats
 * Get document sharing statistics
 */
app.get('/api/v1/documents/stats', async (req, res) => {
    try {
        const totalDocs = await SharedDocument.countDocuments();
        const pendingDocs = await SharedDocument.countDocuments({ status: 'pending' });
        const downloadedDocs = await SharedDocument.countDocuments({ status: 'downloaded' });

        // Get total size
        const docs = await SharedDocument.find({}, { size: 1 });
        const totalSize = docs.reduce((sum, d) => sum + (d.size || 0), 0);

        res.json({
            total: totalDocs,
            pending: pendingDocs,
            downloaded: downloadedDocs,
            totalSize: formatFileSize(totalSize),
            totalSizeBytes: totalSize
        });
    } catch (error) {
        console.error('Get document stats error:', error);
        res.status(500).json({ error: 'Failed to fetch document stats' });
    }
});

/**
 * POST /api/v1/documents/upload
 * Upload a document to the server
 */
app.post('/api/v1/documents/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { message, fromUser, fromClientId } = req.body;

        const doc = await SharedDocument.create({
            id: 'doc-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
            filename: req.file.originalname,
            storedName: req.file.filename,
            path: req.file.path,
            size: req.file.size,
            sizeFormatted: formatFileSize(req.file.size),
            mimetype: req.file.mimetype,
            from: {
                user: fromUser || 'Admin',
                clientId: fromClientId || null
            },
            message: message || '',
            status: 'uploaded'
        });

        console.log(`[DOCUMENT] Uploaded: ${doc.filename} (${doc.sizeFormatted})`);

        res.json({ success: true, document: doc });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Failed to upload document' });
    }
});

/**
 * POST /api/v1/documents/send-to-computer
 * Send a document directly to a computer
 */
app.post('/api/v1/documents/send-to-computer', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { targetClientId, message } = req.body;

        if (!targetClientId) {
            return res.status(400).json({ error: 'Target computer (clientId) is required' });
        }

        // Create document record
        const doc = await SharedDocument.create({
            id: 'doc-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
            filename: req.file.originalname,
            storedName: req.file.filename,
            path: req.file.path,
            size: req.file.size,
            sizeFormatted: formatFileSize(req.file.size),
            mimetype: req.file.mimetype,
            from: {
                user: 'Admin',
                clientId: null
            },
            to: {
                clientId: targetClientId
            },
            message: message || 'File from Admin',
            status: 'pending'
        });

        // Construct download URL
        const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
        const downloadUrl = `${baseUrl}/api/v1/documents/${doc.id}/download`;

        // Send to agent via socket
        io.emit('document-for-agent', {
            targetClientId,
            document: {
                id: doc.id,
                filename: doc.filename,
                size: doc.sizeFormatted,
                downloadUrl: downloadUrl,
                message: doc.message
            }
        });

        console.log(`[DOCUMENT] Sent to ${targetClientId}: ${doc.filename}`);

        res.json({ success: true, document: doc, message: 'Document sent to computer' });
    } catch (error) {
        console.error('Send to computer error:', error);
        res.status(500).json({ error: 'Failed to send document' });
    }
});

/**
 * GET /api/v1/documents/:id/download
 * Download a document
 */
app.get('/api/v1/documents/:id/download', async (req, res) => {
    try {
        const doc = await SharedDocument.findOne({ id: req.params.id });

        if (!doc) {
            return res.status(404).json({ error: 'Document not found' });
        }

        // Check if file exists
        if (!fs.existsSync(doc.path)) {
            return res.status(404).json({ error: 'File not found on server' });
        }

        // Mark as downloaded
        doc.status = 'downloaded';
        doc.downloadedAt = new Date();
        await doc.save();

        // Emit event
        io.emit('document-downloaded', { id: doc.id, downloadedAt: doc.downloadedAt });

        res.download(doc.path, doc.filename);
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Failed to download document' });
    }
});

/**
 * DELETE /api/v1/documents/:id
 * Delete a document
 */
app.delete('/api/v1/documents/:id', async (req, res) => {
    try {
        const doc = await SharedDocument.findOne({ id: req.params.id });

        if (!doc) {
            return res.status(404).json({ error: 'Document not found' });
        }

        // Delete file from disk
        if (fs.existsSync(doc.path)) {
            fs.unlinkSync(doc.path);
        }

        // Delete from database
        await SharedDocument.deleteOne({ id: req.params.id });

        // Emit event
        io.emit('document-deleted', { id: req.params.id });

        console.log(`[DOCUMENT] Deleted: ${doc.filename}`);

        res.json({ success: true });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ error: 'Failed to delete document' });
    }
});

// ==================== TEMPLATES MANAGEMENT ====================

// GET /api/v1/templates (Public)
app.get('/api/v1/templates', async (req, res) => {
    try {
        const templates = await Template.find().sort({ createdAt: -1 });
        res.json(templates);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/v1/admin/templates (Admin)
app.post('/api/v1/admin/templates', async (req, res) => {
    try {
        const template = await Template.create(req.body);
        res.json(template);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/v1/admin/templates/:id (Admin)
app.delete('/api/v1/admin/templates/:id', async (req, res) => {
    try {
        await Template.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== LEARNING / COURSES MANAGEMENT ====================

// GET /api/v1/courses (Public)
app.get('/api/v1/courses', async (req, res) => {
    try {
        const courses = await Course.find().sort({ createdAt: -1 });
        res.json(courses);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/v1/admin/courses (Admin)
app.post('/api/v1/admin/courses', async (req, res) => {
    try {
        const course = await Course.create(req.body);
        res.json(course);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/v1/admin/courses/:id (Admin)
app.delete('/api/v1/admin/courses/:id', async (req, res) => {
    try {
        await Course.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== GUIDANCE / GUIDES MANAGEMENT ====================

// GET /api/v1/guides (Public)
app.get('/api/v1/guides', async (req, res) => {
    try {
        const guides = await Guide.find().sort({ createdAt: -1 });
        res.json(guides);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/v1/admin/guides (Admin)
app.post('/api/v1/admin/guides', async (req, res) => {
    try {
        const guide = await Guide.create(req.body);
        res.json(guide);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/v1/admin/guides/:id (Admin)
app.delete('/api/v1/admin/guides/:id', async (req, res) => {
    try {
        await Guide.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== SOCKET.IO ====================

// Track connected agents by clientId
const connectedAgents = new Map(); // clientId -> socket.id

io.on('connection', async (socket) => {
    try {
        console.log(`[SOCKET] Client connected: ${socket.id}`);

        // Handle agent registration
        socket.on('agent-register', (data) => {
            const { clientId, hostname } = data;
            connectedAgents.set(clientId, socket.id);
            socket.clientId = clientId;
            socket.isAgent = true;
            console.log(`[SOCKET] Agent registered: ${clientId} (${hostname}) -> ${socket.id}`);

            // Notify admin dashboard
            io.emit('agent-connected', { clientId, hostname, socketId: socket.id });
        });

        // Handle agent response (e.g. screenshot)
        socket.on('agent-response', (data) => {
            if (data.type === 'screenshot') {
                console.log(`[SOCKET] Screenshot received from ${socket.clientId}`);
                // Broadcast to admin dashboard
                io.emit('agent-screenshot', {
                    clientId: socket.clientId,
                    screenshot: data.screenshot,
                    timestamp: Date.now()
                });
            } else {
                // Generic forwarding
                io.emit('agent-response', {
                    clientId: socket.clientId,
                    ...data
                });
            }
        });

        // If not an agent, treat as admin dashboard
        if (!socket.isAgent) {
            // Fetch all computers from DB for initial state
            const [computerDocs, recentSessions] = await Promise.all([
                Computer.find(),
                Session.find().sort({ receivedAt: -1 }).limit(20)
            ]).catch(() => [[], []]);

            const now = new Date();
            const initialComputers = computerDocs.map(c => ({
                ...c.toObject(),
                isOnline: (now - new Date(c.lastSeen)) < 45000
            }));

            // Send current state on connect
            socket.emit('init-data', {
                computers: initialComputers,
                recentSessions: recentSessions,
                pricing: pricing,
                connectedAgents: Array.from(connectedAgents.keys())
            });
        }
    } catch (error) {
        console.error('[SOCKET ERROR] Initialization failed:', error);
    }

    socket.on('disconnect', () => {
        if (socket.isAgent && socket.clientId) {
            connectedAgents.delete(socket.clientId);
            console.log(`[SOCKET] Agent disconnected: ${socket.clientId}`);
            io.emit('agent-disconnected', { clientId: socket.clientId });
        } else {
            console.log(`[SOCKET] Admin disconnected: ${socket.id}`);
        }
    });
});

// ==================== CONTENT MANAGEMENT: TEMPLATES ====================

/**
 * GET /api/v1/templates
 * Get all templates (public)
 */
app.get('/api/v1/templates', async (req, res) => {
    try {
        const templates = await Template.find().sort({ createdAt: -1 });
        res.json(templates);
    } catch (error) {
        console.error('[TEMPLATES] Get failed:', error);
        res.status(500).json({ error: 'Failed to get templates' });
    }
});

/**
 * POST /api/v1/admin/templates
 * Create a new template with file upload
 */
app.post('/api/v1/admin/templates', requireAdminAuth, upload.single('file'), async (req, res) => {
    try {
        const { title, description, category, type, featured } = req.body;

        if (!title || !category || !type) {
            return res.status(400).json({ error: 'Title, category, and type are required' });
        }

        const templateData = {
            title,
            description,
            category,
            type,
            featured: featured === 'true',
            downloads: 0
        };

        // Handle file upload
        if (req.file) {
            templateData.fileUrl = `/uploads/${req.file.filename}`;
            templateData.fileOriginalName = req.file.originalname;
            templateData.fileSize = req.file.size;
            templateData.fileMimeType = req.file.mimetype;
        }

        const template = await Template.create(templateData);
        console.log(`[TEMPLATES] Created: ${title} ${req.file ? '(with file)' : ''}`);
        res.json(template);
    } catch (error) {
        console.error('[TEMPLATES] Create failed:', error);
        res.status(500).json({ error: 'Failed to create template' });
    }
});

/**
 * DELETE /api/v1/admin/templates/:id
 * Delete a template
 */
app.delete('/api/v1/admin/templates/:id', requireAdminAuth, async (req, res) => {
    try {
        const template = await Template.findByIdAndDelete(req.params.id);
        if (!template) {
            return res.status(404).json({ error: 'Template not found' });
        }

        // TODO: Delete file from disk if exists
        console.log(`[TEMPLATES] Deleted: ${template.title}`);
        res.json({ success: true, message: 'Template deleted' });
    } catch (error) {
        console.error('[TEMPLATES] Delete failed:', error);
        res.status(500).json({ error: 'Failed to delete template' });
    }
});

/**
 * GET /api/v1/templates/:id/download
 * Download a template file
 */
app.get('/api/v1/templates/:id/download', async (req, res) => {
    try {
        const template = await Template.findById(req.params.id);
        if (!template || !template.fileUrl) {
            return res.status(404).json({ error: 'File not found' });
        }

        // Increment download count
        await Template.findByIdAndUpdate(req.params.id, { $inc: { downloads: 1 } });

        const filePath = path.join(__dirname, template.fileUrl);
        if (fs.existsSync(filePath)) {
            res.download(filePath, template.fileOriginalName || 'download');
        } else {
            res.status(404).json({ error: 'File not found on server' });
        }
    } catch (error) {
        console.error('[TEMPLATES] Download failed:', error);
        res.status(500).json({ error: 'Failed to download' });
    }
});


// ==================== CONTENT MANAGEMENT: COURSES (LEARNING) ====================

/**
 * GET /api/v1/courses
 * Get all courses (public)
 */
app.get('/api/v1/courses', async (req, res) => {
    try {
        const courses = await Course.find().sort({ createdAt: -1 });
        res.json(courses);
    } catch (error) {
        console.error('[COURSES] Get failed:', error);
        res.status(500).json({ error: 'Failed to get courses' });
    }
});

/**
 * POST /api/v1/admin/courses
 * Create a new course with file upload
 */
app.post('/api/v1/admin/courses', requireAdminAuth, upload.single('file'), async (req, res) => {
    try {
        const { title, description, category, level, duration, instructor } = req.body;

        if (!title || !category) {
            return res.status(400).json({ error: 'Title and category are required' });
        }

        const courseData = {
            title,
            description,
            category,
            level: level || 'beginner',
            duration: duration || '1 hour',
            instructor: instructor || 'HawkNine Team'
        };

        // Handle file upload
        if (req.file) {
            courseData.fileUrl = `/uploads/${req.file.filename}`;
            courseData.fileOriginalName = req.file.originalname;
            courseData.fileSize = req.file.size;
            courseData.fileMimeType = req.file.mimetype;
        }

        const course = await Course.create(courseData);
        console.log(`[COURSES] Created: ${title} ${req.file ? '(with file)' : ''}`);
        res.json(course);
    } catch (error) {
        console.error('[COURSES] Create failed:', error);
        res.status(500).json({ error: 'Failed to create course' });
    }
});

/**
 * DELETE /api/v1/admin/courses/:id
 * Delete a course
 */
app.delete('/api/v1/admin/courses/:id', requireAdminAuth, async (req, res) => {
    try {
        const course = await Course.findByIdAndDelete(req.params.id);
        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }
        console.log(`[COURSES] Deleted: ${course.title}`);
        res.json({ success: true, message: 'Course deleted' });
    } catch (error) {
        console.error('[COURSES] Delete failed:', error);
        res.status(500).json({ error: 'Failed to delete course' });
    }
});

/**
 * GET /api/v1/courses/:id/download
 * Download a course file
 */
app.get('/api/v1/courses/:id/download', async (req, res) => {
    try {
        const course = await Course.findById(req.params.id);
        if (!course || !course.fileUrl) {
            return res.status(404).json({ error: 'File not found' });
        }

        const filePath = path.join(__dirname, course.fileUrl);
        if (fs.existsSync(filePath)) {
            res.download(filePath, course.fileOriginalName || 'download');
        } else {
            res.status(404).json({ error: 'File not found on server' });
        }
    } catch (error) {
        console.error('[COURSES] Download failed:', error);
        res.status(500).json({ error: 'Failed to download' });
    }
});


// ==================== CONTENT MANAGEMENT: GUIDES (GUIDANCE) ====================

/**
 * GET /api/v1/guides
 * Get all guides (public)
 */
app.get('/api/v1/guides', async (req, res) => {
    try {
        const guides = await Guide.find().sort({ createdAt: -1 });
        res.json(guides);
    } catch (error) {
        console.error('[GUIDES] Get failed:', error);
        res.status(500).json({ error: 'Failed to get guides' });
    }
});

/**
 * POST /api/v1/admin/guides
 * Create a new guide with file upload
 */
app.post('/api/v1/admin/guides', requireAdminAuth, upload.single('file'), async (req, res) => {
    try {
        const { title, description, category, difficulty, readTime } = req.body;

        if (!title || !category) {
            return res.status(400).json({ error: 'Title and category are required' });
        }

        const guideData = {
            title,
            description,
            category,
            difficulty: difficulty || 'beginner',
            readTime: readTime || '5 min'
        };

        // Handle file upload
        if (req.file) {
            guideData.fileUrl = `/uploads/${req.file.filename}`;
            guideData.fileOriginalName = req.file.originalname;
            guideData.fileSize = req.file.size;
            guideData.fileMimeType = req.file.mimetype;
        }

        const guide = await Guide.create(guideData);
        console.log(`[GUIDES] Created: ${title} ${req.file ? '(with file)' : ''}`);
        res.json(guide);
    } catch (error) {
        console.error('[GUIDES] Create failed:', error);
        res.status(500).json({ error: 'Failed to create guide' });
    }
});

/**
 * DELETE /api/v1/admin/guides/:id
 * Delete a guide
 */
app.delete('/api/v1/admin/guides/:id', requireAdminAuth, async (req, res) => {
    try {
        const guide = await Guide.findByIdAndDelete(req.params.id);
        if (!guide) {
            return res.status(404).json({ error: 'Guide not found' });
        }
        console.log(`[GUIDES] Deleted: ${guide.title}`);
        res.json({ success: true, message: 'Guide deleted' });
    } catch (error) {
        console.error('[GUIDES] Delete failed:', error);
        res.status(500).json({ error: 'Failed to delete guide' });
    }
});

/**
 * GET /api/v1/guides/:id/download
 * Download a guide file
 */
app.get('/api/v1/guides/:id/download', async (req, res) => {
    try {
        const guide = await Guide.findById(req.params.id);
        if (!guide || !guide.fileUrl) {
            return res.status(404).json({ error: 'File not found' });
        }

        const filePath = path.join(__dirname, guide.fileUrl);
        if (fs.existsSync(filePath)) {
            res.download(filePath, guide.fileOriginalName || 'download');
        } else {
            res.status(404).json({ error: 'File not found on server' });
        }
    } catch (error) {
        console.error('[GUIDES] Download failed:', error);
        res.status(500).json({ error: 'Failed to download' });
    }
});


// ==================== INVENTORY MANAGEMENT ====================

/**
 * GET /api/v1/inventory
 * Get all inventory items (public/user accessible)
 */
app.get('/api/v1/inventory', async (req, res) => {
    try {
        const items = await InventoryItem.find({ isActive: true }).sort({ name: 1 });
        res.json(items);
    } catch (error) {
        console.error('[INVENTORY] Fetch failed:', error);
        res.status(500).json({ error: 'Failed to fetch inventory' });
    }
});

/**
 * GET /api/v1/inventory/settings
 * Get inventory settings
 */
app.get('/api/v1/inventory/settings', async (req, res) => {
    try {
        let settings = await Settings.findOne({ key: 'inventory' });
        if (!settings) {
            settings = { showTotalItemsToUser: true, lowStockEmailEnabled: true };
        }
        res.json(settings.value || settings);
    } catch (error) {
        console.error('[INVENTORY] Settings fetch failed:', error);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

/**
 * PUT /api/v1/admin/inventory/settings
 * Update inventory settings
 */
app.put('/api/v1/admin/inventory/settings', requireAdminAuth, async (req, res) => {
    try {
        const settings = await Settings.findOneAndUpdate(
            { key: 'inventory' },
            {
                key: 'inventory',
                value: req.body,
                updatedAt: new Date()
            },
            { upsert: true, new: true }
        );
        res.json(settings.value);
    } catch (error) {
        console.error('[INVENTORY] Settings update failed:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

/**
 * POST /api/v1/admin/inventory
 * Add a new inventory item
 */
app.post('/api/v1/admin/inventory', requireAdminAuth, async (req, res) => {
    try {
        const { name, description, price, stock, lowStockThreshold, category } = req.body;

        if (!name || price === undefined || stock === undefined) {
            return res.status(400).json({ error: 'Name, price, and stock are required' });
        }

        const item = await InventoryItem.create({
            name,
            description: description || '',
            price: parseFloat(price) || 0,
            stock: parseInt(stock) || 0,
            lowStockThreshold: parseInt(lowStockThreshold) || 5,
            category: category || 'General',
            isActive: true
        });

        console.log(`[INVENTORY] Added: ${name} (Stock: ${stock}, Price: KSH ${price})`);
        res.status(201).json(item);
    } catch (error) {
        console.error('[INVENTORY] Add failed:', error);
        res.status(500).json({ error: 'Failed to add item' });
    }
});

/**
 * PUT /api/v1/admin/inventory/:id
 * Update an inventory item
 */
app.put('/api/v1/admin/inventory/:id', requireAdminAuth, async (req, res) => {
    try {
        const { name, description, price, stock, lowStockThreshold, category, isActive } = req.body;

        const item = await InventoryItem.findByIdAndUpdate(
            req.params.id,
            {
                name,
                description,
                price: parseFloat(price) || 0,
                stock: parseInt(stock) || 0,
                lowStockThreshold: parseInt(lowStockThreshold) || 5,
                category: category || 'General',
                isActive: isActive !== false,
                updatedAt: new Date()
            },
            { new: true }
        );

        if (!item) {
            return res.status(404).json({ error: 'Item not found' });
        }

        console.log(`[INVENTORY] Updated: ${item.name}`);
        res.json(item);
    } catch (error) {
        console.error('[INVENTORY] Update failed:', error);
        res.status(500).json({ error: 'Failed to update item' });
    }
});

/**
 * DELETE /api/v1/admin/inventory/:id
 * Delete an inventory item
 */
app.delete('/api/v1/admin/inventory/:id', requireAdminAuth, async (req, res) => {
    try {
        const item = await InventoryItem.findByIdAndDelete(req.params.id);
        if (!item) {
            return res.status(404).json({ error: 'Item not found' });
        }
        console.log(`[INVENTORY] Deleted: ${item.name}`);
        res.json({ success: true, message: 'Item deleted' });
    } catch (error) {
        console.error('[INVENTORY] Delete failed:', error);
        res.status(500).json({ error: 'Failed to delete item' });
    }
});

/**
 * POST /api/v1/inventory/:id/sell
 * Record a sale - decrements stock and creates a transaction record
 * Tries to identify the seller from auth token (admin or portal user)
 */
app.post('/api/v1/inventory/:id/sell', async (req, res) => {
    try {
        const { quantity = 1, reason, clientId } = req.body;
        const item = await InventoryItem.findById(req.params.id);

        if (!item) {
            return res.status(404).json({ error: 'Item not found' });
        }

        if (item.stock < quantity) {
            return res.status(400).json({ error: 'Insufficient stock' });
        }

        // Try to identify the seller from auth token
        let sellerName = clientId || 'admin';
        let sellerType = 'unknown';
        try {
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.split(' ')[1];
                // Check admin session first
                let session = await AuthSession.findOne({ token, type: 'admin' });
                if (session && Date.now() <= session.expiresAt) {
                    sellerName = session.name || session.username;
                    sellerType = 'admin';
                } else {
                    // Check portal user session
                    session = await AuthSession.findOne({ token, type: 'portal' });
                    if (session && Date.now() <= session.expiresAt) {
                        sellerName = session.name || session.username;
                        sellerType = 'portal-user';
                    }
                }
            }
        } catch (authErr) {
            // Non-critical: proceed with clientId as seller
            console.log('[INVENTORY] Could not identify seller from token:', authErr.message);
        }

        // Decrement stock
        const previousStock = item.stock;
        item.stock -= quantity;
        item.updatedAt = new Date();
        await item.save();

        // Create a transaction record for the sale
        const transaction = await Transaction.create({
            id: `txn-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            type: 'inventory-sale',
            amount: item.price * quantity,
            description: `Sold ${quantity}x ${item.name} @ KSH ${item.price.toLocaleString()} each = KSH ${(item.price * quantity).toLocaleString()}`,
            itemId: item._id,
            itemName: item.name,
            quantity: quantity,
            seller: sellerName,
            reason: reason || 'Direct Sale',
            clientId: clientId || null,
            userId: sellerName,
            createdAt: new Date(),
            status: 'completed'
        });

        console.log(`[INVENTORY] Sale: ${quantity}x ${item.name} by ${sellerName} (${sellerType}) (Stock: ${previousStock} → ${item.stock})`);

        // Emit real-time updates for admin dashboard
        io.emit('inventory-update', { itemId: item._id, stock: item.stock, name: item.name });
        io.emit('transaction-created', transaction);

        // Check for low stock alert
        if (item.stock <= item.lowStockThreshold && previousStock > item.lowStockThreshold) {
            console.log(`[INVENTORY] ⚠️ LOW STOCK ALERT: ${item.name} (${item.stock} remaining)`);

            // Send email alert to admin
            try {
                const settings = await Settings.findOne({ key: 'inventory' });
                const emailEnabled = settings?.value?.lowStockEmailEnabled !== false;

                if (emailEnabled && process.env.ADMIN_EMAIL) {
                    await transporter.sendMail({
                        from: `"HawkNine Inventory Alert" <${process.env.EMAIL_USER}>`,
                        to: process.env.ADMIN_EMAIL,
                        subject: `⚠️ Low Stock Alert: ${item.name}`,
                        html: `
                            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa; border-radius: 10px;">
                                <h2 style="color: #dc3545; margin-bottom: 20px;">⚠️ Low Stock Alert</h2>
                                <div style="background-color: #fff; padding: 20px; border-radius: 8px; border-left: 4px solid #dc3545;">
                                    <p style="font-size: 16px; margin-bottom: 10px;">
                                        <strong>${item.name}</strong> is running low on stock!
                                    </p>
                                    <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                                        <tr>
                                            <td style="padding: 8px 0; color: #666;">Current Stock:</td>
                                            <td style="padding: 8px 0; font-weight: bold; color: #dc3545;">${item.stock} units</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 8px 0; color: #666;">Alert Threshold:</td>
                                            <td style="padding: 8px 0;">${item.lowStockThreshold} units</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 8px 0; color: #666;">Category:</td>
                                            <td style="padding: 8px 0;">${item.category}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 8px 0; color: #666;">Unit Price:</td>
                                            <td style="padding: 8px 0;">KSH ${item.price}</td>
                                        </tr>
                                    </table>
                                    <p style="margin-top: 20px; font-size: 14px; color: #666;">
                                        Please restock this item soon to avoid running out.
                                    </p>
                                </div>
                                <p style="text-align: center; color: #888; font-size: 12px; margin-top: 20px;">
                                    HawkNine Inventory Management System
                                </p>
                            </div>
                        `
                    });
                    console.log(`[INVENTORY] Low stock email sent for: ${item.name}`);
                }
            } catch (emailError) {
                console.error('[INVENTORY] Failed to send low stock email:', emailError);
            }

            // Notify via socket
            io.emit('low-stock-alert', {
                itemId: item._id,
                itemName: item.name,
                currentStock: item.stock,
                threshold: item.lowStockThreshold,
                timestamp: new Date().toISOString()
            });
        }

        res.json({
            success: true,
            message: `Sold ${quantity}x ${item.name}`,
            item: {
                id: item._id,
                name: item.name,
                previousStock,
                currentStock: item.stock,
                unitPrice: item.price,
                totalAmount: item.price * quantity,
                lowStockAlert: item.stock <= item.lowStockThreshold
            },
            transaction: {
                id: transaction.id,
                seller: sellerName,
                quantity: quantity,
                unitPrice: item.price,
                totalAmount: item.price * quantity,
                description: transaction.description,
                createdAt: transaction.createdAt
            }
        });

    } catch (error) {
        console.error('[INVENTORY] Sale failed:', error);
        res.status(500).json({ error: 'Failed to process sale' });
    }
});


/**
 * GET /api/v1/admin/inventory/low-stock
 * Get all items that are at or below low stock threshold
 */
app.get('/api/v1/admin/inventory/low-stock', requireAdminAuth, async (req, res) => {
    try {
        const items = await InventoryItem.find({ isActive: true });
        const lowStockItems = items.filter(item => item.stock <= item.lowStockThreshold);
        res.json(lowStockItems);
    } catch (error) {
        console.error('[INVENTORY] Low stock fetch failed:', error);
        res.status(500).json({ error: 'Failed to fetch low stock items' });
    }
});

/**
 * GET /api/v1/admin/inventory/stats
 * Get inventory statistics
 */
app.get('/api/v1/admin/inventory/stats', requireAdminAuth, async (req, res) => {
    try {
        const items = await InventoryItem.find({ isActive: true });

        const totalItems = items.length;
        const totalStock = items.reduce((acc, item) => acc + item.stock, 0);
        const totalValue = items.reduce((acc, item) => acc + (item.price * item.stock), 0);
        const lowStockCount = items.filter(item => item.stock <= item.lowStockThreshold).length;
        const outOfStockCount = items.filter(item => item.stock === 0).length;

        // Get recent sales
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todaySales = await Transaction.aggregate([
            { $match: { type: 'inventory-sale', timestamp: { $gte: today } } },
            { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: '$quantity' } } }
        ]);

        res.json({
            totalItems,
            totalStock,
            totalValue,
            lowStockCount,
            outOfStockCount,
            todaySales: todaySales[0] || { total: 0, count: 0 }
        });
    } catch (error) {
        console.error('[INVENTORY] Stats failed:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

/**
 * GET /api/v1/admin/transactions
 * Returns list of all transactions (sales, sessions, etc.)
 */
app.get('/api/v1/admin/transactions', requireAdminAuth, async (req, res) => {
    try {
        const { limit = 100, type } = req.query;
        const query = {};
        // Allow querying by specific transaction types (e.g. 'inventory-sale')
        if (type) query.type = type;

        const transactions = await Transaction.find(query)
            .sort({ createdAt: -1 }) // Newest first
            .limit(parseInt(limit));

        res.json(transactions);
    } catch (error) {
        console.error('[TRANSACTIONS] Fetch failed:', error);
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
});



// ==================== PUBLIC DOCUMENT REQUESTS (LANDING PAGE) ====================

// Helper for doc type
const getDocType = (mime, name) => {
    if (!mime || !name) return 'other';
    const lowerName = name.toLowerCase();
    const lowerMime = mime.toLowerCase();

    if (lowerMime.includes('pdf') || lowerName.endsWith('.pdf')) return 'pdf';
    if (lowerMime.includes('word') || lowerName.endsWith('.doc') || lowerName.endsWith('.docx')) return 'word';
    if (lowerMime.includes('excel') || lowerMime.includes('sheet') || lowerName.endsWith('.xls') || lowerName.endsWith('.xlsx')) return 'excel';
    return 'other';
};

/**
 * POST /api/v1/public/document-request
 * Public endpoint for guests/users to upload documents from landing page
 */
app.post('/api/v1/public/document-request', upload.array('files'), async (req, res) => {
    try {
        const { serviceType, customerName, customerPhone, instructions } = req.body;
        const files = req.files || [];

        if (!files.length) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        // Generate Order ID: HN-XXXXXX-ABC
        const randomSuffix = Math.random().toString(36).substring(2, 5).toUpperCase();
        const timestamp = Date.now().toString().slice(-6);
        const orderId = `HN-${timestamp}-${randomSuffix}`;

        const newRequest = await DocumentRequest.create({
            orderId,
            customerName,
            customerPhone,
            serviceType,
            instructions,
            files: files.map(f => ({
                originalName: f.originalname,
                filename: f.filename,
                path: f.path,
                mimeType: f.mimetype,
                size: f.size,
                docType: getDocType(f.mimetype, f.originalname)
            })),
            totalFiles: files.length,
            totalSize: files.reduce((acc, f) => acc + f.size, 0),
            status: 'pending'
        });

        // Notify admins
        io.emit('new-document-request', {
            orderId: newRequest.orderId,
            customerName: newRequest.customerName,
            serviceType: newRequest.serviceType,
            notification: {
                message: `New request ${orderId} from ${customerName}`,
                type: 'info'
            }
        });

        // Prepare summary for frontend
        const typeSummary = { pdf: 0, word: 0, excel: 0, other: 0 };
        files.forEach(f => {
            const type = getDocType(f.mimetype, f.originalname);
            if (typeSummary[type] !== undefined) typeSummary[type]++;
            else typeSummary.other++;
        });

        // Notify user portal (e.g., reception desk view)
        io.emit('new-document-for-users', {
            orderId: newRequest.orderId,
            customerName: newRequest.customerName,
            serviceType: newRequest.serviceType,
            fileCount: files.length,
            typeSummary,
            notification: {
                title: 'New Document Request',
                message: `${files.length} file(s) from ${customerName} for ${serviceType}`
            },
            createdAt: newRequest.createdAt
        });

        console.log(`[DOCUMENT REQUEST] New request: ${orderId} by ${customerName}`);

        res.status(201).json({ success: true, orderId: newRequest.orderId });
    } catch (error) {
        console.error('[DOCUMENT REQUEST] Error:', error);
        res.status(500).json({ error: 'Submission failed' });
    }
});

/**
 * GET /api/v1/admin/document-requests
 * Fetch all document requests for admin dashboard
 */
app.get('/api/v1/admin/document-requests', requireAdminAuth, async (req, res) => {
    try {
        const { status, limit = 50 } = req.query;
        const query = status && status !== 'all' ? { status } : {};

        const requests = await DocumentRequest.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit));

        res.json(requests);
    } catch (error) {
        console.error('[DOCUMENT REQUESTS] Fetch failed:', error);
        res.status(500).json({ error: 'Failed to fetch requests' });
    }
});

/**
 * PUT /api/v1/admin/document-requests/:orderId/status
 * Update status (pending -> processing -> ready -> completed)
 */
app.put('/api/v1/admin/document-requests/:orderId/status', requireAdminAuth, async (req, res) => {
    try {
        const { status } = req.body;
        const request = await DocumentRequest.findOneAndUpdate(
            { orderId: req.params.orderId },
            { status, updatedAt: new Date() },
            { new: true }
        );

        if (!request) return res.status(404).json({ error: 'Request not found' });

        io.emit('document-request-updated', { orderId: request.orderId, status });

        // Notify user portal too
        if (status === 'ready' || status === 'completed') {
            io.emit('document-request-status-changed', { orderId: request.orderId, status, customerName: request.customerName });
        }

        res.json(request);
    } catch (error) {
        console.error('[DOCUMENT REQUESTS] Update failed:', error);
        res.status(500).json({ error: 'Update failed' });
    }
});

/**
 * GET /api/v1/admin/document-requests/stats
 * Get comprehensive stats for admin dashboard
 */
app.get('/api/v1/admin/document-requests/stats', requireAdminAuth, async (req, res) => {
    try {
        const requests = await DocumentRequest.find({});

        const stats = {
            summary: { totalPdf: 0, totalWord: 0, totalExcel: 0, pendingJobs: 0 },
            all: { pdf: 0, word: 0, excel: 0, totalFiles: 0, totalSize: 0 },
            byStatus: {}
        };

        for (const req of requests) {
            if (req.status === 'pending') stats.summary.pendingJobs++;
            stats.byStatus[req.status] = (stats.byStatus[req.status] || 0) + 1;

            for (const file of req.files || []) {
                stats.all.totalFiles++;
                stats.all.totalSize += file.size || 0;

                if (file.docType === 'pdf') {
                    stats.all.pdf++;
                    stats.summary.totalPdf++;
                } else if (file.docType === 'word') {
                    stats.all.word++;
                    stats.summary.totalWord++;
                } else if (file.docType === 'excel') {
                    stats.all.excel++;
                    stats.summary.totalExcel++;
                }
            }
        }
        res.json(stats);
    } catch (error) {
        console.error('[DOCUMENT REQUESTS] Stats failed:', error);
        res.status(500).json({ error: 'Stats failed' });
    }
});


// ==================== USER DOCUMENT SUBMISSIONS ====================

/**
 * POST /api/v1/user/submissions
 * User submits a document for admin approval (to become template or guidance)
 */
app.post('/api/v1/user/submissions', requireUserAuth, upload.single('file'), async (req, res) => {
    try {
        const { title, description, category, targetType } = req.body;

        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        if (!title || !targetType) {
            return res.status(400).json({ error: 'Title and target type are required' });
        }

        if (!['template', 'guidance'].includes(targetType)) {
            return res.status(400).json({ error: 'Target type must be "template" or "guidance"' });
        }

        const submission = await UserSubmission.create({
            title,
            description: description || '',
            category: category || 'general',
            targetType,
            fileUrl: `/uploads/${req.file.filename}`,
            fileOriginalName: req.file.originalname,
            fileMimeType: req.file.mimetype,
            fileSize: req.file.size,
            submittedBy: req.user.username,
            submittedByName: req.user.name || req.user.username,
            status: 'pending'
        });

        // Notify admins via socket
        io.emit('new-user-submission', {
            submissionId: submission._id,
            title: submission.title,
            targetType: submission.targetType,
            submittedBy: submission.submittedByName,
            timestamp: new Date().toISOString()
        });

        console.log(`[SUBMISSIONS] New submission: "${title}" by ${req.user.username} for ${targetType}`);

        res.status(201).json({
            success: true,
            message: 'Document submitted successfully for review',
            submission: {
                id: submission._id,
                title: submission.title,
                targetType: submission.targetType,
                status: submission.status,
                submittedAt: submission.submittedAt
            }
        });

    } catch (error) {
        console.error('[SUBMISSIONS] Create failed:', error);
        res.status(500).json({ error: 'Failed to submit document' });
    }
});

/**
 * GET /api/v1/user/submissions
 * Get user's own submissions
 */
app.get('/api/v1/user/submissions', requireUserAuth, async (req, res) => {
    try {
        const submissions = await UserSubmission.find({ submittedBy: req.user.username })
            .sort({ submittedAt: -1 });
        res.json(submissions);
    } catch (error) {
        console.error('[SUBMISSIONS] Fetch user submissions failed:', error);
        res.status(500).json({ error: 'Failed to fetch submissions' });
    }
});

/**
 * DELETE /api/v1/user/submissions/:id
 * User can delete their own pending submission
 */
app.delete('/api/v1/user/submissions/:id', requireUserAuth, async (req, res) => {
    try {
        const submission = await UserSubmission.findOne({
            _id: req.params.id,
            submittedBy: req.user.username,
            status: 'pending'
        });

        if (!submission) {
            return res.status(404).json({ error: 'Submission not found or cannot be deleted' });
        }

        // Delete the file
        if (submission.fileUrl) {
            const filePath = path.join(__dirname, submission.fileUrl);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        await UserSubmission.deleteOne({ _id: submission._id });

        res.json({ success: true, message: 'Submission deleted' });
    } catch (error) {
        console.error('[SUBMISSIONS] Delete failed:', error);
        res.status(500).json({ error: 'Failed to delete submission' });
    }
});

// ==================== ADMIN SUBMISSION MANAGEMENT ====================

/**
 * GET /api/v1/admin/submissions
 * Get all user submissions for admin review
 */
app.get('/api/v1/admin/submissions', requireAdminAuth, async (req, res) => {
    try {
        const { status, targetType } = req.query;
        const filter = {};

        if (status && ['pending', 'approved', 'rejected'].includes(status)) {
            filter.status = status;
        }
        if (targetType && ['template', 'guidance'].includes(targetType)) {
            filter.targetType = targetType;
        }

        const submissions = await UserSubmission.find(filter)
            .sort({ submittedAt: -1 });
        res.json(submissions);
    } catch (error) {
        console.error('[ADMIN SUBMISSIONS] Fetch failed:', error);
        res.status(500).json({ error: 'Failed to fetch submissions' });
    }
});

/**
 * GET /api/v1/admin/submissions/stats
 * Get submission statistics
 */
app.get('/api/v1/admin/submissions/stats', requireAdminAuth, async (req, res) => {
    try {
        const [total, pending, approved, rejected] = await Promise.all([
            UserSubmission.countDocuments(),
            UserSubmission.countDocuments({ status: 'pending' }),
            UserSubmission.countDocuments({ status: 'approved' }),
            UserSubmission.countDocuments({ status: 'rejected' })
        ]);

        res.json({ total, pending, approved, rejected });
    } catch (error) {
        console.error('[ADMIN SUBMISSIONS] Stats failed:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

/**
 * GET /api/v1/admin/submissions/:id/download
 * Download submission file
 */
app.get('/api/v1/admin/submissions/:id/download', requireAdminAuth, async (req, res) => {
    try {
        const submission = await UserSubmission.findById(req.params.id);
        if (!submission || !submission.fileUrl) {
            return res.status(404).json({ error: 'Submission not found' });
        }

        const filePath = path.join(__dirname, submission.fileUrl);
        if (fs.existsSync(filePath)) {
            res.download(filePath, submission.fileOriginalName || 'download');
        } else {
            res.status(404).json({ error: 'File not found on server' });
        }
    } catch (error) {
        console.error('[ADMIN SUBMISSIONS] Download failed:', error);
        res.status(500).json({ error: 'Failed to download file' });
    }
});

/**
 * PUT /api/v1/admin/submissions/:id/approve
 * Approve a submission and create the resource (Template or Guide)
 */
app.put('/api/v1/admin/submissions/:id/approve', requireAdminAuth, async (req, res) => {
    try {
        const { notes, resourceData } = req.body;

        const submission = await UserSubmission.findById(req.params.id);
        if (!submission) {
            return res.status(404).json({ error: 'Submission not found' });
        }

        if (submission.status !== 'pending') {
            return res.status(400).json({ error: 'Submission has already been reviewed' });
        }

        let createdResource;

        if (submission.targetType === 'template') {
            // Create Template from submission
            createdResource = await Template.create({
                title: resourceData?.title || submission.title,
                description: resourceData?.description || submission.description,
                category: resourceData?.category || submission.category || 'general',
                type: resourceData?.type || 'Document',
                fileUrl: submission.fileUrl,
                fileOriginalName: submission.fileOriginalName,
                fileMimeType: submission.fileMimeType,
                fileSize: submission.fileSize,
                icon: resourceData?.icon || 'file',
                featured: resourceData?.featured || false,
                downloads: 0
            });

            console.log(`[SUBMISSIONS] Approved as Template: ${createdResource.title}`);

        } else if (submission.targetType === 'guidance') {
            // Create Guide from submission
            createdResource = await Guide.create({
                title: resourceData?.title || submission.title,
                description: resourceData?.description || submission.description,
                objective: resourceData?.objective || submission.category || 'general',
                type: resourceData?.type || 'Guide',
                duration: resourceData?.duration || '5 min read',
                content: resourceData?.content || '',
                icon: resourceData?.icon || 'book',
                popular: resourceData?.popular || false,
                fileUrl: submission.fileUrl,
                fileOriginalName: submission.fileOriginalName,
                fileMimeType: submission.fileMimeType,
                fileSize: submission.fileSize
            });

            console.log(`[SUBMISSIONS] Approved as Guide: ${createdResource.title}`);
        }

        // Update submission status
        submission.status = 'approved';
        submission.reviewedBy = req.admin.username;
        submission.reviewedAt = new Date();
        submission.reviewNotes = notes || '';
        submission.approvedResourceId = createdResource._id;
        submission.approvedResourceType = submission.targetType === 'template' ? 'Template' : 'Guide';
        await submission.save();

        // Notify user via socket
        io.emit('submission-reviewed', {
            submissionId: submission._id,
            status: 'approved',
            submittedBy: submission.submittedBy,
            title: submission.title,
            resourceType: submission.approvedResourceType,
            timestamp: new Date().toISOString()
        });

        res.json({
            success: true,
            message: `Submission approved and created as ${submission.approvedResourceType}`,
            submission,
            resource: createdResource
        });

    } catch (error) {
        console.error('[ADMIN SUBMISSIONS] Approve failed:', error);
        res.status(500).json({ error: 'Failed to approve submission' });
    }
});

/**
 * PUT /api/v1/admin/submissions/:id/reject
 * Reject a submission
 */
app.put('/api/v1/admin/submissions/:id/reject', requireAdminAuth, async (req, res) => {
    try {
        const { notes } = req.body;

        const submission = await UserSubmission.findById(req.params.id);
        if (!submission) {
            return res.status(404).json({ error: 'Submission not found' });
        }

        if (submission.status !== 'pending') {
            return res.status(400).json({ error: 'Submission has already been reviewed' });
        }

        submission.status = 'rejected';
        submission.reviewedBy = req.admin.username;
        submission.reviewedAt = new Date();
        submission.reviewNotes = notes || '';
        await submission.save();

        console.log(`[SUBMISSIONS] Rejected: ${submission.title} - Reason: ${notes || 'No reason provided'}`);

        // Notify user via socket
        io.emit('submission-reviewed', {
            submissionId: submission._id,
            status: 'rejected',
            submittedBy: submission.submittedBy,
            title: submission.title,
            notes: notes,
            timestamp: new Date().toISOString()
        });

        res.json({
            success: true,
            message: 'Submission rejected',
            submission
        });

    } catch (error) {
        console.error('[ADMIN SUBMISSIONS] Reject failed:', error);
        res.status(500).json({ error: 'Failed to reject submission' });
    }
});

/**
 * DELETE /api/v1/admin/submissions/:id
 * Delete a submission (admin only)
 */
app.delete('/api/v1/admin/submissions/:id', requireAdminAuth, async (req, res) => {
    try {
        const submission = await UserSubmission.findById(req.params.id);
        if (!submission) {
            return res.status(404).json({ error: 'Submission not found' });
        }

        // Delete the file if it exists and hasn't been approved (approved files are now used by resources)
        if (submission.fileUrl && submission.status !== 'approved') {
            const filePath = path.join(__dirname, submission.fileUrl);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        await UserSubmission.deleteOne({ _id: submission._id });

        res.json({ success: true, message: 'Submission deleted' });
    } catch (error) {
        console.error('[ADMIN SUBMISSIONS] Delete failed:', error);
        res.status(500).json({ error: 'Failed to delete submission' });
    }
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
