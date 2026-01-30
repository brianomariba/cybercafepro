/**
 * HawkNine User Portal API Service
 * Connects the User Portal to the Backend API
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

// Attach token for authenticated user requests
api.interceptors.request.use((config) => {
    try {
        const token = localStorage.getItem('hawknine_user_token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
    } catch (e) {
        // ignore storage errors
    }
    return config;
});

export const setUserToken = (token) => {
    localStorage.setItem('hawknine_user_token', token);
};

// ==================== TASKS ====================

export const getUserTasks = async (params = {}) => {
    const response = await api.get('/user/tasks', { params });
    return response.data;
};

export const updateTaskStatus = async (taskId, status) => {
    const response = await api.put(`/user/tasks/${taskId}/status`, { status });
    return response.data;
};

// ==================== SERVICES ====================

export const getServices = async () => {
    const response = await api.get('/admin/services');
    return response.data;
};

// ==================== DOCUMENTS ====================

export const getDocuments = async (params = {}) => {
    const response = await api.get('/documents', { params });
    return response.data;
};

export const downloadDocument = (documentId) => {
    return `${API_BASE_URL}/documents/${documentId}/download`;
};

// ==================== CONTENT ====================

export const getTemplates = async () => (await api.get('/templates')).data;
export const getCourses = async () => (await api.get('/courses')).data;
export const getGuides = async () => (await api.get('/guides')).data;


// ==================== USER AUTHENDPOINTS (OTP-BASED) ====================
export const loginUserStep1 = async (username, password) => {
    const response = await api.post('/auth/user/login-step1', { username, password });
    return response.data;
};

export const loginUserStep2 = async (tempToken, otp) => {
    const response = await api.post('/auth/user/login-step2', { tempToken, otp });
    return response.data;
};

export const userLogout = async () => {
    const response = await api.post('/auth/user/logout');
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

    // Task events
    socket.on('task-assigned', (data) => {
        if (callbacks.onTaskAssigned) callbacks.onTaskAssigned(data);
    });

    socket.on('task-updated', (data) => {
        if (callbacks.onTaskUpdated) callbacks.onTaskUpdated(data);
    });

    // Document events
    socket.on('document-for-agent', (data) => {
        if (callbacks.onDocumentReceived) callbacks.onDocumentReceived(data);
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
    getUserTasks,
    updateTaskStatus,
    getServices,
    getDocuments,
    downloadDocument,
    connectSocket,
    disconnectSocket
};
