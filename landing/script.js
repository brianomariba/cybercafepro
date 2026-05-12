/**
 * HawkNine Landing Page - JavaScript
 * Handles document uploads, service loading, and form submission
 */

// API Configuration - Auto-detect production vs development
const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
const API_BASE_URL = isProduction ? 'https://api.hawkninegroup.com/api/v1' : 'http://localhost:5000/api/v1';
const PORTAL_URL = isProduction ? 'https://portal.hawkninegroup.com' : 'http://localhost:5173';

// Expose globally
window.goToPortal = function (path) {
    const url = path ? `${PORTAL_URL}${path}` : PORTAL_URL;
    window.location.href = url;
};

// DOM Elements
let dropZone, fileInput, selectedFilesContainer, uploadForm, servicesGrid, pricingTable;
let uploadedFiles = [];

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', function () {
    // Initialize Lucide icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // Cache DOM elements
    dropZone = document.getElementById('dropZone');
    fileInput = document.getElementById('fileInput');
    selectedFilesContainer = document.getElementById('selectedFiles');
    uploadForm = document.getElementById('uploadForm');
    servicesGrid = document.getElementById('servicesGrid');
    pricingTable = document.getElementById('pricingTable');

    // Initialize components
    initNavbar();
    initDropZone();
    initForm();
    loadServices();
    initPortalLinks();
});

// ==================== NAVIGATION ====================

function initNavbar() {
    const navbar = document.getElementById('navbar');
    const mobileMenu = document.getElementById('mobileMenu');
    const navLinks = document.getElementById('navLinks');

    // Scroll effect
    window.addEventListener('scroll', function () {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // Mobile menu toggle
    if (mobileMenu) {
        mobileMenu.addEventListener('click', function () {
            navLinks.classList.toggle('active');
            mobileMenu.classList.toggle('active');
        });
    }
}

function scrollToSection(sectionId) {
    const section = document.getElementById(sectionId);
    if (section) {
        section.scrollIntoView({ behavior: 'smooth' });
    }
}

// ==================== SERVICES ====================

async function loadServices() {
    if (!servicesGrid) return;

    try {
        const response = await fetch(`${API_BASE_URL}/admin/services`);
        const services = await response.json();

        if (!Array.isArray(services) || services.length === 0) {
            showDefaultServices();
            return;
        }

        renderServices(services);
        renderPricing(services);
    } catch (error) {
        console.error('Failed to load services:', error);
        showDefaultServices();
    }
}

function showDefaultServices() {
    // Fallback services if API is unavailable
    const defaultServices = [
        { id: 'svc-1', name: 'Computer Usage', category: 'usage', price: 200, unit: 'per_hour', icon: 'monitor' },
        { id: 'svc-2', name: 'B&W Printing', category: 'printing', price: 10, unit: 'per_page', icon: 'printer' },
        { id: 'svc-3', name: 'Color Printing', category: 'printing', price: 50, unit: 'per_page', icon: 'printer' },
        { id: 'svc-4', name: 'Document Scanning', category: 'scanning', price: 20, unit: 'per_page', icon: 'scan' },
        { id: 'svc-5', name: 'Photocopying B&W', category: 'photocopy', price: 8, unit: 'per_copy', icon: 'copy' },
        { id: 'svc-6', name: 'Typing Services', category: 'typing', price: 50, unit: 'per_page', icon: 'file-text' },
        { id: 'svc-7', name: 'CV Creation', category: 'document', price: 500, unit: 'flat', icon: 'file-user' },
        { id: 'svc-8', name: 'Email Setup', category: 'service', price: 200, unit: 'flat', icon: 'mail' },
        { id: 'svc-9', name: 'Passport Photo', category: 'photography', price: 200, unit: '4_photos', icon: 'camera' },
        { id: 'svc-10', name: 'Photo Shoot', category: 'photography', price: 1500, unit: 'per_hour', icon: 'camera' },
        { id: 'svc-11', name: 'Video Editing', category: 'videography', price: 2500, unit: 'per_min', icon: 'video' },
        { id: 'svc-12', name: 'Logo Design', category: 'branding', price: 3000, unit: 'flat', icon: 'palette' },
    ];

    renderServices(defaultServices);
    renderPricing(defaultServices);
}

function renderServices(services) {
    if (!servicesGrid) return;

    const categoryIcons = {
        usage: 'monitor',
        printing: 'printer',
        scanning: 'scan',
        photocopy: 'copy',
        typing: 'file-text',
        document: 'file-check',
        service: 'settings',
        default: 'package'
    };

    const activeServices = services.filter(s => s.isActive !== false);

    servicesGrid.innerHTML = activeServices.map(service => `
        <div class="service-card">
            <div class="service-icon">
                <i data-lucide="${service.icon || categoryIcons[service.category] || categoryIcons.default}"></i>
            </div>
            <h3>${escapeHtml(service.name)}</h3>
            <p>${service.description || getCategoryDescription(service.category)}</p>
            <div>
                <span class="service-price">KSH ${service.price.toLocaleString()}</span>
                <span class="service-unit">${formatUnit(service.unit)}</span>
            </div>
        </div>
    `).join('');

    // Reinitialize icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function renderPricing(services) {
    if (!pricingTable) return;

    const activeServices = services.filter(s => s.isActive !== false);

    pricingTable.innerHTML = `
        <div class="pricing-row header">
            <span>Service</span>
            <span>Price</span>
        </div>
        ${activeServices.map(service => `
            <div class="pricing-row">
                <div class="pricing-service">
                    <i data-lucide="${getServiceIcon(service.category)}"></i>
                    <span>${escapeHtml(service.name)}</span>
                </div>
                <div class="pricing-amount">
                    KSH ${service.price.toLocaleString()} <small style="color: #94A3B8; font-weight: 400;">${formatUnit(service.unit)}</small>
                </div>
            </div>
        `).join('')}
    `;

    // Reinitialize icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function getCategoryDescription(category) {
    const descriptions = {
        usage: 'Professional workstation with high-speed internet',
        printing: 'High-quality prints on premium paper',
        scanning: 'High-resolution digital scanning',
        photocopy: 'Fast and clear photocopies',
        typing: 'Professional document typing service',
        document: 'Expert document creation and formatting',
        service: 'Professional IT services',
        photography: 'Professional photography services',
        videography: 'High-quality video production',
        branding: 'Creative branding and design'
    };
    return descriptions[category] || 'Professional service';
}

function getServiceIcon(category) {
    const icons = {
        usage: 'monitor',
        printing: 'printer',
        scanning: 'scan',
        photocopy: 'copy',
        typing: 'file-text',
        document: 'file-check',
        service: 'settings',
        photography: 'camera',
        videography: 'video',
        branding: 'palette'
    };
    return icons[category] || 'package';
}

function formatUnit(unit) {
    const units = {
        'per_hour': '/hour',
        'per_page': '/page',
        'per_copy': '/copy',
        'flat': 'flat rate',
        '4_photos': 'for 4',
        'per_min': '/min'
    };
    return units[unit] || unit;
}

// ==================== FILE UPLOAD ====================

function initDropZone() {
    if (!dropZone || !fileInput) return;

    // Click to open file browser
    dropZone.addEventListener('click', () => fileInput.click());

    // Drag and drop events
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });

    // File input change
    fileInput.addEventListener('change', () => {
        handleFiles(fileInput.files);
    });
}

// Allowed file types (PDF, Word, Excel)
const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx'];
const ALLOWED_MIMETYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
];

function handleFiles(files) {
    for (const file of files) {
        // Check file type
        const extension = file.name.split('.').pop().toLowerCase();
        const isAllowedType = ALLOWED_EXTENSIONS.includes(extension) ||
            ALLOWED_MIMETYPES.includes(file.type);

        if (!isAllowedType) {
            alert(`File "${file.name}" is not supported. Please upload only PDF, Word (.doc, .docx), or Excel (.xls, .xlsx) files.`);
            continue;
        }

        // Check file size (max 50MB)
        if (file.size > 50 * 1024 * 1024) {
            alert(`File "${file.name}" is too large. Maximum size is 50MB.`);
            continue;
        }

        // Check for duplicates
        if (uploadedFiles.some(f => f.name === file.name && f.size === file.size)) {
            continue;
        }

        uploadedFiles.push(file);
    }

    renderSelectedFiles();
}

function renderSelectedFiles() {
    if (!selectedFilesContainer) return;

    if (uploadedFiles.length === 0) {
        selectedFilesContainer.innerHTML = '';
        return;
    }

    selectedFilesContainer.innerHTML = uploadedFiles.map((file, index) => `
        <div class="file-item">
            <i data-lucide="${getFileIcon(file.name)}"></i>
            <span>${escapeHtml(file.name)}</span>
            <span class="file-size">${formatFileSize(file.size)}</span>
            <button type="button" onclick="removeFile(${index})" aria-label="Remove file">
                <i data-lucide="x"></i>
            </button>
        </div>
    `).join('');

    // Reinitialize icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function removeFile(index) {
    uploadedFiles.splice(index, 1);
    renderSelectedFiles();
}

function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const icons = {
        pdf: 'file-text',
        doc: 'file-text',
        docx: 'file-text',
        xls: 'file-spreadsheet',
        xlsx: 'file-spreadsheet',
        ppt: 'presentation',
        pptx: 'presentation',
        jpg: 'image',
        jpeg: 'image',
        png: 'image',
        gif: 'image',
        txt: 'file'
    };
    return icons[ext] || 'file';
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ==================== FORM SUBMISSION ====================

function initForm() {
    if (!uploadForm) return;

    uploadForm.addEventListener('submit', handleFormSubmit);
}

async function handleFormSubmit(e) {
    e.preventDefault();

    const submitBtn = document.getElementById('submitBtn');
    const originalText = submitBtn.innerHTML;

    // Validation
    if (uploadedFiles.length === 0) {
        alert('Please upload at least one file.');
        return;
    }

    const serviceType = document.getElementById('serviceType').value;
    const customerName = document.getElementById('customerName').value.trim();
    const customerPhone = document.getElementById('customerPhone').value.trim();
    const instructions = document.getElementById('instructions').value.trim();

    if (!serviceType || !customerName || !customerPhone) {
        alert('Please fill in all required fields.');
        return;
    }

    // Phone validation (Kenya format)
    const phoneRegex = /^(?:\+254|0)?[17]\d{8}$/;
    if (!phoneRegex.test(customerPhone.replace(/\s/g, ''))) {
        alert('Please enter a valid Kenyan phone number.');
        return;
    }

    // Show loading state
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner" style="width:20px;height:20px;border-width:2px;margin-right:8px;"></span> Uploading...';

    try {
        // Create form data for file upload
        const formData = new FormData();

        for (const file of uploadedFiles) {
            formData.append('files', file);
        }
        formData.append('serviceType', serviceType);
        formData.append('customerName', customerName);
        formData.append('customerPhone', customerPhone);
        formData.append('instructions', instructions);
        formData.append('source', 'landing_page');

        // Append user specific info if logged in
        const userStr = localStorage.getItem('hawknine_client_user');
        if (userStr) {
            try {
                const u = JSON.parse(userStr);
                formData.append('email', u.email);
                formData.append('userId', u.id);
            } catch (e) { }
        }

        // Submit to backend
        const response = await fetch(`${API_BASE_URL}/public/document-request`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Upload failed');
        }

        const result = await response.json();

        // Show success modal
        showSuccessModal(result.orderId || generateOrderId());

        // Reset form
        uploadForm.reset();
        uploadedFiles = [];
        renderSelectedFiles();

    } catch (error) {
        console.error('Submit error:', error);
        alert('Failed to submit request. Please try again or contact us directly.');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }
}

function generateOrderId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let orderId = 'HN-';
    for (let i = 0; i < 6; i++) {
        orderId += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return orderId;
}

function showSuccessModal(orderId) {
    const modal = document.getElementById('successModal');
    const orderIdSpan = document.getElementById('orderId');

    if (orderIdSpan) {
        orderIdSpan.textContent = orderId;
    }

    if (modal) {
        modal.classList.add('active');
    }

    // Reinitialize icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function closeModal() {
    const modal = document.getElementById('successModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// Close any modal on overlay click
document.addEventListener('click', function (e) {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
    }
});

// ==================== UTILITIES ====================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Expose functions globally for onclick handlers
window.scrollToSection = scrollToSection;
window.removeFile = removeFile;
window.closeModal = closeModal;
window.openTrackModal = openTrackModal;

function initPortalLinks() {
    // Only target old a tags if any
    const loginBtns = document.querySelectorAll('a.btn-login');
    loginBtns.forEach(btn => {
        btn.href = PORTAL_URL;
    });

    // Check if logged in to update header
    checkClientLoginState();
}

// ==================== CLIENT AUTH & DASHBOARD ====================

function checkClientLoginState() {
    const token = localStorage.getItem('hawknine_client_token');
    const headerBtn = document.getElementById('headerLoginBtn');
    if (token && headerBtn) {
        headerBtn.innerText = 'My Dashboard';
        headerBtn.onclick = openDashboardModal;

        // Auto-fill form fields if user is logged in
        try {
            const user = JSON.parse(localStorage.getItem('hawknine_client_user'));
            if (user) {
                const nameInput = document.getElementById('customerName');
                if (nameInput && !nameInput.value) nameInput.value = user.name || '';
            }
        } catch (e) { }
    } else if (headerBtn) {
        headerBtn.innerText = 'Login / Sign Up';
        headerBtn.onclick = openAuthModal;
    }
}

function openAuthModal() {
    document.getElementById('authModal').classList.add('active');
    // Reset to login tab and clear messages
    switchAuthTab('login');
}
function closeAuthModal() {
    document.getElementById('authModal').classList.remove('active');
}
window.closeAuthModal = closeAuthModal;
window.openAuthModal = openAuthModal;

function switchAuthTab(tab) {
    // Clear messages
    hideAuthMessages();

    // Toggle tab active state
    document.getElementById('tabLogin').classList.toggle('active', tab === 'login');
    document.getElementById('tabRegister').classList.toggle('active', tab === 'register');

    // Toggle form visibility
    document.getElementById('loginFormSection').style.display = tab === 'login' ? 'block' : 'none';
    document.getElementById('registerFormSection').style.display = tab === 'register' ? 'block' : 'none';
}
window.switchAuthTab = switchAuthTab;

function showAuthError(msg) {
    const el = document.getElementById('authError');
    if (el) { el.textContent = msg; el.classList.add('show'); }
    const suc = document.getElementById('authSuccess');
    if (suc) suc.classList.remove('show');
}

function showAuthSuccess(msg) {
    const el = document.getElementById('authSuccess');
    if (el) { el.textContent = msg; el.classList.add('show'); }
    const err = document.getElementById('authError');
    if (err) err.classList.remove('show');
}

function hideAuthMessages() {
    const err = document.getElementById('authError');
    const suc = document.getElementById('authSuccess');
    if (err) err.classList.remove('show');
    if (suc) suc.classList.remove('show');
}

document.addEventListener('DOMContentLoaded', () => {
    // Auth Forms - Login
    const loginForm = document.getElementById('clientLoginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideAuthMessages();
            const btn = e.target.querySelector('button');
            const originalText = btn.innerText;
            btn.innerText = 'Logging in...';
            btn.disabled = true;

            const email = document.getElementById('loginEmail').value.trim();
            const password = document.getElementById('loginPassword').value;

            if (!email || !password) {
                showAuthError('Please fill in all fields');
                btn.innerText = originalText;
                btn.disabled = false;
                return;
            }

            try {
                const res = await fetch(`${API_BASE_URL}/client/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    localStorage.setItem('hawknine_client_token', data.token);
                    localStorage.setItem('hawknine_client_user', JSON.stringify(data.user));
                    hideAuthMessages();
                    closeAuthModal();
                    checkClientLoginState();
                    openDashboardModal();
                } else {
                    showAuthError(data.error || 'Invalid email or password');
                }
            } catch (err) {
                console.error('Login error:', err);
                showAuthError('Connection error. Please check your internet and try again.');
            } finally {
                btn.innerText = originalText;
                btn.disabled = false;
            }
        });
    }

    // Auth Forms - Register
    const registerForm = document.getElementById('clientRegisterForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideAuthMessages();
            const btn = e.target.querySelector('button');
            const originalText = btn.innerText;
            btn.innerText = 'Creating account...';
            btn.disabled = true;

            const name = document.getElementById('regName').value.trim();
            const email = document.getElementById('regEmail').value.trim();
            const phone = document.getElementById('regPhone').value.trim();
            const password = document.getElementById('regPassword').value;

            if (!name || !email || !password) {
                showAuthError('Please fill in all required fields');
                btn.innerText = originalText;
                btn.disabled = false;
                return;
            }

            if (password.length < 6) {
                showAuthError('Password must be at least 6 characters');
                btn.innerText = originalText;
                btn.disabled = false;
                return;
            }

            try {
                const res = await fetch(`${API_BASE_URL}/client/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, phone, password })
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    localStorage.setItem('hawknine_client_token', data.token);
                    localStorage.setItem('hawknine_client_user', JSON.stringify(data.user));
                    hideAuthMessages();
                    closeAuthModal();
                    checkClientLoginState();
                    openDashboardModal();
                } else {
                    showAuthError(data.error || 'Registration failed. Please try again.');
                }
            } catch (err) {
                console.error('Registration error:', err);
                showAuthError('Connection error. Please check your internet and try again.');
            } finally {
                btn.innerText = originalText;
                btn.disabled = false;
            }
        });
    }
});

async function openDashboardModal() {
    const token = localStorage.getItem('hawknine_client_token');
    if (!token) return openAuthModal();

    document.getElementById('dashboardModal').classList.add('active');

    // Initialize the dashboard upload zone
    initDashUpload();

    const list = document.getElementById('dashboardHistoryList');
    list.innerHTML = '<div style="text-align:center; padding: 20px;">Loading history...</div>';

    try {
        const res = await fetch(`${API_BASE_URL}/client/history`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to load');
        const data = await res.json();

        let completed = 0;
        let readyCount = 0;
        let html = '';
        data.forEach(req => {
            if (req.status === 'completed') completed++;
            if (req.status === 'ready' || (req.status === 'completed' && req.resultFiles && req.resultFiles.length > 0)) readyCount++;

            let statusColor = '#94a3b8';
            let statusBg = 'rgba(148,163,184,0.1)';
            if (req.status === 'processing') { statusColor = '#f59e0b'; statusBg = 'rgba(245,158,11,0.1)'; }
            if (req.status === 'completed' || req.status === 'ready') { statusColor = '#10b981'; statusBg = 'rgba(16,185,129,0.1)'; }
            if (req.status === 'cancelled') { statusColor = '#ef4444'; statusBg = 'rgba(239,68,68,0.1)'; }

            // Download section for completed work
            let downloadHTML = '';
            if (req.resultFiles && req.resultFiles.length > 0) {
                const fileLinks = req.resultFiles.map(f => {
                    return `<a href="${f.downloadUrl}" target="_blank" rel="noopener" style="display:inline-flex; align-items:center; gap:4px; padding:5px 10px; background:#00B4D8; color:white; border-radius:6px; font-size:12px; text-decoration:none; margin:3px 3px 3px 0; font-weight:500;">
                        <i data-lucide="download" style="width:14px; height:14px;"></i> ${escapeHtml(f.originalName)}
                    </a>`;
                }).join('');
                downloadHTML = `<div style="margin-top:8px;">${fileLinks}</div>`;
            } else if (req.status === 'completed') {
                downloadHTML = '<div style="margin-top:6px;"><span style="color:#10b981; font-size:12px; font-style:italic;">&#10003; Completed (Physical Pickup)</span></div>';
            }

            // Public share link
            let shareLinkHTML = '';
            if (req.resultFiles && req.resultFiles.length > 0) {
                shareLinkHTML = `<button onclick="copyShareLink('${req.orderId}')" style="margin-top:6px; display:inline-flex; align-items:center; gap:4px; padding:4px 8px; background:transparent; border:1px solid #CBD5E1; border-radius:6px; font-size:11px; cursor:pointer; color:#64748b; font-family:inherit;">
                    <i data-lucide="link" style="width:12px; height:12px;"></i> Copy Share Link
                </button>`;
            }

            html += `
            <div style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 12px; background:white;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div style="flex:1;">
                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                            <strong style="font-size:15px;">${escapeHtml((req.serviceType || 'Document').replace(/-/g, ' '))}</strong>
                            <span style="display:inline-block; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:600; color:${statusColor}; background:${statusBg}; text-transform:uppercase;">${req.status}</span>
                        </div>
                        <span style="font-size: 12px; color: #64748b;">
                            ${new Date(req.createdAt).toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'})} &middot;
                            <span style="font-family: monospace; color:#00B4D8;">ID: ${req.orderId}</span>
                        </span>
                        ${req.instructions ? `<div style="margin-top:4px; font-size:12px; color:#94a3b8; font-style:italic;">"${escapeHtml(req.instructions)}"</div>` : ''}
                        ${downloadHTML}
                        ${shareLinkHTML}
                    </div>
                    <div style="text-align:right; min-width:60px;">
                        <span style="font-size:12px; color:#94a3b8;">${req.files?.length || req.totalFiles || 0} file(s)</span>
                    </div>
                </div>
            </div>`;
        });

        document.getElementById('dashTotalOrders').innerText = data.length || 0;
        document.getElementById('dashCompletedOrders').innerText = completed;
        const readyEl = document.getElementById('dashReadyOrders');
        if (readyEl) readyEl.innerText = readyCount;

        list.innerHTML = html || '<div style="text-align:center; padding: 30px; color: #64748b;"><i data-lucide="inbox" style="width:40px; height:40px; margin-bottom:8px; opacity:0.4;"></i><br/>No documents uploaded yet.<br/><span style="font-size:13px;">Use the upload button above to submit your first document.</span></div>';
        if (typeof lucide !== 'undefined') lucide.createIcons();

    } catch (e) {
        list.innerHTML = '<div style="text-align:center; padding: 20px; color: #ef4444;">Could not load history. Please try again later.</div>';
    }
}
window.openDashboardModal = openDashboardModal;

function closeDashboardModal() {
    document.getElementById('dashboardModal').classList.remove('active');
    const section = document.getElementById('dashUploadSection');
    if (section) section.style.display = 'none';
}
window.closeDashboardModal = closeDashboardModal;

function clientLogout() {
    localStorage.removeItem('hawknine_client_token');
    localStorage.removeItem('hawknine_client_user');
    closeDashboardModal();
    checkClientLoginState();
}
window.clientLogout = clientLogout;

// ==================== DASHBOARD UPLOAD ====================

let dashUploadedFiles = [];

function toggleDashUpload() {
    const section = document.getElementById('dashUploadSection');
    const btn = document.getElementById('dashUploadToggleBtn');
    if (section.style.display === 'none') {
        section.style.display = 'block';
        btn.style.borderColor = '#00B4D8';
        btn.style.color = '#00B4D8';
        btn.innerHTML = '<i data-lucide="x" style="width:18px; height:18px;"></i> Cancel Upload';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    } else {
        section.style.display = 'none';
        btn.style.borderColor = '#CBD5E1';
        btn.style.color = '#64748b';
        btn.innerHTML = '<i data-lucide="upload-cloud" style="width:20px; height:20px;"></i> Upload New Document';
        dashUploadedFiles = [];
        renderDashSelectedFiles();
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}
window.toggleDashUpload = toggleDashUpload;

function initDashUpload() {
    const dashDropZone = document.getElementById('dashDropZone');
    const dashFileInput = document.getElementById('dashFileInput');
    const dashForm = document.getElementById('dashUploadForm');

    if (!dashDropZone || !dashFileInput || dashDropZone._initialized) return;
    dashDropZone._initialized = true;

    dashDropZone.addEventListener('click', () => dashFileInput.click());

    dashDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dashDropZone.classList.add('dragover');
    });
    dashDropZone.addEventListener('dragleave', () => {
        dashDropZone.classList.remove('dragover');
    });
    dashDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dashDropZone.classList.remove('dragover');
        handleDashFiles(e.dataTransfer.files);
    });
    dashFileInput.addEventListener('change', () => {
        handleDashFiles(dashFileInput.files);
    });

    dashForm.addEventListener('submit', handleDashUploadSubmit);
}

function handleDashFiles(files) {
    for (const file of files) {
        const extension = file.name.split('.').pop().toLowerCase();
        const isAllowedType = ALLOWED_EXTENSIONS.includes(extension) || ALLOWED_MIMETYPES.includes(file.type);
        if (!isAllowedType) {
            showToast('"' + file.name + '" is not supported. Use PDF, Word, or Excel files.', 'error');
            continue;
        }
        if (file.size > 50 * 1024 * 1024) {
            showToast('"' + file.name + '" is too large. Max 50MB.', 'error');
            continue;
        }
        if (dashUploadedFiles.some(f => f.name === file.name && f.size === file.size)) continue;
        dashUploadedFiles.push(file);
    }
    renderDashSelectedFiles();
}

function renderDashSelectedFiles() {
    const container = document.getElementById('dashSelectedFiles');
    if (!container) return;
    if (dashUploadedFiles.length === 0) {
        container.innerHTML = '';
        return;
    }
    container.innerHTML = dashUploadedFiles.map((file, index) => `
        <div style="display:flex; align-items:center; gap:8px; padding:8px 12px; background:white; border:1px solid #e2e8f0; border-radius:8px;">
            <i data-lucide="${getFileIcon(file.name)}" style="width:16px; height:16px; color:#00B4D8;"></i>
            <span style="flex:1; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(file.name)}</span>
            <span style="font-size:11px; color:#94a3b8;">${formatFileSize(file.size)}</span>
            <button type="button" onclick="removeDashFile(${index})"
                style="background:none; border:none; cursor:pointer; color:#ef4444; padding:2px;">
                <i data-lucide="x" style="width:14px; height:14px;"></i>
            </button>
        </div>
    `).join('');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function removeDashFile(index) {
    dashUploadedFiles.splice(index, 1);
    renderDashSelectedFiles();
}
window.removeDashFile = removeDashFile;

async function handleDashUploadSubmit(e) {
    e.preventDefault();

    if (dashUploadedFiles.length === 0) {
        showToast('Please select at least one file to upload.', 'error');
        return;
    }

    const serviceType = document.getElementById('dashServiceType').value;
    if (!serviceType) {
        showToast('Please select a service type.', 'error');
        return;
    }

    const instructions = document.getElementById('dashInstructions').value.trim();
    const btn = document.getElementById('dashSubmitBtn');
    const originalText = btn.innerHTML;

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="width:18px;height:18px;border-width:2px;margin-right:6px;"></span> Uploading...';

    try {
        const userStr = localStorage.getItem('hawknine_client_user');
        const user = userStr ? JSON.parse(userStr) : {};

        const formData = new FormData();
        for (const file of dashUploadedFiles) {
            formData.append('files', file);
        }
        formData.append('serviceType', serviceType);
        formData.append('customerName', user.name || 'Unknown');
        formData.append('customerPhone', user.phone || '0000000000');
        formData.append('instructions', instructions);
        formData.append('source', 'client_dashboard');
        if (user.email) formData.append('email', user.email);
        if (user.id) formData.append('userId', user.id);

        const res = await fetch(`${API_BASE_URL}/public/document-request`, {
            method: 'POST',
            body: formData
        });

        if (!res.ok) throw new Error('Upload failed');

        const result = await res.json();

        showToast('Document submitted! Order ID: ' + result.orderId, 'success');
        dashUploadedFiles = [];
        renderDashSelectedFiles();
        document.getElementById('dashUploadForm').reset();
        toggleDashUpload();

        // Refresh history list
        openDashboardModal();

    } catch (err) {
        console.error('Dashboard upload error:', err);
        showToast('Failed to submit. Please try again.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

// ==================== SHARE LINK UTILITY ====================

function copyShareLink(orderId) {
    const baseUrl = isProduction ? 'https://hawkninegroup.com' : window.location.origin;
    const shareText = 'Download your completed work from HawkNine:\n1. Visit: ' + baseUrl + '/landing/\n2. Click "Track Order"\n3. Enter Order ID: ' + orderId;

    if (navigator.clipboard) {
        navigator.clipboard.writeText(shareText).then(() => {
            showToast('Share link copied to clipboard!', 'success');
        }).catch(() => {
            fallbackCopy(shareText);
        });
    } else {
        fallbackCopy(shareText);
    }
}
window.copyShareLink = copyShareLink;

function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand('copy');
        showToast('Share link copied!', 'success');
    } catch (e) {
        showToast('Could not copy. Please copy manually.', 'error');
    }
    document.body.removeChild(ta);
}

// ==================== TOAST NOTIFICATIONS ====================

function showToast(message, type) {
    type = type || 'info';
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.style.cssText = 'position:fixed; top:20px; right:20px; z-index:100000; display:flex; flex-direction:column; gap:8px;';
        document.body.appendChild(container);
    }

    const colors = {
        success: { bg: '#10b981', icon: '\u2713' },
        error: { bg: '#ef4444', icon: '\u2717' },
        info: { bg: '#3b82f6', icon: '\u2139' }
    };
    const c = colors[type] || colors.info;

    const toast = document.createElement('div');
    toast.style.cssText = 'display:flex; align-items:center; gap:10px; padding:12px 20px; background:' + c.bg + '; color:white; border-radius:10px; font-size:14px; font-weight:500; box-shadow:0 4px 15px rgba(0,0,0,0.2); font-family:inherit; max-width:380px;';
    toast.innerHTML = '<span style="font-size:16px;">' + c.icon + '</span> ' + escapeHtml(message);
    container.appendChild(toast);

    setTimeout(function () {
        toast.style.transition = 'opacity 0.3s, transform 0.3s';
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        setTimeout(function () { toast.remove(); }, 300);
    }, 4000);
}
window.showToast = showToast;

// ==================== ORDER TRACKING ====================

function openTrackModal() {
    document.getElementById('trackModal').classList.add('active');
    document.getElementById('trackOrderFormSection').style.display = 'block';
    document.getElementById('trackResultSection').style.display = 'none';
    if (document.getElementById('trackOrderId')) {
        document.getElementById('trackOrderId').value = '';
    }
}

function closeTrackModal() {
    document.getElementById('trackModal').classList.remove('active');
}
window.closeTrackModal = closeTrackModal;

function backToTrackSearch() {
    document.getElementById('trackOrderFormSection').style.display = 'block';
    document.getElementById('trackResultSection').style.display = 'none';
}
window.backToTrackSearch = backToTrackSearch;

document.addEventListener('DOMContentLoaded', function () {
    var trackForm = document.getElementById('trackOrderForm');
    if (trackForm) {
        trackForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            var orderId = document.getElementById('trackOrderId').value.trim().toUpperCase();
            if (!orderId) return alert('Please enter an order ID');

            var btn = e.target.querySelector('button');
            var originalText = btn.innerText;
            btn.innerText = 'Tracking...';
            btn.disabled = true;

            try {
                var res = await fetch(API_BASE_URL + '/public/track/' + orderId);
                var data = await res.json();

                if (res.ok) {
                    var statusColor = '#94a3b8';
                    if (data.status === 'processing') statusColor = '#f59e0b';
                    if (data.status === 'completed' || data.status === 'ready') statusColor = '#10b981';

                    document.getElementById('trackResultStatus').innerText = data.status.toUpperCase();
                    document.getElementById('trackResultStatus').style.color = statusColor;
                    document.getElementById('trackResultService').innerText = data.serviceType;
                    document.getElementById('trackResultDate').innerText = new Date(data.createdAt).toLocaleString();

                    var filesContainer = document.getElementById('trackResultFiles');
                    var filesList = document.getElementById('trackResultFilesList');
                    filesList.innerHTML = '';

                    if ((data.status === 'completed' || data.status === 'ready') && data.resultFiles && data.resultFiles.length > 0) {
                        data.resultFiles.forEach(function (f) {
                            var link = document.createElement('a');
                            link.href = f.downloadUrl;
                            link.target = '_blank';
                            link.innerHTML = '<button class="btn btn-secondary" style="width:100%; text-align:left; padding:10px;"><i data-lucide="download" style="width:16px; height:16px; margin-right:8px; vertical-align:middle;"></i> Download ' + escapeHtml(f.originalName) + '</button>';
                            filesList.appendChild(link);
                        });
                        filesContainer.style.display = 'block';
                        if (typeof lucide !== 'undefined') lucide.createIcons();
                    } else {
                        filesContainer.style.display = 'none';
                    }

                    document.getElementById('trackOrderFormSection').style.display = 'none';
                    document.getElementById('trackResultSection').style.display = 'block';
                } else {
                    alert(data.error || 'Request not found with this Order ID');
                }
            } catch (err) {
                alert('An error occurred during tracking');
            } finally {
                btn.innerText = originalText;
                btn.disabled = false;
            }
        });
    }
});

