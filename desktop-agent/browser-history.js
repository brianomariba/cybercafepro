/**
 * Browser History Tracking
 * Uses live URL tracking from active window detection
 */

/**
 * Live URL tracking from active window
 * Works reliably without needing browser database access
 */
class LiveUrlTracker {
    constructor() {
        this.visitedUrls = [];
        this.urlVisitCounts = new Map();
    }

    addUrl(url, title) {
        if (!url || url.startsWith('file://') || url === '' || url === 'about:blank') return;

        // Normalize URL (remove trailing slash, query params for grouping)
        const normalizedUrl = url.split('?')[0].replace(/\/$/, '');

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
            // Invalid URL
        }
    }

    getHistory() {
        return this.visitedUrls.slice(-100); // Last 100 entries
    }

    getTopDomains(limit = 10) {
        const sorted = [...this.urlVisitCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit);
        return sorted.map(([domain, count]) => ({ domain, visits: count }));
    }

    reset() {
        this.visitedUrls = [];
        this.urlVisitCounts.clear();
    }

    getStats() {
        return {
            totalUrls: this.visitedUrls.length,
            uniqueDomains: this.urlVisitCounts.size,
            totalPageViews: [...this.urlVisitCounts.values()].reduce((a, b) => a + b, 0)
        };
    }
}

module.exports = { LiveUrlTracker };
