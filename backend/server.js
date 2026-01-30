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



const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});

// Trust Nginx Proxy
app.set('trust proxy', 1);

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
    windowMs: 15 * 60 * 1000,
    max: 30,
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
mongoose.connection.once('open', seedDatabase);


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
        const isValid = (
            username.toLowerCase() === ADMIN_CONFIG.username.toLowerCase() &&
            verifyPassword(password, ADMIN_CONFIG.passwordHash)
        );

        if (!isValid) {
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
        const sent = await sendOTPEmail(ADMIN_CONFIG.email, otp, username);


        if (sent) {
            res.json({
                success: true,
                message: '2FA Code sent to email',
                tempToken,
                emailMask: ADMIN_CONFIG.email.replace(/(.{2})(.*)(@.*)/, '$1***$3')
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

        const session = await AuthSession.create({
            token,
            username: username,
            email: ADMIN_CONFIG.email,
            type: 'admin',
            role: 'Super Admin',
            expiresAt
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
 * USER AUTHENTICATION (OTP-based)
 * POST /api/v1/auth/user/login-step1
 * Validate credentials and send OTP to user email
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
        io.emit('computer-update', computer);

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
                isOnline: (now - new Date(doc.lastSeen)) < 30000
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
        const allComputers = Array.from(computers.values());
        const now = new Date();
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



/**
 * GET /api/v1/admin/browser-history
 * Fetch browser history logs
 */
app.get('/api/v1/admin/browser-history', requireAdminAuth, async (req, res) => {
    try {
        const { limit = 100 } = req.query;
        const logs = await Log.find({ type: 'browser' })
            .sort({ receivedAt: -1 })
            .limit(parseInt(limit));

        const history = logs.map(log => ({
            id: log._id,
            hostname: log.hostname,
            user: log.sessionUser,
            url: log.data?.url || '',
            title: log.data?.title || '',
            category: log.data?.category || 'other',
            timestamp: log.receivedAt,
            blocked: log.data?.blocked || false
        }));

        res.json(history);
    } catch (error) {
        console.error('Fetch browser history error:', error);
        res.status(500).json({ error: 'Failed to fetch browser history' });
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

// NOTE: User management routes are defined earlier with requireAdminAuth protection (lines 805-971)
// Do NOT add unprotected user routes here

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

io.on('connection', async (socket) => {
    try {
        console.log(`[SOCKET] Admin connected: ${socket.id}`);

        // Fetch recent data for initial state
        const recentSessions = await Session.find()
            .sort({ receivedAt: -1 })
            .limit(20)
            .catch(() => []); // Fallback to empty if DB fails

        // Send current state on connect
        socket.emit('init-data', {
            computers: Array.from(computers.values()),
            recentSessions: recentSessions,
            pricing: pricing
        });
    } catch (error) {
        console.error('[SOCKET ERROR] Initialization failed:', error);
    }

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
