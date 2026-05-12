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
 * Optimized for speed — only targets the foreground browser window.
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

    const stdout = await runPS(script, 3000);
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
 * Get URLs from ALL open browser windows (not just the active one).
 * This captures URLs from background browsers too — critical for accurate tracking.
 * Returns array of { url, title, browser } objects.
 */
async function getAllBrowserUrls() {
    const script = `
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$results = @()

try {
    $root = [System.Windows.Automation.AutomationElement]::RootElement
    $classProperty = [System.Windows.Automation.AutomationElement]::ClassNameProperty
    $controlType = [System.Windows.Automation.AutomationElement]::ControlTypeProperty
    $nameProperty = [System.Windows.Automation.AutomationElement]::NameProperty

    # Find all top-level browser windows
    $windowCondition = New-Object System.Windows.Automation.PropertyCondition(
        $controlType,
        [System.Windows.Automation.ControlType]::Window
    )
    $allWindows = $root.FindAll(
        [System.Windows.Automation.TreeScope]::Children,
        $windowCondition
    )

    $editCondition = New-Object System.Windows.Automation.PropertyCondition(
        $controlType,
        [System.Windows.Automation.ControlType]::Edit
    )

    foreach ($win in $allWindows) {
        try {
            $className = $win.GetCurrentPropertyValue($classProperty)
            if ($className -notmatch 'Chrome_WidgetWin_1|MozillaWindowClass') { continue }

            $winName = $win.GetCurrentPropertyValue($nameProperty)
            if (-not $winName -or $winName -eq '') { continue }

            # Determine browser from window title
            $browser = 'Unknown'
            if ($winName -match 'Edge$') { $browser = 'Edge' }
            elseif ($winName -match 'Chrome$') { $browser = 'Chrome' }
            elseif ($winName -match 'Brave$') { $browser = 'Brave' }
            elseif ($winName -match 'Opera$') { $browser = 'Opera' }
            elseif ($winName -match 'Firefox$') { $browser = 'Firefox' }
            elseif ($winName -match 'Vivaldi$') { $browser = 'Vivaldi' }
            elseif ($className -eq 'MozillaWindowClass') { $browser = 'Firefox' }
            elseif ($className -eq 'Chrome_WidgetWin_1') {
                # Could be Chrome, Edge, Brave, Opera, Vivaldi — check process
                try {
                    $nativeHandle = $win.Current.NativeWindowHandle
                    if ($nativeHandle) {
                        $proc = Get-Process | Where-Object { $_.MainWindowHandle -eq $nativeHandle } | Select-Object -First 1
                        if ($proc) {
                            $pn = $proc.ProcessName.ToLower()
                            if ($pn -match 'msedge') { $browser = 'Edge' }
                            elseif ($pn -match 'chrome') { $browser = 'Chrome' }
                            elseif ($pn -match 'brave') { $browser = 'Brave' }
                            elseif ($pn -match 'opera') { $browser = 'Opera' }
                            elseif ($pn -match 'vivaldi') { $browser = 'Vivaldi' }
                        }
                    }
                } catch {}
            }

            # Find the address bar (Edit control) in each browser window
            $editElements = $win.FindAll(
                [System.Windows.Automation.TreeScope]::Descendants,
                $editCondition
            )

            foreach ($edit in $editElements) {
                try {
                    $valPattern = $edit.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
                    if ($valPattern) {
                        $url = $valPattern.Current.Value
                        if ($url -match '^https?://|^www\\.|^[a-zA-Z0-9-]+\\.[a-zA-Z]{2,}') {
                            $results += [PSCustomObject]@{
                                url = $url
                                title = $winName
                                browser = $browser
                            }
                            break  # Only need the first edit (address bar) per window
                        }
                    }
                } catch {}
            }
        } catch { continue }
    }
} catch {}

if ($results.Count -eq 0) {
    "[]"
} else {
    $results | ConvertTo-Json -Depth 2
}
`;

    const stdout = await runPS(script, 6000);
    if (!stdout || stdout.trim() === '' || stdout.trim() === '[]') {
        return [];
    }

    try {
        const parsed = JSON.parse(stdout);
        const items = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);

        return items.filter(item => item && item.url).map(item => {
            let url = item.url.trim();
            if (url && !url.startsWith('http')) {
                url = 'https://' + url;
            }

            // Clean browser suffix from title
            let title = (item.title || '').trim();
            title = title
                .replace(/ - Google Chrome$/i, '')
                .replace(/ - Microsoft\u200B? Edge$/i, '')
                .replace(/ - Mozilla Firefox$/i, '')
                .replace(/ - Brave$/i, '')
                .replace(/ - Opera$/i, '')
                .replace(/ - Vivaldi$/i, '')
                .replace(/ — Mozilla Firefox$/i, '');

            return {
                url,
                title: title || 'Unknown Page',
                browser: item.browser || 'Unknown'
            };
        });
    } catch (e) {
        console.error('[BrowserHistory] getAllBrowserUrls parse error:', e.message);
        return [];
    }
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
    education: ['wikipedia.org', 'coursera.org', 'udemy.com', 'edx.org', 'khanacademy.org', 'medium.com', 'stackoverflow.com', 'w3schools.com', 'freecodecamp.org', 'udacity.com', 'netacad.com', 'skillsforall.com', 'cisco.com'],
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
 * Enhanced with time-spent tracking per URL
 * Tracks when a URL becomes active and calculates duration when user navigates away
 */
class LiveUrlTracker {
    constructor() {
        this.visitedUrls = [];
        this.urlVisitCounts = new Map();
        this.urlTimeSpent = new Map();  // url -> total seconds spent (accumulated across revisits)

        // Current active URL state
        this.activeUrl = null;          // URL currently being viewed
        this.activeTitle = '';          // Title of current page
        this.activeBrowser = '';        // Browser viewing the page
        this.activeCategory = '';       // Category of current URL
        this.activeStartTime = 0;       // When user started viewing this URL (epoch ms)

        // Dedup state  
        this.lastUrl = '';              // Last URL for same-tab dedup
        this.lastTitle = '';            // Last title for same-tab dedup
        this.lastChangeTime = 0;        // Timestamp of last URL change
    }

    /**
     * Process a browser window and extract/track URLs.
     * Returns: { current, completed } where:
     *   - current: the new URL to log (only on navigation)
     *   - completed: the previous URL with timeSpentSeconds (only on navigation change)
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
        if (url === this.lastUrl && title === this.lastTitle) {
            return null; // Same page still open, no new navigation
        }

        // ---- URL Changed: close previous, start new ----

        // Complete the previous URL (calculate time spent)
        let completed = null;
        if (this.activeUrl && this.activeStartTime > 0) {
            const timeSpentSeconds = Math.round((Date.now() - this.activeStartTime) / 1000);
            // Only report if meaningful time was spent (> 2 seconds)
            if (timeSpentSeconds > 2) {
                completed = {
                    url: this.activeUrl,
                    title: this.activeTitle,
                    category: this.activeCategory,
                    browser: this.activeBrowser,
                    timeSpentSeconds: timeSpentSeconds,
                    startTime: new Date(this.activeStartTime).toISOString(),
                    endTime: new Date().toISOString()
                };
                // Accumulate total time for this URL
                const existing = this.urlTimeSpent.get(this.activeUrl) || 0;
                this.urlTimeSpent.set(this.activeUrl, existing + timeSpentSeconds);
            }
        }

        // Start tracking the new URL
        const category = categorizeUrl(url);
        this.activeUrl = url;
        this.activeTitle = title;
        this.activeBrowser = browserName;
        this.activeCategory = category;
        this.activeStartTime = Date.now();

        // Update dedup state
        this.lastUrl = url;
        this.lastTitle = title;
        this.lastChangeTime = Date.now();

        this.addUrl(url, title, category, browserName);

        const current = {
            url,
            title,
            category,
            browser: browserName,
            timestamp: new Date().toISOString()
        };

        return { current, completed };
    }

    /**
     * Called when user switches to a non-browser app.
     * Closes the timer on the current URL and returns its data with duration.
     */
    notifyInactive() {
        if (!this.activeUrl || this.activeStartTime <= 0) return null;

        const timeSpentSeconds = Math.round((Date.now() - this.activeStartTime) / 1000);
        let completed = null;

        if (timeSpentSeconds > 2) {
            completed = {
                url: this.activeUrl,
                title: this.activeTitle,
                category: this.activeCategory,
                browser: this.activeBrowser,
                timeSpentSeconds: timeSpentSeconds,
                startTime: new Date(this.activeStartTime).toISOString(),
                endTime: new Date().toISOString()
            };
            // Accumulate total time
            const existing = this.urlTimeSpent.get(this.activeUrl) || 0;
            this.urlTimeSpent.set(this.activeUrl, existing + timeSpentSeconds);
        }

        // Reset active state
        this.activeUrl = null;
        this.activeTitle = '';
        this.activeBrowser = '';
        this.activeCategory = '';
        this.activeStartTime = 0;

        return completed;
    }

    /**
     * Get the current active URL's elapsed time (for live display)
     */
    getActiveUrlElapsed() {
        if (!this.activeUrl || this.activeStartTime <= 0) return null;
        return {
            url: this.activeUrl,
            title: this.activeTitle,
            browser: this.activeBrowser,
            category: this.activeCategory,
            elapsedSeconds: Math.round((Date.now() - this.activeStartTime) / 1000)
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

    /**
     * Get time spent per URL (accumulated across the session)
     */
    getTimeSpentSummary(limit = 20) {
        const sorted = [...this.urlTimeSpent.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit);
        return sorted.map(([url, seconds]) => ({
            url,
            timeSpentSeconds: seconds,
            timeSpentFormatted: formatDuration(seconds)
        }));
    }

    /**
     * Get time spent per domain (accumulated)
     */
    getTimeSpentByDomain(limit = 10) {
        const domainTime = new Map();
        for (const [url, seconds] of this.urlTimeSpent) {
            try {
                const domain = new URL(url).hostname.replace('www.', '');
                domainTime.set(domain, (domainTime.get(domain) || 0) + seconds);
            } catch (e) { }
        }
        const sorted = [...domainTime.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit);
        return sorted.map(([domain, seconds]) => ({
            domain,
            timeSpentSeconds: seconds,
            timeSpentFormatted: formatDuration(seconds)
        }));
    }

    getCategorySummary() {
        const summary = {};
        for (const entry of this.visitedUrls) {
            const cat = entry.category || 'other';
            if (!summary[cat]) {
                summary[cat] = { count: 0, totalVisits: 0, totalTimeSeconds: 0 };
            }
            summary[cat].count++;
            summary[cat].totalVisits += entry.visits;
        }
        // Add time data from urlTimeSpent
        for (const [url, seconds] of this.urlTimeSpent) {
            const cat = categorizeUrl(url);
            if (!summary[cat]) {
                summary[cat] = { count: 0, totalVisits: 0, totalTimeSeconds: 0 };
            }
            summary[cat].totalTimeSeconds += seconds;
        }
        return summary;
    }

    reset() {
        this.visitedUrls = [];
        this.urlVisitCounts.clear();
        this.urlTimeSpent.clear();
        this.activeUrl = null;
        this.activeTitle = '';
        this.activeBrowser = '';
        this.activeCategory = '';
        this.activeStartTime = 0;
        this.lastUrl = '';
        this.lastTitle = '';
        this.lastChangeTime = 0;
    }

    getStats() {
        return {
            totalUrls: this.visitedUrls.length,
            uniqueDomains: this.urlVisitCounts.size,
            totalPageViews: [...this.urlVisitCounts.values()].reduce((a, b) => a + b, 0),
            totalBrowsingTime: [...this.urlTimeSpent.values()].reduce((a, b) => a + b, 0),
            categories: this.getCategorySummary(),
            topTimeSpent: this.getTimeSpentByDomain(5)
        };
    }
}

/**
 * Format seconds into human-readable duration
 */
function formatDuration(seconds) {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    }
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

module.exports = {
    LiveUrlTracker,
    extractUrlFromTitle,
    categorizeUrl,
    isValidBrowsableUrl,
    getActiveTabUrl,
    getAllBrowserUrls,
    getBrowserHistoryFromDB
};
