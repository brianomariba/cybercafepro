/**
 * Browser History Tracking
 * Enhanced URL tracking from active window detection with intelligent extraction
 * Includes UI Automation for extracting actual URLs from browser address bars
 */

const { exec } = require('child_process');

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
 * Read browser history from SQLite databases (Chrome, Edge, Firefox)
 * Note: This reads the history files which may be locked while browser is running
 */
function getBrowserHistoryFromDB(hoursBack = 1) {
    return new Promise((resolve) => {
        const psCommand = `
            $results = @()
            $cutoffTime = (Get-Date).AddHours(-${hoursBack})
            $cutoffChrome = [int64]((Get-Date).AddHours(-${hoursBack}).ToUniversalTime() - [DateTime]'1601-01-01').TotalMicroseconds
            
            # Chrome History
            $chromePath = "$env:LOCALAPPDATA\\Google\\Chrome\\User Data\\Default\\History"
            if (Test-Path $chromePath) {
                try {
                    $tempPath = "$env:TEMP\\chrome_history_temp.db"
                    Copy-Item $chromePath $tempPath -Force -ErrorAction SilentlyContinue
                    $conn = New-Object System.Data.SQLite.SQLiteConnection("Data Source=$tempPath;Version=3;Read Only=True;")
                    $conn.Open()
                    $cmd = $conn.CreateCommand()
                    $cmd.CommandText = "SELECT url, title, last_visit_time FROM urls WHERE last_visit_time > $cutoffChrome ORDER BY last_visit_time DESC LIMIT 20"
                    $reader = $cmd.ExecuteReader()
                    while ($reader.Read()) {
                        $results += [PSCustomObject]@{
                            Browser = 'Chrome'
                            Url = $reader['url']
                            Title = $reader['title']
                            VisitTime = [DateTime]::FromFileTimeUtc($reader['last_visit_time'] * 10)
                        }
                    }
                    $conn.Close()
                    Remove-Item $tempPath -Force -ErrorAction SilentlyContinue
                } catch { }
            }
            
            # Edge History
            $edgePath = "$env:LOCALAPPDATA\\Microsoft\\Edge\\User Data\\Default\\History"
            if (Test-Path $edgePath) {
                try {
                    $tempPath = "$env:TEMP\\edge_history_temp.db"
                    Copy-Item $edgePath $tempPath -Force -ErrorAction SilentlyContinue
                    $conn = New-Object System.Data.SQLite.SQLiteConnection("Data Source=$tempPath;Version=3;Read Only=True;")
                    $conn.Open()
                    $cmd = $conn.CreateCommand()
                    $cmd.CommandText = "SELECT url, title, last_visit_time FROM urls WHERE last_visit_time > $cutoffChrome ORDER BY last_visit_time DESC LIMIT 20"
                    $reader = $cmd.ExecuteReader()
                    while ($reader.Read()) {
                        $results += [PSCustomObject]@{
                            Browser = 'Edge'
                            Url = $reader['url']
                            Title = $reader['title']
                            VisitTime = [DateTime]::FromFileTimeUtc($reader['last_visit_time'] * 10)
                        }
                    }
                    $conn.Close()
                    Remove-Item $tempPath -Force -ErrorAction SilentlyContinue
                } catch { }
            }
            
            $results | ConvertTo-Json -Depth 2
        `;

        exec(`powershell -Command "${psCommand.replace(/\n/g, ' ')}"`, { timeout: 5000 }, (error, stdout, stderr) => {
            if (error || !stdout || stdout.trim() === '' || stdout.trim() === 'null') {
                resolve([]);
                return;
            }
            try {
                const parsed = JSON.parse(stdout);
                const history = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
                resolve(history.map(h => ({
                    url: h.Url,
                    title: h.Title,
                    browser: h.Browser,
                    visitTime: h.VisitTime,
                    timestamp: new Date().toISOString()
                })));
            } catch (e) {
                resolve([]);
            }
        });
    });
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
        if (!url || url.trim() === '') {
            url = extractUrlFromTitle(windowTitle, browserName);
        }

        const title = windowTitle || 'Unknown Page';

        // Skip if not a valid browsable page
        if (!isValidBrowsableUrl(url, title)) {
            return null;
        }

        // Create a key for deduplication
        const key = url || title;
        if (key === this.lastProcessedKey) {
            return null; // Already processed this
        }
        this.lastProcessedKey = key;

        // If we still don't have a URL, create a synthetic one from the title
        if (!url) {
            // Only create synthetic URL if we have a meaningful title
            if (title && title !== 'Unknown Page' && title.length > 3) {
                url = `https://page-from-title/${encodeURIComponent(title.substring(0, 100))}`;
            } else {
                return null;
            }
        }

        // Get category
        const category = categorizeUrl(url);

        // Track the visit
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

