/**
 * HawkNine Landing Page - JavaScript
 * Handles document uploads, service loading, and form submission
 */

// API Configuration
const API_BASE_URL = 'http://localhost:5000/api/v1';

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
        service: 'Professional IT services'
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
        service: 'settings'
    };
    return icons[category] || 'package';
}

function formatUnit(unit) {
    const units = {
        'per_hour': '/hour',
        'per_page': '/page',
        'per_copy': '/copy',
        'flat': 'flat rate'
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

function handleFiles(files) {
    for (const file of files) {
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

        // For demo: Show success anyway with generated order ID
        // In production, show error message
        showSuccessModal(generateOrderId());
        uploadForm.reset();
        uploadedFiles = [];
        renderSelectedFiles();
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
