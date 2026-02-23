/**
 * Browser History Tracking
 * Enhanced URL tracking from active window detection with intelligent extraction
 * Includes UI Automation for extracting actual URLs from browser address bars
 * Uses sql.js for reliable history database reading without native dependencies
 */

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const initSqlJs = require('sql.js');

/**
 * Run a PowerShell script reliably by writing to a temp .ps1 file.
 * Same pattern as print-monitor.js — avoids ALL quoting/escaping issues.
 */
function runPS(script, timeoutMs = 5000) {
    return new Promise((resolve) => {
        const tmpFile = path.join(os.tmpdir(), `hawknine_browser_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.ps1`);
        try {
            fs.writeFileSync(tmpFile, script, 'utf8');
        } catch (e) {
            resolve('');
            return;
        }

        execFile('powershell.exe', [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy', 'Bypass',
            '-File', tmpFile
        ], { timeout: timeoutMs, maxBuffer: 1024 * 512 }, (error, stdout, stderr) => {
            try { fs.unlinkSync(tmpFile); } catch (e) { /* ignore */ }
            if (error) {
                resolve('');
                return;
            }
            resolve(stdout || '');
        });
    });
}

/**
 * Get the actual URL from Chrome/Edge address bar using UI Automation
 * Written to a temp .ps1 file for reliable execution on any Windows machine.
 */
async function getActiveTabUrl() {
    const script = `
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

try {
    $root = [System.Windows.Automation.AutomationElement]::RootElement
    $focused = [System.Windows.Automation.AutomationElement]::FocusedElement
    if (-not $focused) { return }

    $classProperty = [System.Windows.Automation.AutomationElement]::ClassNameProperty
    $controlType = [System.Windows.Automation.AutomationElement]::ControlTypeProperty
    $nameProperty = [System.Windows.Automation.AutomationElement]::NameProperty

    $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
    $current = $focused
    $browserWindow = $null

    while ($current -ne $null) {
        try {
            $className = $current.GetCurrentPropertyValue($classProperty)
            if ($className -match 'Chrome_WidgetWin_1|MicrosoftEdge|ApplicationFrameWindow|MozillaWindowClass|Brave|Opera') {
                $browserWindow = $current
                break
            }
            $current = $walker.GetParent($current)
        } catch { break }
    }

    if (-not $browserWindow) { return }

    $conditionEdit = New-Object System.Windows.Automation.PropertyCondition(
        $controlType,
        [System.Windows.Automation.ControlType]::Edit
    )
    $editElements = $browserWindow.FindAll(
        [System.Windows.Automation.TreeScope]::Descendants,
        $conditionEdit
    )

    foreach ($edit in $editElements) {
        try {
            $valPattern = $edit.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
            if ($valPattern) {
                $url = $valPattern.Current.Value
                if ($url -match '^https?://|^www\\.|^[a-zA-Z0-9-]+\\.[a-zA-Z]{2,}') {
                    Write-Output $url
                    return
                }
            }
        } catch { }

        try {
            $name = $edit.GetCurrentPropertyValue($nameProperty)
            if ($name -match '^https?://|^www\\.|^[a-zA-Z0-9-]+\\.[a-zA-Z]{2,}') {
                Write-Output $name
                return
            }
        } catch { }
    }
} catch { }
`;

    const stdout = await runPS(script, 4000);
    if (!stdout || stdout.trim() === '') {
        return null;
    }

    let url = stdout.trim();
    if (url && !url.startsWith('http')) {
        url = 'https://' + url;
    }
    return url;
}

/**
 * Helper to safely copy and read a locked file using sql.js
 */
async function readSqliteHistory(dbPath, browserName, hoursBack = 1) {
    if (!fs.existsSync(dbPath)) return [];

    const tempPath = path.join(os.tmpdir(), `history_${browserName}_${Date.now()}.db`);
    let db = null;

    try {
        // Copy to temp to avoid file locking issues
        fs.copyFileSync(dbPath, tempPath);

        const fileBuffer = fs.readFileSync(tempPath);
        const SQL = await initSqlJs();
        db = new SQL.Database(fileBuffer);

        let query = '';
        const limit = 100;

        if (browserName === 'Firefox') {
            const cutoff = (Date.now() - (hoursBack * 3600000)) * 1000;
            query = `SELECT url, title, last_visit_date as time FROM moz_places WHERE last_visit_date > ${cutoff} ORDER BY last_visit_date DESC LIMIT ${limit}`;
        } else {
            // Chrome/Edge: Microseconds since Jan 1, 1601 UTC
            const epochDiff = 11644473600000;
            const cutoff = ((Date.now() + epochDiff) - (hoursBack * 3600000)) * 1000;
            query = `SELECT url, title, last_visit_time as time FROM urls WHERE last_visit_time > ${cutoff} ORDER BY last_visit_time DESC LIMIT ${limit}`;
        }

        const stmt = db.prepare(query);
        const results = [];

        while (stmt.step()) {
            const row = stmt.getAsObject();
            let visitTime;

            if (browserName === 'Firefox') {
                visitTime = new Date(row.time / 1000).toISOString();
            } else {
                const epochDiff = 11644473600000;
                visitTime = new Date((row.time / 1000) - epochDiff).toISOString();
            }

            // Clean title
            let cleanTitle = row.title;
            if (cleanTitle) {
                cleanTitle = cleanTitle
                    .replace(/ - Google Chrome$/i, '')
                    .replace(/ - Microsoft Edge$/i, '')
                    .replace(/ - Mozilla Firefox$/i, '')
                    .replace(/ - Brave$/i, '')
                    .replace(/ - Opera$/i, '')
                    .replace(/ — Mozilla Firefox$/i, '')
                    .replace(/ - YouTube$/, '');
            }

            results.push({
                url: row.url,
                title: cleanTitle || row.title,
                browser: browserName,
                visitTime: visitTime,
                timestamp: new Date().toISOString()
            });
        }

        stmt.free();
        return results;

    } catch (e) {
        console.error(`[BrowserHistory] Error reading ${browserName} history:`, e.message);
        return [];
    } finally {
        if (db) db.close();
        try {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        } catch (e) { }
    }
}

/**
 * Read browser history from SQLite databases (Chrome, Edge, Firefox, Brave, Opera, Vivaldi)
 * Scans all profiles, not just "Default"
 */
async function getBrowserHistoryFromDB(hoursBack = 1) {
    const results = [];
    const localAppData = process.env.LOCALAPPDATA;
    const appData = process.env.APPDATA;

    // Base directories for each browser (may have multiple profiles)
    const browserBases = [
        { name: 'Chrome', base: path.join(localAppData, 'Google', 'Chrome', 'User Data') },
        { name: 'Edge', base: path.join(localAppData, 'Microsoft', 'Edge', 'User Data') },
        { name: 'Brave', base: path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data') },
        { name: 'Opera', base: path.join(appData, 'Opera Software', 'Opera Stable') },
        { name: 'Vivaldi', base: path.join(localAppData, 'Vivaldi', 'User Data') },
    ];

    for (const browser of browserBases) {
        if (!fs.existsSync(browser.base)) continue;

        if (browser.name === 'Opera') {
            // Opera stores History directly in its base
            const histPath = path.join(browser.base, 'History');
            if (fs.existsSync(histPath)) {
                const history = await readSqliteHistory(histPath, browser.name, hoursBack);
                results.push(...history);
            }
        } else {
            // Check Default and Profile N directories
            const profiles = ['Default'];
            try {
                const entries = fs.readdirSync(browser.base);
                for (const entry of entries) {
                    if (/^Profile \d+$/i.test(entry)) {
                        profiles.push(entry);
                    }
                }
            } catch (e) { }

            for (const profile of profiles) {
                const histPath = path.join(browser.base, profile, 'History');
                if (fs.existsSync(histPath)) {
                    const history = await readSqliteHistory(histPath, browser.name, hoursBack);
                    results.push(...history);
                }
            }
        }
    }

    // Firefox: find profiles dynamically
    if (appData) {
        const firefoxBase = path.join(appData, 'Mozilla', 'Firefox', 'Profiles');
        if (fs.existsSync(firefoxBase)) {
            try {
                const profiles = fs.readdirSync(firefoxBase);
                for (const profile of profiles) {
                    const histPath = path.join(firefoxBase, profile, 'places.sqlite');
                    if (fs.existsSync(histPath)) {
                        const history = await readSqliteHistory(histPath, 'Firefox', hoursBack);
                        results.push(...history);
                    }
                }
            } catch (e) { }
        }
    }

    // Sort by visit time descending and deduplicate by URL+time
    const seen = new Set();
    const deduplicated = [];
    for (const item of results.sort((a, b) => new Date(b.visitTime) - new Date(a.visitTime))) {
        // Deduplicate by URL + rounded time (to the second)
        const key = `${item.url}|${item.visitTime.substring(0, 19)}`;
        if (!seen.has(key)) {
            seen.add(key);
            deduplicated.push(item);
        }
    }

    return deduplicated;
}

// Domain to category mapping
const CATEGORY_DOMAINS = {
    // Search Engines
    search: ['google.com', 'bing.com', 'duckduckgo.com', 'yahoo.com', 'baidu.com', 'yandex.com'],
    // Social Media
    social: ['facebook.com', 'twitter.com', 'x.com', 'instagram.com', 'linkedin.com', 'tiktok.com', 'reddit.com', 'pinterest.com', 'snapchat.com', 'whatsapp.com', 'telegram.org', 'discord.com'],
    // Video Platforms
    video: ['youtube.com', 'vimeo.com', 'netflix.com', 'twitch.tv', 'dailymotion.com', 'hulu.com', 'disneyplus.com', 'primevideo.com'],
    // Education
    education: ['wikipedia.org', 'coursera.org', 'udemy.com', 'edx.org', 'khanacademy.org', 'medium.com', 'stackoverflow.com', 'w3schools.com', 'freecodecamp.org', 'udacity.com'],
    // Development
    development: ['github.com', 'gitlab.com', 'bitbucket.org', 'npmjs.com', 'pypi.org', 'developer.mozilla.org', 'codepen.io', 'jsfiddle.net', 'replit.com', 'vercel.com', 'netlify.com', 'heroku.com'],
    // Productivity
    productivity: ['docs.google.com', 'sheets.google.com', 'slides.google.com', 'drive.google.com', 'notion.so', 'trello.com', 'asana.com', 'slack.com', 'zoom.us', 'meet.google.com', 'teams.microsoft.com', 'office.com'],
    // Shopping
    shopping: ['amazon.com', 'ebay.com', 'aliexpress.com', 'alibaba.com', 'etsy.com', 'shopify.com', 'walmart.com', 'target.com', 'jumia.co.ke'],
    // Entertainment
    entertainment: ['spotify.com', 'soundcloud.com', 'pandora.com', 'twitch.tv', 'crunchyroll.com', 'funimation.com'],
    // News
    news: ['cnn.com', 'bbc.com', 'nytimes.com', 'washingtonpost.com', 'theguardian.com', 'reuters.com', 'apnews.com', 'aljazeera.com', 'nation.africa', 'standardmedia.co.ke'],
    // Government & Services
    government: ['ecitizen.go.ke', 'kra.go.ke', 'nhif.or.ke', 'nssf.or.ke', 'kenya-law.org', 'judiciary.go.ke', 'immigration.go.ke', 'president.go.ke']
};

/**
 * Extract URL from browser window title
 */
function extractUrlFromTitle(title, browserName) {
    if (!title || typeof title !== 'string') return null;

    // Look for URL patterns in the title
    const urlPatterns = [
        /https?:\/\/[^\s<>"{}|\\^`\[\]]+/i,
        /(?:^|[\s\-–—|])([a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}(?:\.[a-zA-Z]{2,})?)/
    ];

    for (const pattern of urlPatterns) {
        const match = title.match(pattern);
        if (match) {
            let url = match[0] || match[1];
            if (url && !url.startsWith('http')) {
                url = 'https://' + url;
            }
            try {
                new URL(url);
                return url;
            } catch (e) { }
        }
    }

    // Domain extraction from well-known patterns
    const domainPatterns = {
        'Google': 'https://google.com',
        'YouTube': 'https://youtube.com',
        'Facebook': 'https://facebook.com',
        'Twitter': 'https://twitter.com',
        'Instagram': 'https://instagram.com',
        'LinkedIn': 'https://linkedin.com',
        'GitHub': 'https://github.com',
        'Stack Overflow': 'https://stackoverflow.com',
        'Wikipedia': 'https://wikipedia.org',
        'Amazon': 'https://amazon.com',
        'Netflix': 'https://netflix.com',
        'Spotify': 'https://spotify.com',
        'Reddit': 'https://reddit.com',
        'WhatsApp': 'https://web.whatsapp.com',
        'ChatGPT': 'https://chatgpt.com',
        'Gmail': 'https://mail.google.com',
        'Outlook': 'https://outlook.live.com',
        'eCitizen': 'https://ecitizen.go.ke',
    };

    for (const [name, url] of Object.entries(domainPatterns)) {
        if (title.toLowerCase().includes(name.toLowerCase())) {
            return url;
        }
    }

    return null;
}

/**
 * Get category for a URL based on its domain
 */
function categorizeUrl(url) {
    if (!url) return 'other';

    try {
        const hostname = new URL(url).hostname.replace('www.', '');

        for (const [category, domains] of Object.entries(CATEGORY_DOMAINS)) {
            for (const domain of domains) {
                if (hostname === domain || hostname.endsWith('.' + domain)) {
                    return category;
                }
            }
        }
    } catch (e) { }

    return 'other';
}

/**
 * Check if this is a valid browsable URL (not internal browser pages)
 */
function isValidBrowsableUrl(url, title) {
    if (!url && !title) return false;

    const invalidPatterns = [
        'about:blank',
        'about:newtab',
        'chrome://',
        'chrome-extension://',
        'edge://',
        'moz-extension://',
        'file://',
        'devtools://',
        'chrome-search://',
        'New Tab',
        'Start Page',
        'Speed Dial',
        'page-limit/'
    ];

    const checkString = (url || '') + (title || '');
    return !invalidPatterns.some(pattern => checkString.includes(pattern));
}

/**
 * Live URL tracking from active window
 * Enhanced with better deduplication that doesn't skip revisits
 */
class LiveUrlTracker {
    constructor() {
        this.visitedUrls = [];
        this.urlVisitCounts = new Map();
        this.lastUrl = '';       // Last URL for same-tab dedup (avoid repeated same-URL pings)
        this.lastTitle = '';     // Last title for same-tab dedup
        this.lastChangeTime = 0; // Timestamp of last URL change
    }

    /**
     * Process a browser window and extract/track URLs
     */
    addFromWindow(windowTitle, browserName, explicitUrl = null) {
        let url = explicitUrl;

        // If no explicit URL, try to extract from title
        if (!url || url.trim() === '') {
            url = extractUrlFromTitle(windowTitle, browserName);
        }

        const title = windowTitle || 'Unknown Page';

        // Validate URL
        if (url) {
            if (url.startsWith('file://') || url === 'about:blank' || url === 'chrome://newtab/' || url.includes('page-limit/')) {
                return null;
            }
        } else {
            if (!isValidBrowsableUrl(null, title)) {
                return null;
            }
            // Create synthetic URL for tracking purposes if title is good
            url = `https://browsed/${encodeURIComponent(title.substring(0, 80))}`;
        }

        // Dedup: skip if SAME url AND SAME title as last check (user hasn't navigated)
        // But if URL changed OR title changed, it's a new navigation — allow it
        if (url === this.lastUrl && title === this.lastTitle) {
            return null; // Same page still open, no new navigation
        }

        // Update tracking state
        this.lastUrl = url;
        this.lastTitle = title;
        this.lastChangeTime = Date.now();

        const category = categorizeUrl(url);
        this.addUrl(url, title, category, browserName);

        return {
            url,
            title,
            category,
            browser: browserName,
            timestamp: new Date().toISOString()
        };
    }

    addUrl(url, title, category = null, browser = null) {
        if (!url || url.startsWith('file://') || url === '' || url === 'about:blank') return;

        const normalizedUrl = url.split('?')[0].replace(/\/$/, '');
        const finalCategory = category || categorizeUrl(url);

        // Always add a new entry (we want the full history, not just unique URLs)
        this.visitedUrls.push({
            url,
            normalizedUrl,
            title: title || '',
            category: finalCategory,
            browser: browser || 'unknown',
            visits: 1,
            timestamp: new Date().toISOString()
        });

        // Keep array from growing unbounded
        if (this.visitedUrls.length > 500) {
            this.visitedUrls = this.visitedUrls.slice(-400);
        }

        // Track visit counts by domain
        try {
            const domain = new URL(url).hostname;
            this.urlVisitCounts.set(domain, (this.urlVisitCounts.get(domain) || 0) + 1);
        } catch (e) {
            this.urlVisitCounts.set('unknown', (this.urlVisitCounts.get('unknown') || 0) + 1);
        }
    }

    getHistory() {
        return this.visitedUrls.slice(-100);
    }

    getRecentHistory(limit = 20) {
        return this.visitedUrls.slice(-limit).reverse();
    }

    getTopDomains(limit = 10) {
        const sorted = [...this.urlVisitCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit);
        return sorted.map(([domain, count]) => ({ domain, visits: count }));
    }

    getCategorySummary() {
        const summary = {};
        for (const entry of this.visitedUrls) {
            const cat = entry.category || 'other';
            if (!summary[cat]) {
                summary[cat] = { count: 0, totalVisits: 0 };
            }
            summary[cat].count++;
            summary[cat].totalVisits += entry.visits;
        }
        return summary;
    }

    reset() {
        this.visitedUrls = [];
        this.urlVisitCounts.clear();
        this.lastUrl = '';
        this.lastTitle = '';
        this.lastChangeTime = 0;
    }

    getStats() {
        return {
            totalUrls: this.visitedUrls.length,
            uniqueDomains: this.urlVisitCounts.size,
            totalPageViews: [...this.urlVisitCounts.values()].reduce((a, b) => a + b, 0),
            categories: this.getCategorySummary()
        };
    }
}

module.exports = {
    LiveUrlTracker,
    extractUrlFromTitle,
    categorizeUrl,
    isValidBrowsableUrl,
    getActiveTabUrl,
    getBrowserHistoryFromDB
};
