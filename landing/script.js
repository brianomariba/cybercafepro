/**
 * HawkNine Landing Page - JavaScript
 * Handles document uploads, service loading, and form submission
 */

// API Configuration - Auto-detect production vs development
// FORCING PRODUCTION FOR TESTING: User is checking prod portal but running landing page locally.
const isProduction = true; // window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
const API_BASE_URL = 'https://api.hawkninegroup.com/api/v1';
// isProduction
// ? 'https://api.hawkninegroup.com/api/v1'
// : 'http://localhost:5000/api/v1';

const PORTAL_URL = 'https://portal.hawkninegroup.com';
// isProduction
// ? 'https://portal.hawkninegroup.com'
// : 'http://localhost:5173';

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

// Close modal on overlay click
document.addEventListener('click', function (e) {
    if (e.target.classList.contains('modal')) {
        closeModal();
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
}
function closeAuthModal() {
    document.getElementById('authModal').classList.remove('active');
}
window.closeAuthModal = closeAuthModal;
window.openAuthModal = openAuthModal;

function switchAuthTab(tab) {
    document.getElementById('tabLogin').classList.remove('active');
    document.getElementById('tabRegister').classList.remove('active');
    document.getElementById('tabLogin').style.color = '#64748b';
    document.getElementById('tabRegister').style.color = '#64748b';
    document.getElementById('tabLogin').style.borderBottom = 'none';
    document.getElementById('tabRegister').style.borderBottom = 'none';

    document.getElementById('loginFormSection').style.display = 'none';
    document.getElementById('registerFormSection').style.display = 'none';

    if (tab === 'login') {
        document.getElementById('tabLogin').classList.add('active');
        document.getElementById('tabLogin').style.color = '';
        document.getElementById('tabLogin').style.borderBottom = '2px solid #00B4D8';
        document.getElementById('loginFormSection').style.display = 'block';
    } else {
        document.getElementById('tabRegister').classList.add('active');
        document.getElementById('tabRegister').style.color = '';
        document.getElementById('tabRegister').style.borderBottom = '2px solid #00B4D8';
        document.getElementById('registerFormSection').style.display = 'block';
    }
}
window.switchAuthTab = switchAuthTab;

document.addEventListener('DOMContentLoaded', () => {
    // Auth Forms
    const loginForm = document.getElementById('clientLoginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('button');
            const originalText = btn.innerText;
            btn.innerText = 'Loading...';
            btn.disabled = true;

            try {
                const res = await fetch(`${API_BASE_URL}/client/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: document.getElementById('loginEmail').value,
                        password: document.getElementById('loginPassword').value
                    })
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    localStorage.setItem('hawknine_client_token', data.token);
                    localStorage.setItem('hawknine_client_user', JSON.stringify(data.user));
                    closeAuthModal();
                    checkClientLoginState();
                    openDashboardModal();
                } else {
                    alert(data.error || 'Login failed');
                }
            } catch (e) {
                alert('An error occurred during login');
            } finally {
                btn.innerText = originalText;
                btn.disabled = false;
            }
        });
    }

    const registerForm = document.getElementById('clientRegisterForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('button');
            const originalText = btn.innerText;
            btn.innerText = 'Loading...';
            btn.disabled = true;

            try {
                const res = await fetch(`${API_BASE_URL}/client/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: document.getElementById('regName').value,
                        email: document.getElementById('regEmail').value,
                        phone: document.getElementById('regPhone').value,
                        password: document.getElementById('regPassword').value
                    })
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    localStorage.setItem('hawknine_client_token', data.token);
                    localStorage.setItem('hawknine_client_user', JSON.stringify(data.user));
                    closeAuthModal();
                    checkClientLoginState();
                    openDashboardModal();
                } else {
                    alert(data.error || 'Registration failed');
                }
            } catch (e) {
                alert('An error occurred during registration');
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

    const list = document.getElementById('dashboardHistoryList');
    list.innerHTML = '<div style="text-align:center; padding: 20px;">Loading history...</div>';

    try {
        const res = await fetch(`${API_BASE_URL}/client/history`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to load');
        const data = await res.json();

        let completed = 0;
        let html = '';
        data.forEach(req => {
            if (req.status === 'completed' || req.status === 'ready') completed++;

            // Format status label
            let statusColor = '#94a3b8'; // pending
            if (req.status === 'processing') statusColor = '#f59e0b';
            if (req.status === 'completed' || req.status === 'ready') statusColor = '#10b981';

            // Download button
            let downloadBtnHTML = '';
            if ((req.status === 'completed' || req.status === 'ready') && req.resultFiles && req.resultFiles.length > 0) {
                const links = req.resultFiles.map(f => `<a href="${f.downloadUrl}" target="_blank" style="display:inline-block; margin-right:5px; color:#00B4D8; font-size:12px; text-decoration:none;"><i data-lucide="download"></i> Download ${escapeHtml(f.originalName)}</a>`).join('<br/>');
                downloadBtnHTML = `<div>${links}</div>`;
            } else if (req.status === 'completed') {
                downloadBtnHTML = `<span style="color:#10b981; font-size:12px;">Completed (Physical Pickup)</span>`;
            }

            html += `
            <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin-bottom: 10px; display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <strong style="display:block;">${escapeHtml(req.serviceType)}</strong>
                    <span style="font-size: 12px; color: #64748b;">${new Date(req.createdAt).toLocaleDateString()} &middot; ID: ${req.orderId}</span>
                    <div style="margin-top: 5px;">${downloadBtnHTML}</div>
                </div>
                <div style="text-align:right;">
                    <span style="display:block; font-size: 13px; font-weight:bold; color: ${statusColor}; text-transform: uppercase;">${req.status}</span>
                </div>
            </div>`;
        });

        document.getElementById('dashTotalOrders').innerText = data.length || 0;
        document.getElementById('dashCompletedOrders').innerText = completed;

        list.innerHTML = html || '<div style="text-align:center; padding: 20px; color: #64748b;">No documents uploaded yet.</div>';
        if (typeof lucide !== 'undefined') lucide.createIcons();

    } catch (e) {
        list.innerHTML = '<div style="text-align:center; padding: 20px; color: #ef4444;">Could not load history. Please try again later.</div>';
    }
}
window.openDashboardModal = openDashboardModal;

function closeDashboardModal() {
    document.getElementById('dashboardModal').classList.remove('active');
}
window.closeDashboardModal = closeDashboardModal;

function clientLogout() {
    localStorage.removeItem('hawknine_client_token');
    localStorage.removeItem('hawknine_client_user');
    closeDashboardModal();
    checkClientLoginState();
}
window.clientLogout = clientLogout;

// ==================== TRACKING ====================

function openTrackModal(e) {
    if (e) e.preventDefault();
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

document.addEventListener('DOMContentLoaded', () => {
    const trackForm = document.getElementById('trackOrderForm');
    if (trackForm) {
        trackForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const orderId = document.getElementById('trackOrderId').value.trim().toUpperCase();
            if (!orderId) return alert('Please enter an order ID');

            const btn = e.target.querySelector('button');
            const originalText = btn.innerText;
            btn.innerText = 'Tracking...';
            btn.disabled = true;

            try {
                const res = await fetch(`${API_BASE_URL}/public/track/${orderId}`);
                const data = await res.json();

                if (res.ok) {
                    let statusColor = '#94a3b8'; // pending
                    if (data.status === 'processing') statusColor = '#f59e0b';
                    if (data.status === 'completed' || data.status === 'ready') statusColor = '#10b981';

                    document.getElementById('trackResultStatus').innerText = data.status.toUpperCase();
                    document.getElementById('trackResultStatus').style.color = statusColor;
                    document.getElementById('trackResultService').innerText = data.serviceType;
                    document.getElementById('trackResultDate').innerText = new Date(data.createdAt).toLocaleString();

                    // Show files if any
                    const filesContainer = document.getElementById('trackResultFiles');
                    const filesList = document.getElementById('trackResultFilesList');
                    filesList.innerHTML = '';

                    if ((data.status === 'completed' || data.status === 'ready') && data.resultFiles && data.resultFiles.length > 0) {
                        data.resultFiles.forEach(f => {
                            const link = document.createElement('a');
                            link.href = f.downloadUrl;
                            link.target = '_blank';
                            link.innerHTML = `<button class="btn btn-secondary" style="width:100%; text-align:left; padding:10px;"><i data-lucide="download" style="width:16px; height:16px; margin-right:8px; vertical-align:middle;"></i> Download ${escapeHtml(f.originalName)}</button>`;
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

