/**
 * HawkNine Admin API Service
 * Connects the Admin Dashboard to the Backend API
 */

import axios from 'axios';
import { io } from 'socket.io-client';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://api.hawkninegroup.com/api/v1';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'https://api.hawkninegroup.com';

// Create axios instance with defaults
const api = axios.create({
    baseURL: API_BASE_URL,
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json'
    }
});

// Token management
const TOKEN_KEY = 'hawknine_admin_token';

export const getStoredToken = () => localStorage.getItem(TOKEN_KEY);
export const setStoredToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const removeStoredToken = () => localStorage.removeItem(TOKEN_KEY);

// Add authorization header to all requests if token exists
api.interceptors.request.use((config) => {
    const token = getStoredToken();
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Handle 401 responses (token expired)
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            removeStoredToken();
            window.location.href = '/'; // Redirect to login
        }
        return Promise.reject(error);
    }
);

// ==================== AUTHENTICATION ====================

export const adminLoginStep1 = async (username, password) => {
    const response = await api.post('/auth/admin/login-step1', { username, password });
    return response.data;
};

export const adminLoginStep2 = async (tempToken, otp) => {
    const response = await api.post('/auth/admin/login-step2', { tempToken, otp });
    if (response.data.token) {
        setStoredToken(response.data.token);
    }
    return response.data;
};

export const adminLogout = async () => {
    try {
        await api.post('/auth/admin/logout');
    } catch (e) {
        // Ignore errors on logout
    }
    removeStoredToken();
};

export const verifyAdminToken = async () => {
    const token = getStoredToken();
    if (!token) return false;

    try {
        const response = await api.get('/auth/admin/verify');
        return response.data.valid;
    } catch {
        removeStoredToken();
        return false;
    }
};

export const isAuthenticated = () => !!getStoredToken();

// ==================== AGENT USERS ====================

export const getAgentUsers = async () => {
    const response = await api.get('/auth/agent/users');
    return response.data;
};

export const createAgentUser = async (userData) => {
    const response = await api.post('/auth/agent/users', userData);
    return response.data;
};

export const updateAgentUser = async (username, userData) => {
    const response = await api.put(`/auth/agent/users/${username}`, userData);
    return response.data;
};

export const deleteAgentUser = async (username) => {
    const response = await api.delete(`/auth/agent/users/${username}`);
    return response.data;
};

// ==================== COMPUTERS ====================

export const getComputers = async () => {
    const response = await api.get('/admin/computers');
    return response.data;
};

export const getComputer = async (clientId) => {
    const response = await api.get(`/admin/computers/${clientId}`);
    return response.data;
};

// ==================== SESSIONS ====================

export const getSessions = async (params = {}) => {
    const response = await api.get('/admin/sessions', { params });
    return response.data;
};

// ==================== PRINT JOBS ====================

export const getPrintJobs = async (params = {}) => {
    const response = await api.get('/admin/print-jobs', { params });
    return response.data;
};

// ==================== BROWSER HISTORY ====================

export const getBrowserHistory = async (params = {}) => {
    const response = await api.get('/admin/browser-history', { params });
    return response.data;
};

// ==================== FILE ACTIVITY ====================

export const getFileActivity = async (params = {}) => {
    const response = await api.get('/admin/file-activity', { params });
    return response.data;
};

// ==================== USB EVENTS ====================

export const getUsbEvents = async (params = {}) => {
    const response = await api.get('/admin/usb-events', { params });
    return response.data;
};

// ==================== ACTIVITY LOGS ====================

export const getActivityLogs = async (params = {}) => {
    const response = await api.get('/admin/activity', { params });
    return response.data;
};

// ==================== STATS ====================

export const getStats = async () => {
    const response = await api.get('/admin/stats');
    return response.data;
};

// ==================== PRICING ====================

export const getPricing = async () => {
    const response = await api.get('/admin/pricing');
    return response.data;
};

export const updatePricing = async (pricing) => {
    const response = await api.put('/admin/pricing', pricing);
    return response.data;
};

// ==================== COMMANDS ====================

export const sendCommand = async (clientId, command, params = {}) => {
    const response = await api.post('/admin/command', { clientId, command, params });
    return response.data;
};

// ==================== SERVICES ====================

export const getServices = async () => {
    const response = await api.get('/admin/services');
    return response.data;
};

export const createService = async (service) => {
    const response = await api.post('/admin/services', service);
    return response.data;
};

export const updateService = async (id, updates) => {
    const response = await api.put(`/admin/services/${id}`, updates);
    return response.data;
};

export const deleteService = async (id) => {
    const response = await api.delete(`/admin/services/${id}`);
    return response.data;
};

// ==================== TASKS ====================

export const getTasks = async (params = {}) => {
    const response = await api.get('/admin/tasks', { params });
    return response.data;
};

export const createTask = async (task) => {
    const response = await api.post('/admin/tasks', task);
    return response.data;
};

export const updateTask = async (id, updates) => {
    const response = await api.put(`/admin/tasks/${id}`, updates);
    return response.data;
};

export const deleteTask = async (id) => {
    const response = await api.delete(`/admin/tasks/${id}`);
    return response.data;
};

export const assignTask = async (taskId, assignment) => {
    const response = await api.post(`/admin/tasks/${taskId}/assign`, assignment);
    return response.data;
};

// ==================== TRANSACTIONS ====================

export const getTransactions = async (params = {}) => {
    const response = await api.get('/admin/transactions', { params });
    return response.data;
};

export const getTransactionSummary = async () => {
    const response = await api.get('/admin/transactions/summary');
    return response.data;
};


// ==================== DOCUMENT SHARING ====================

export const getDocuments = async (params = {}) => {
    const response = await api.get('/documents', { params });
    return response.data;
};

export const getDocumentStats = async () => {
    const response = await api.get('/documents/stats');
    return response.data;
};

export const uploadDocument = async (formData) => {
    const response = await axios.post(`${API_BASE_URL}/documents/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000 // 60 second timeout for uploads
    });
    return response.data;
};

export const sendDocumentToComputer = async (formData) => {
    const response = await axios.post(`${API_BASE_URL}/documents/send-to-computer`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000
    });
    return response.data;
};

export const downloadDocument = (documentId) => {
    return `${API_BASE_URL}/documents/${documentId}/download`;
};

export const deleteDocument = async (documentId) => {
    const response = await api.delete(`/documents/${documentId}`);
    return response.data;
};

// ==================== WEBSOCKET ====================

let socket = null;

export const connectSocket = (callbacks = {}) => {
    if (socket) {
        socket.disconnect();
    }

    socket = io(SOCKET_URL, {
        transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
        console.log('Connected to HawkNine Server');
        if (callbacks.onConnect) callbacks.onConnect();
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from HawkNine Server');
        if (callbacks.onDisconnect) callbacks.onDisconnect();
    });

    socket.on('init-data', (data) => {
        if (callbacks.onInitData) callbacks.onInitData(data);
    });

    socket.on('computer-update', (data) => {
        if (callbacks.onComputerUpdate) callbacks.onComputerUpdate(data);
    });

    socket.on('screenshot-update', (data) => {
        if (callbacks.onScreenshotUpdate) callbacks.onScreenshotUpdate(data);
    });

    socket.on('session-event', (data) => {
        if (callbacks.onSessionEvent) callbacks.onSessionEvent(data);
    });

    socket.on('pricing-updated', (data) => {
        if (callbacks.onPricingUpdate) callbacks.onPricingUpdate(data);
    });

    // Document sharing events
    socket.on('document-received', (data) => {
        if (callbacks.onDocumentReceived) callbacks.onDocumentReceived(data);
    });

    socket.on('document-downloaded', (data) => {
        if (callbacks.onDocumentDownloaded) callbacks.onDocumentDownloaded(data);
    });

    socket.on('document-deleted', (data) => {
        if (callbacks.onDocumentDeleted) callbacks.onDocumentDeleted(data);
    });

    return socket;
};

export const disconnectSocket = () => {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
};

// Default export
export default {
    // Auth
    adminLoginStep1,
    adminLoginStep2,
    adminLogout,
    verifyAdminToken,
    isAuthenticated,
    getStoredToken,
    removeStoredToken,
    getAgentUsers,
    createAgentUser,
    updateAgentUser,
    deleteAgentUser,
    // Computers
    getComputers,
    getComputer,
    getSessions,
    getPrintJobs,
    getBrowserHistory,
    getFileActivity,
    getUsbEvents,
    getActivityLogs,
    getStats,
    getPricing,
    updatePricing,
    sendCommand,
    getServices,
    createService,
    updateService,
    deleteService,
    getTasks,
    createTask,
    updateTask,
    deleteTask,
    assignTask,
    getTransactions,
    getTransactionSummary,
    getDocuments,
    getDocumentStats,
    uploadDocument,
    sendDocumentToComputer,
    downloadDocument,
    deleteDocument,
    connectSocket,
    disconnectSocket
};
