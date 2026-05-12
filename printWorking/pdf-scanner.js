const fs = require('fs');
const path = require('path');

// Provide DOMMatrix polyfill for pdf.js running inside Node.js (Electron Main Process)
if (typeof DOMMatrix === 'undefined') {
    global.DOMMatrix = class DOMMatrix {
        constructor() {
            this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
        }
    };
}
// Provide secondary polyfills if needed by modern pdf.js
if (typeof Path2D === 'undefined') {
    global.Path2D = class Path2D {
        constructor() {}
        moveTo() {} lineTo() {} closePath() {} bezierCurveTo() {} quadraticCurveTo() {}
    };
}

const pdfParse = require('pdf-parse');
const SERVICES = {
    'KRA': ['kenya revenue authority', 'kra pin', 'kra receipt', 'kra compliance', 'kra ack', 'kra.go.ke'],
    'NTSA': ['national transport and safety authority', 'ntsa', 'driving license', 'logbook search'],
    'eCitizen': ['ecitizen', 'e-citizen', 'business registration service', 'brs', 'civil registration', 'ecitizen.go.ke'],
    'HELB': ['higher education loans board', 'helb clearance', 'helb statement'],
    'NHIF': ['national hospital insurance fund', 'nhif'],
    'NSSF': ['national social security fund', 'nssf'],
    'KUCCPS': ['kuccps', 'kenya universities and colleges central placement service'],
    'NCA': ['national construction authority'],
    'NEMA': ['national environment management authority']
};

const URL_SERVICES = {
    'kra.go.ke': 'KRA',
    'ntsa.go.ke': 'NTSA',
    'ecitizen.go.ke': 'eCitizen',
    'helb.co.ke': 'HELB',
    'nhif.or.ke': 'NHIF',
    'nssf.or.ke': 'NSSF',
    'kuccps.net': 'KUCCPS',
    'nca.go.ke': 'NCA',
    'nema.go.ke': 'NEMA'
};

function inferServiceFromUrl(url, title) {
    if (!url && !title) return null;
    const searchString = `${url} ${title}`.toLowerCase();

    for (const [domain, serviceName] of Object.entries(URL_SERVICES)) {
        if (searchString.includes(domain)) {
            return serviceName;
        }
    }
    return null;
}

async function scanPdfForService(filePath, recentUrls = []) {
    if (path.extname(filePath).toLowerCase() !== '.pdf') return null;

    let detectedService = null;
    let detectionMethod = null;

    try {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(dataBuffer);
        const text = data.text.toLowerCase();

        for (const [serviceName, keywords] of Object.entries(SERVICES)) {
            for (const keyword of keywords) {
                if (text.includes(keyword)) {
                    detectedService = serviceName;
                    detectionMethod = 'Keyword content match';
                    break;
                }
            }
            if (detectedService) break;
        }
    } catch (e) {
        console.error(`[PDF SCANNER] Failed to parse ${filePath}:`, e.message);
    }

    // Fallback 1: Infer from recent browser history (active/recent tabs that the user was utilizing)
    if (!detectedService && recentUrls.length > 0) {
        for (const nav of recentUrls) {
            const inferred = inferServiceFromUrl(nav.url, nav.title);
            if (inferred) {
                detectedService = inferred;
                detectionMethod = 'Recent browser context URL correlation';
                break;
            }
        }
    }

    // Fallback 2: General PDF downloaded in the context of an active web session
    if (!detectedService && recentUrls.length > 0) {
        const lastActive = recentUrls[0];
        // Ensure it's not a generic new tab or blank page
        if (lastActive && lastActive.title && !lastActive.url.includes('newtab') && !lastActive.url.includes('about:blank')) {
            // Give context to admin of where this undocumented PDF came from
            detectedService = `Portal Download: ${lastActive.title.substring(0, 30).replace(' - Google Chrome', '')}`;
            detectionMethod = 'Active Window context correlation';
        } else {
            // Generic fallback
            detectedService = "Unrecognized Service PDF";
            detectionMethod = 'Standalone Document';
        }
    } else if (!detectedService) {
        detectedService = "Unrecognized Service PDF";
        detectionMethod = 'Standalone Document';
    }

    if (detectedService) {
        return {
            service: detectedService,
            fileName: path.basename(filePath),
            path: filePath,
            detectedKeyword: detectionMethod,
            timestamp: new Date().toISOString()
        };
    }

    return null;
}

module.exports = { scanPdfForService };
