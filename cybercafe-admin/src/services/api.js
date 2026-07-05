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

export const adminForgotPassword = async (username) => {
    const response = await api.post('/auth/admin/forgot-password', { username });
    return response.data;
};

export const adminResetPassword = async (username, otp, newPassword) => {
    const response = await api.post('/auth/admin/reset-password', { username, otp, newPassword });
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

// ==================== PORTAL USERS ====================

export const getPortalUsers = async () => {
    const response = await api.get('/auth/portal/users');
    return response.data;
};

export const createPortalUser = async (userData) => {
    const response = await api.post('/auth/portal/users', userData);
    return response.data;
};

export const updatePortalUser = async (username, userData) => {
    const response = await api.put(`/auth/portal/users/${username}`, userData);
    return response.data;
};

export const deletePortalUser = async (username) => {
    const response = await api.delete(`/auth/portal/users/${username}`);
    return response.data;
};

// ==================== CLEANUP ====================

export const cleanupDemoUsers = async () => {
    const response = await api.post('/admin/cleanup-demo-users');
    return response.data;
};

// ==================== STAFF MANAGEMENT ====================

export const getStaff = async () => {
    const response = await api.get('/auth/admin/staff');
    return response.data;
};

export const createStaff = async (userData) => {
    const response = await api.post('/auth/admin/staff', userData);
    return response.data;
};

export const updateStaff = async (username, userData) => {
    const response = await api.put(`/auth/admin/staff/${username}`, userData);
    return response.data;
};

export const deleteStaff = async (username) => {
    const response = await api.delete(`/auth/admin/staff/${username}`);
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

export const getPrinters = async (params = {}) => {
    const response = await api.get('/admin/printers', { params });
    return response.data;
};

export const deleteAllPrinterData = async () => {
    const response = await api.delete('/admin/printer-data');
    return response.data;
};

// ==================== BROWSER HISTORY ====================

export const getBrowserHistory = async (params = {}) => {
    const response = await api.get('/admin/browser-history', { params });
    return response.data;
};

export const deleteAllBrowserData = async () => {
    const response = await api.delete('/admin/browser-data');
    return response.data;
};

export const deleteAllLandingDocumentData = async () => {
    const response = await api.delete('/admin/landing-document-data');
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

// ==================== PORTAL AUTH SETTINGS ====================

export const getPortalAuthSettings = async () => {
    const response = await api.get('/admin/portal-auth-settings');
    return response.data;
};

export const updatePortalAuthSettings = async (settings) => {
    const response = await api.put('/admin/portal-auth-settings', settings);
    return response.data;
};

// ==================== STATS ====================

export const getStats = async () => {
    const response = await api.get('/admin/stats');
    return response.data;
};

export const getDatabaseStats = async () => {
    const response = await api.get('/admin/db-stats');
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

export const requestScreenshot = async (clientId) => {
    const response = await api.post(`/admin/computers/${clientId}/screenshot`);
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

// ==================== SERVICE CATEGORIES ====================

export const getServiceCategories = async () => {
    const response = await api.get('/admin/service-categories');
    return response.data;
};

export const createServiceCategory = async (category) => {
    const response = await api.post('/admin/service-categories', category);
    return response.data;
};

export const updateServiceCategory = async (id, updates) => {
    const response = await api.put(`/admin/service-categories/${id}`, updates);
    return response.data;
};

export const deleteServiceCategory = async (id) => {
    const response = await api.delete(`/admin/service-categories/${id}`);
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

export const getTransactionSummary = async (params) => {
    const res = await api.get('/admin/transactions/summary', { params });
    return res.data;
};

export const addManualTransaction = async (data) => {
    const res = await api.post('/admin/transactions/manual', data);
    return res.data;
};

export const deletePaymentRecord = async (id) => {
    const response = await api.delete(`/admin/transactions/payment/${id}`);
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

// ==================== DOCUMENT REQUESTS (From Landing Page) ====================

export const getDocumentRequests = async (params = {}) => {
    const response = await api.get('/admin/document-requests', { params });
    return response.data;
};

export const getDocumentRequestStats = async () => {
    const response = await api.get('/admin/document-requests/stats');
    return response.data;
};

export const updateDocumentRequestStatus = async (orderId, status, notes = '') => {
    const response = await api.put(`/admin/document-requests/${orderId}/status`, { status, notes });
    return response.data;
};

export const uploadDocumentRequestWork = async (orderId, formData) => {
    const response = await axios.put(`${API_BASE_URL}/admin/document-requests/${orderId}/work`, formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
            'Authorization': `Bearer ${getStoredToken()}`
        },
        timeout: 60000
    });
    return response.data;
};

export const getDocumentRequestAnalytics = async () => {
    const response = await api.get('/admin/document-requests/analytics');
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

    socket.on('document-shared', (data) => {
        if (callbacks.onDocumentShared) callbacks.onDocumentShared(data);
    });

    socket.on('document-status-update', (data) => {
        if (callbacks.onDocumentStatusUpdate) callbacks.onDocumentStatusUpdate(data);
    });

    socket.on('document-downloaded', (data) => {
        if (callbacks.onDocumentDownloaded) callbacks.onDocumentDownloaded(data);
    });

    socket.on('document-deleted', (data) => {
        if (callbacks.onDocumentDeleted) callbacks.onDocumentDeleted(data);
    });

    socket.on('new-log', (data) => {
        if (callbacks.onNewLog) callbacks.onNewLog(data);
    });

    socket.on('agent-screenshot', (data) => {
        if (callbacks.onScreenshot) callbacks.onScreenshot(data);
    });

    // Document request events (from landing page uploads)
    socket.on('new-document-request', (data) => {
        if (callbacks.onNewDocumentRequest) callbacks.onNewDocumentRequest(data);
    });

    socket.on('document-request-updated', (data) => {
        if (callbacks.onDocumentRequestUpdated) callbacks.onDocumentRequestUpdated(data);
    });

    socket.on('agent-error', (data) => {
        if (callbacks.onAgentError) callbacks.onAgentError(data);
    });

    return socket;
};

export const disconnectSocket = () => {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
};


// Content Management - Templates
export const getTemplates = async () => (await api.get('/templates')).data;
export const createTemplate = async (formData) => {
    const response = await axios.post(`${API_BASE_URL}/admin/templates`, formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
            'Authorization': `Bearer ${getStoredToken()}`
        },
        timeout: 60000
    });
    return response.data;
};
export const deleteTemplate = async (id) => (await api.delete(`/admin/templates/${id}`)).data;
export const downloadTemplateUrl = (id) => `${API_BASE_URL}/templates/${id}/download`;

// Content Management - Courses (Learning)
export const getCourses = async () => (await api.get('/courses')).data;
export const createCourse = async (formData) => {
    const response = await axios.post(`${API_BASE_URL}/admin/courses`, formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
            'Authorization': `Bearer ${getStoredToken()}`
        },
        timeout: 60000
    });
    return response.data;
};
export const deleteCourse = async (id) => (await api.delete(`/admin/courses/${id}`)).data;
export const downloadCourseUrl = (id) => `${API_BASE_URL}/courses/${id}/download`;

// Content Management - Guides (Guidance)
export const getGuides = async () => (await api.get('/guides')).data;
export const createGuide = async (formData) => {
    const response = await axios.post(`${API_BASE_URL}/admin/guides`, formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
            'Authorization': `Bearer ${getStoredToken()}`
        },
        timeout: 60000
    });
    return response.data;
};
export const deleteGuide = async (id) => (await api.delete(`/admin/guides/${id}`)).data;
export const downloadGuideUrl = (id) => `${API_BASE_URL}/guides/${id}/download`;

// ==================== SETTINGS ====================

export const getSettings = async () => (await api.get('/admin/settings')).data;
export const saveSettings = async (settings) => (await api.post('/admin/settings', { settings })).data;

// ==================== WHATSAPP REPORTS ====================
export const getWhatsAppReportSettings = async () => (await api.get('/admin/whatsapp-report-settings')).data;
export const saveWhatsAppReportSettings = async (settings) => (await api.post('/admin/whatsapp-report-settings', settings)).data;
export const sendTestWhatsAppReport = async (settings) => (await api.post('/admin/whatsapp-report/test', settings)).data;
export const getWhatsAppStatus = async () => (await api.get('/admin/whatsapp/status')).data;
export const getWhatsAppQR = async () => (await api.get('/admin/whatsapp/qr')).data;
export const logoutWhatsApp = async () => (await api.post('/admin/whatsapp/logout')).data;
export const restartWhatsApp = async () => (await api.post('/admin/whatsapp/restart')).data;

// ==================== BLOCKLIST ====================
export const getBlocklist = async () => (await api.get('/admin/blocklist')).data;
export const addToBlocklist = async (url, reason) => (await api.post('/admin/blocklist', { url, reason })).data;
export const removeFromBlocklist = async (id) => (await api.delete(`/admin/blocklist/${id}`)).data;

// ==================== PASSWORD CHANGE ====================
export const changeAdminPassword = async (currentPassword, newPassword) =>
    (await api.post('/admin/change-password', { currentPassword, newPassword })).data;

export const getRecoverySettings = async () => (await api.get('/admin/recovery-settings')).data;
export const saveRecoverySettings = async (email) => (await api.post('/admin/recovery-settings', { email })).data;

export const getInventory = async () => (await api.get('/inventory')).data;
export const addInventoryItem = async (data) => (await api.post('/admin/inventory', data)).data;
export const updateInventoryItem = async (id, data) => (await api.put(`/admin/inventory/${id}`, data)).data;
export const deleteInventoryItem = async (id) => (await api.delete(`/admin/inventory/${id}`)).data;
export const getInventorySettings = async () => (await api.get('/inventory/settings')).data;
export const updateInventorySettings = async (data) => (await api.put('/admin/inventory/settings', data)).data;
export const getLowStockItems = async () => (await api.get('/admin/inventory/low-stock')).data;
export const getInventoryStats = async () => (await api.get('/admin/inventory/stats')).data;
export const sellInventoryItem = async (id, data) => (await api.post(`/inventory/${id}/sell`, data)).data;
export const updateInventoryAccessControl = async (id, data) => (await api.put(`/admin/inventory/${id}/access-control`, data)).data;
export const clearAllInventory = async () => (await api.delete('/admin/inventory/all')).data;
export const clearSalesHistory = async () => (await api.delete('/admin/inventory/sales-history')).data;
export const removeConnectedPrinters = async () => (await api.delete('/admin/printers/connected')).data;
export const removeSinglePrinter = async (clientId, printerName) => (await api.delete('/admin/printers/single', { data: { clientId, printerName } })).data;
export const clearAllFinanceData = async () => (await api.delete('/admin/finance-data')).data;
export const clearAllReportsData = async () => (await api.delete('/admin/reports-data')).data;

// ==================== PAGE COUNTER READINGS (Photocopy Tracking) ====================
export const createPageCounterReading = async (data) => (await api.post('/admin/page-counter-readings', data)).data;
export const getPageCounterReadings = async (params = {}) => (await api.get('/admin/page-counter-readings', { params })).data;
export const deletePageCounterReading = async (id) => (await api.delete(`/admin/page-counter-readings/${id}`)).data;
export const getPhotocopyData = async (params = {}) => (await api.get('/admin/photocopy-data', { params })).data;

// ==================== USER SUBMISSIONS ====================
export const getSubmissions = async (status, targetType) => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (targetType) params.append('targetType', targetType);
    const url = `/admin/submissions${params.toString() ? '?' + params.toString() : ''}`;
    return (await api.get(url)).data;
};
export const getSubmissionStats = async () => (await api.get('/admin/submissions/stats')).data;
export const downloadSubmissionUrl = (id) => `${API_BASE_URL}/admin/submissions/${id}/download`;
export const approveSubmission = async (id, notes, resourceData) =>
    (await api.put(`/admin/submissions/${id}/approve`, { notes, resourceData })).data;
export const rejectSubmission = async (id, notes) =>
    (await api.put(`/admin/submissions/${id}/reject`, { notes })).data;
export const deleteSubmission = async (id) => (await api.delete(`/admin/submissions/${id}`)).data;

// ==================== COMPUTER DISCONNECT & REMOVAL ====================
export const disconnectComputer = async (clientId, quit = false) =>
    (await api.post('/admin/command', { clientId, command: 'disconnect', params: { quit } })).data;
export const deleteComputer = async (clientId) =>
    (await api.delete(`/admin/computers/${clientId}`)).data;

// ==================== ONLINE SERVICES ====================
export const getOnlineServices = async () => (await api.get('/admin/online-services')).data;

// ==================== TRACKABLE SERVICES ====================
export const getTrackableServices = async () => (await api.get('/admin/trackable-services')).data;
export const createTrackableService = async (data) => (await api.post('/admin/trackable-services', data)).data;
export const updateTrackableService = async (id, data) => (await api.put(`/admin/trackable-services/${id}`, data)).data;
export const deleteTrackableService = async (id) => (await api.delete(`/admin/trackable-services/${id}`)).data;

// ==================== ACTIVITY RECORDS ====================
export const getActivityRecords = async (params = {}) => (await api.get('/admin/activity-records', { params })).data;
export const deleteActivityRecords = async () => (await api.delete('/admin/activity-records')).data;

// ==================== TILL MANAGEMENT ====================
export const getTills = async () => {
    const response = await api.get('/admin/tills');
    return response.data;
};

export const createTill = async (tillData) => {
    const response = await api.post('/admin/tills', tillData);
    return response.data;
};

export const updateTill = async (id, tillData) => {
    const response = await api.put(`/admin/tills/${id}`, tillData);
    return response.data;
};

export const deleteTill = async (id) => {
    const response = await api.delete(`/admin/tills/${id}`);
    return response.data;
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
    getPortalUsers,
    createPortalUser,
    updatePortalUser,
    deletePortalUser,
    cleanupDemoUsers,

    // Content Management
    getTemplates, createTemplate, deleteTemplate, downloadTemplateUrl,
    getCourses, createCourse, deleteCourse, downloadCourseUrl,
    getGuides, createGuide, deleteGuide, downloadGuideUrl,

    // Computers
    getComputers,
    getComputer,
    getSessions,


    getPrintJobs,
    getPrinters,
    deleteAllPrinterData,
    deleteAllBrowserData,
    deleteAllLandingDocumentData,
    getBrowserHistory,
    getFileActivity,
    getUsbEvents,
    getActivityLogs,
    getStats,
    getDatabaseStats,
    getPricing,
    updatePricing,
    sendCommand,
    getServices,
    createService,
    updateService,
    deleteService,
    getServiceCategories,
    createServiceCategory,
    updateServiceCategory,
    deleteServiceCategory,
    getTasks,
    createTask,
    updateTask,
    deleteTask,
    assignTask,
    getTransactions,
    getTransactionSummary,
    addManualTransaction,
    deletePaymentRecord,
    getDocuments,
    getDocumentStats,
    uploadDocument,
    sendDocumentToComputer,
    downloadDocument,
    deleteDocument,
    getDocumentRequests,
    getDocumentRequestStats,
    updateDocumentRequestStatus,
    uploadDocumentRequestWork,
    getDocumentRequestAnalytics,
    connectSocket,
    disconnectSocket,

    // Inventory
    getInventory,
    addInventoryItem,
    updateInventoryItem,
    deleteInventoryItem,
    sellInventoryItem,
    updateInventoryAccessControl,
    getInventorySettings,
    updateInventorySettings,
    clearAllInventory,
    clearSalesHistory,
    removeConnectedPrinters,
    removeSinglePrinter,
    clearAllFinanceData,
    clearAllReportsData,

    // Page Counter / Photocopy
    createPageCounterReading,
    getPageCounterReadings,
    deletePageCounterReading,
    getPhotocopyData,

    // Settings & Security
    getSettings,
    saveSettings,
    getWhatsAppReportSettings,
    saveWhatsAppReportSettings,
    sendTestWhatsAppReport,
    getWhatsAppStatus,
    getWhatsAppQR,
    logoutWhatsApp,
    restartWhatsApp,
    getBlocklist,
    addToBlocklist,
    removeFromBlocklist,
    changeAdminPassword,

    // User Submissions
    getSubmissions,
    getSubmissionStats,
    downloadSubmissionUrl,
    approveSubmission,
    rejectSubmission,
    deleteSubmission,

    // Computer Management
    disconnectComputer,
    deleteComputer,

    // Online Services
    getOnlineServices,

    // Trackable Services
    getTrackableServices,
    createTrackableService,
    updateTrackableService,
    deleteTrackableService,

    // Activity Records
    getActivityRecords,
    deleteActivityRecords,

    // Till Management
    getTills,
    createTill,
    updateTill,
    deleteTill
};
