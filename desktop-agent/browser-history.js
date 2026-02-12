/**
 * Browser History Tracking
 * Enhanced URL tracking from active window detection with intelligent extraction
 * Includes UI Automation for extracting actual URLs from browser address bars
 * Uses sql.js for reliable history database reading without native dependencies
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const initSqlJs = require('sql.js');

/**
 * Get the actual URL from Chrome/Edge address bar using UI Automation
 * This is more reliable than extracting from window titles
 */
function getActiveTabUrl() {
    return new Promise((resolve) => {
        // PowerShell script to get URL from browser address bar using UI Automation
        const psCommand = `
            Add-Type -AssemblyName UIAutomationClient
            Add-Type -AssemblyName UIAutomationTypes
            
            $automationId = [System.Windows.Automation.AutomationElement]::AutomationIdProperty
            $nameProperty = [System.Windows.Automation.AutomationElement]::NameProperty
            $classProperty = [System.Windows.Automation.AutomationElement]::ClassNameProperty
            $controlType = [System.Windows.Automation.AutomationElement]::ControlTypeProperty
            
            # Get focused window
            $root = [System.Windows.Automation.AutomationElement]::FocusedElement
            if (-not $root) { return '' }
            
            # Walk up to find browser window
            $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
            $current = $root
            $browserWindow = $null
            
            while ($current -ne $null) {
                $className = $current.GetCurrentPropertyValue($classProperty)
                if ($className -match 'Chrome_WidgetWin_1|MicrosoftEdge|ApplicationFrameWindow|Firefox') {
                    $browserWindow = $current
                    break
                }
                $current = $walker.GetParent($current)
            }
            
            if (-not $browserWindow) { return '' }
            
            # Find the address bar (Edit control with URL pattern)
            $condition = New-Object System.Windows.Automation.PropertyCondition($controlType, [System.Windows.Automation.ControlType]::Edit)
            $editElements = $browserWindow.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)
            
            foreach ($edit in $editElements) {
                try {
                    $pattern = $edit.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
                    if ($pattern) {
                        $value = $pattern.Current.Value
                        if ($value -match '^https?://|^www\\.') {
                            return $value
                        }
                    }
                } catch { }
                
                # Try Name property as fallback
                $name = $edit.GetCurrentPropertyValue($nameProperty)
                if ($name -match '^https?://|^www\\.') {
                    return $name
                }
            }
            
            return ''
        `;

        exec(`powershell -Command "${psCommand.replace(/\n/g, ' ').replace(/"/g, '\\"')}"`, { timeout: 3000 }, (error, stdout, stderr) => {
            if (error || !stdout || stdout.trim() === '') {
                resolve(null);
                return;
            }
            let url = stdout.trim();
            // Normalize URL
            if (url && !url.startsWith('http')) {
                url = 'https://' + url;
            }
            resolve(url);
        });
    });
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

        // Chrome/Edge/Firefox uses different epochs
        // Chrome/Edge: Microseconds since Jan 1, 1601 UTC
        // Firefox: Microseconds since Jan 1, 1970 UTC (PRTime)

        let query = '';
        const limit = 50;

        if (browserName === 'Firefox') {
            const cutoff = (Date.now() - (hoursBack * 3600000)) * 1000;
            query = `SELECT url, title, last_visit_date as time FROM moz_places WHERE last_visit_date > ${cutoff} ORDER BY last_visit_date DESC LIMIT ${limit}`;
        } else {
            // Chrome/Edge
            const epochDiff = 11644473600000; // ms between 1601 and 1970
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
                // Convert Chrome/Edge time (microseconds since 1601) to JS Date
                const epochDiff = 11644473600000;
                visitTime = new Date((row.time / 1000) - epochDiff).toISOString();
            }

            results.push({
                url: row.url,
                title: row.title,
                browser: browserName,
                visitTime: visitTime,
                timestamp: new Date().toISOString()
            });
        }

        stmt.free();
        return results;

    } catch (e) {
        console.error(`Error reading ${browserName} history:`, e.message);
        return [];
    } finally {
        if (db) db.close();
        // Clean up temp file
        try {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        } catch (e) { }
    }
}

/**
 * Read browser history from SQLite databases (Chrome, Edge, Firefox)
 */
async function getBrowserHistoryFromDB(hoursBack = 1) {
    const results = [];
    const localAppData = process.env.LOCALAPPDATA;
    const appData = process.env.APPDATA;

    // Paths to history files
    const historyPaths = [
        {
            name: 'Chrome',
            path: path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Default', 'History')
        },
        {
            name: 'Edge',
            path: path.join(localAppData, 'Microsoft', 'Edge', 'User Data', 'Default', 'History')
        },
        {
            name: 'Brave',
            path: path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data', 'Default', 'History')
        }
        // Firefox profile path is variable, skipping for simplicity unless requested
    ];

    for (const browser of historyPaths) {
        const history = await readSqliteHistory(browser.path, browser.name, hoursBack);
        results.push(...history);
    }

    // Sort by visit time descending
    return results.sort((a, b) => new Date(b.visitTime) - new Date(a.visitTime));
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
    news: ['cnn.com', 'bbc.com', 'nytimes.com', 'washingtonpost.com', 'theguardian.com', 'reuters.com', 'apnews.com', 'aljazeera.com']
};

/**
 * Extract URL from browser window title
 * Many browsers include URL info in the title
 */
function extractUrlFromTitle(title, browserName) {
    if (!title || typeof title !== 'string') return null;

    // Common patterns in browser titles:
    // "Page Title - Browser Name"
    // "Page Title — Browser Name"  
    // "Page Title | Website Name - Browser"
    // "[URL] Page Title - Browser"

    // Look for URL patterns in the title
    const urlPatterns = [
        // Direct URL in title
        /https?:\/\/[^\s<>"{}|\\^`\[\]]+/i,
        // Domain pattern
        /(?:^|[\s\-–—|])([a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}(?:\.[a-zA-Z]{2,})?)/
    ];

    for (const pattern of urlPatterns) {
        const match = title.match(pattern);
        if (match) {
            let url = match[0] || match[1];
            // Clean up and validate
            if (url && !url.startsWith('http')) {
                url = 'https://' + url;
            }
            try {
                new URL(url); // Validate URL
                return url;
            } catch (e) {
                // Invalid URL, continue
            }
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
    } catch (e) {
        // URL parsing failed
    }

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
        'New Tab',
        'Start Page',
        'Speed Dial'
    ];

    const checkString = (url || '') + (title || '');
    return !invalidPatterns.some(pattern => checkString.includes(pattern));
}

/**
 * Live URL tracking from active window
 * Enhanced with intelligent URL extraction and categorization
 */
class LiveUrlTracker {
    constructor() {
        this.visitedUrls = [];
        this.urlVisitCounts = new Map();
        this.lastProcessedKey = '';
    }

    /**
     * Process a browser window and extract/track URLs
     */
    addFromWindow(windowTitle, browserName, explicitUrl = null) {
        // Use explicit URL if provided, otherwise try to extract from title
        let url = explicitUrl;

        // If no explicit URL, try to extract from title
        if (!url || url.trim() === '') {
            url = extractUrlFromTitle(windowTitle, browserName);
        }

        const title = windowTitle || 'Unknown Page';

        // Check deduplication key using URL or Title
        const key = url || title;
        if (key === this.lastProcessedKey) {
            return null; // Already processed this
        }

        // Check if we have a valid URL or at least a meaningful title to track
        if (url) {
            // Validate URL format roughly
            if (url.startsWith('file://') || url === 'about:blank' || url === 'chrome://newtab/') {
                return null;
            }
        } else {
            // If we STILL don't have a URL, checks if title is browsable and informative
            if (!isValidBrowsableUrl(null, title)) {
                return null;
            }
            // Create synthetic URL for tracking purposes if title is good
            url = `https://page-limit/${encodeURIComponent(title.substring(0, 50))}`;
        }

        this.lastProcessedKey = key;

        // Get category
        const category = categorizeUrl(url);

        // Track the visit internally
        this.addUrl(url, title, category, browserName);

        // Return the data so it can be sent to server
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

        // Normalize URL (remove trailing slash, query params for grouping)
        const normalizedUrl = url.split('?')[0].replace(/\/$/, '');
        const finalCategory = category || categorizeUrl(url);

        // Check if this exact URL was visited
        const existing = this.visitedUrls.find(v => v.url === url);
        if (existing) {
            existing.lastVisit = new Date().toISOString();
            existing.visits++;
        } else {
            this.visitedUrls.push({
                url,
                normalizedUrl,
                title: title || '',
                category: finalCategory,
                browser: browser || 'unknown',
                visits: 1,
                firstVisit: new Date().toISOString(),
                lastVisit: new Date().toISOString()
            });
        }

        // Track visit counts by domain
        try {
            const domain = new URL(url).hostname;
            this.urlVisitCounts.set(domain, (this.urlVisitCounts.get(domain) || 0) + 1);
        } catch (e) {
            // Invalid URL - track with synthetic domain
            this.urlVisitCounts.set('unknown', (this.urlVisitCounts.get('unknown') || 0) + 1);
        }
    }

    getHistory() {
        return this.visitedUrls.slice(-100); // Last 100 entries
    }

    getRecentHistory(limit = 20) {
        return this.visitedUrls.slice(-limit).reverse(); // Most recent first
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
        this.lastProcessedKey = '';
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


