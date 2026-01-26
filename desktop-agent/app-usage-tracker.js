/**
 * Tracks application usage time during a session
 */
class AppUsageTracker {
    constructor() {
        this.usageMap = {}; // { appName: { totalSeconds: 0, lastSeen: Date } }
        this.lastApp = null;
        this.lastCheck = null;
    }

    /**
     * Record a tick for the currently active application
     * @param {string} appName - The owner name of the active window
     * @param {string} windowTitle - The title of the window
     */
    tick(appName, windowTitle) {
        const now = Date.now();

        if (!appName) return;

        // Initialize entry if first time seeing this app
        if (!this.usageMap[appName]) {
            this.usageMap[appName] = {
                totalSeconds: 0,
                lastSeen: now,
                windows: new Set()
            };
        }

        // Calculate time since last tick (if same app was active)
        if (this.lastApp === appName && this.lastCheck) {
            const elapsed = (now - this.lastCheck) / 1000;
            // Only count reasonable intervals (< 60 seconds) to avoid counting idle time
            if (elapsed > 0 && elapsed < 60) {
                this.usageMap[appName].totalSeconds += elapsed;
            }
        }

        // Track unique window titles
        if (windowTitle) {
            this.usageMap[appName].windows.add(windowTitle);
        }

        this.usageMap[appName].lastSeen = now;
        this.lastApp = appName;
        this.lastCheck = now;
    }

    /**
     * Get usage summary for reporting
     */
    getSummary() {
        const summary = [];
        for (const [app, data] of Object.entries(this.usageMap)) {
            summary.push({
                application: app,
                usageMinutes: Math.round(data.totalSeconds / 60),
                usageSeconds: Math.round(data.totalSeconds),
                uniqueWindows: data.windows ? data.windows.size : 0
            });
        }
        // Sort by usage time descending
        return summary.sort((a, b) => b.usageSeconds - a.usageSeconds);
    }

    /**
     * Reset tracking (call on session start)
     */
    reset() {
        this.usageMap = {};
        this.lastApp = null;
        this.lastCheck = null;
    }
}

module.exports = AppUsageTracker;
