/**
 * HawkNine Offline Data Store
 * Handles caching of data for offline use and syncing when back online
 */

const fs = require('fs');
const path = require('path');

class OfflineStore {
    constructor(storeDir = __dirname, legacyStoreDir = __dirname) {
        this.storeDir = storeDir;
        this.legacyStoreDir = legacyStoreDir;
        this.storeFile = path.join(this.storeDir, '.offline-store.json');
        this.pendingActionsFile = path.join(this.storeDir, '.pending-actions.json');
        this.spoolerCacheFile = path.join(this.storeDir, '.spooler-cache.json');
        this.printJobsFile = path.join(this.storeDir, '.print-jobs-log.json');
        this.data = {
            inventory: [],
            services: [],
            templates: [],
            guides: [],
            submissions: [],
            settings: {},
            lastSync: null
        };
        this.pendingActions = [];
        this.ensureStoreDir();
        this.migrateLegacyFiles();
        this.loadFromDisk();
    }

    ensureStoreDir() {
        try {
            if (!fs.existsSync(this.storeDir)) {
                fs.mkdirSync(this.storeDir, { recursive: true });
            }
        } catch (e) {
            console.error('[OfflineStore] Failed to create store directory:', e.message);
        }
    }

    migrateLegacyFiles() {
        if (!this.legacyStoreDir || path.resolve(this.legacyStoreDir) === path.resolve(this.storeDir)) {
            return;
        }

        const migrations = [
            { from: path.join(this.legacyStoreDir, '.offline-store.json'), to: this.storeFile },
            { from: path.join(this.legacyStoreDir, '.pending-actions.json'), to: this.pendingActionsFile },
            { from: path.join(this.legacyStoreDir, '.spooler-cache.json'), to: this.spoolerCacheFile },
            { from: path.join(this.legacyStoreDir, '.print-jobs-log.json'), to: this.printJobsFile }
        ];

        for (const file of migrations) {
            try {
                if (!fs.existsSync(file.to) && fs.existsSync(file.from)) {
                    fs.copyFileSync(file.from, file.to);
                    console.log(`[OfflineStore] Migrated ${path.basename(file.from)} to ${this.storeDir}`);
                }
            } catch (e) {
                console.warn(`[OfflineStore] Failed to migrate ${path.basename(file.from)}:`, e.message);
            }
        }
    }

    /**
     * Load cached data from disk
     */
    loadFromDisk() {
        try {
            if (fs.existsSync(this.storeFile)) {
                const raw = fs.readFileSync(this.storeFile, 'utf8');
                this.data = JSON.parse(raw);
                console.log('[OfflineStore] Loaded cached data from disk');
            }
        } catch (e) {
            console.error('[OfflineStore] Failed to load cached data:', e.message);
        }

        try {
            if (fs.existsSync(this.pendingActionsFile)) {
                const raw = fs.readFileSync(this.pendingActionsFile, 'utf8');
                this.pendingActions = JSON.parse(raw);
                console.log(`[OfflineStore] Loaded ${this.pendingActions.length} pending action(s)`);
            }
        } catch (e) {
            console.error('[OfflineStore] Failed to load pending actions:', e.message);
        }
    }

    /**
     * Save data to disk
     */
    saveToDisk() {
        try {
            fs.writeFileSync(this.storeFile, JSON.stringify(this.data, null, 2));
        } catch (e) {
            console.error('[OfflineStore] Failed to save data:', e.message);
        }

        try {
            fs.writeFileSync(this.pendingActionsFile, JSON.stringify(this.pendingActions, null, 2));
        } catch (e) {
            console.error('[OfflineStore] Failed to save pending actions:', e.message);
        }
    }

    /**
     * Update inventory cache
     */
    setInventory(items) {
        this.data.inventory = items;
        this.data.lastSync = new Date().toISOString();
        this.saveToDisk();
        console.log(`[OfflineStore] Cached ${items.length} inventory items`);
    }

    /**
     * Get cached inventory
     */
    getInventory() {
        return this.data.inventory || [];
    }

    /**
     * Update services cache
     */
    setServices(services) {
        this.data.services = services;
        this.saveToDisk();
        console.log(`[OfflineStore] Cached ${services.length} services`);
    }

    /**
     * Get cached services
     */
    getServices() {
        return this.data.services || [];
    }

    /**
     * Update templates cache
     */
    setTemplates(templates) {
        this.data.templates = templates;
        this.saveToDisk();
        console.log(`[OfflineStore] Cached ${templates.length} templates`);
    }

    /**
     * Get cached templates
     */
    getTemplates() {
        return this.data.templates || [];
    }

    /**
     * Update guides cache
     */
    setGuides(guides) {
        this.data.guides = guides;
        this.saveToDisk();
        console.log(`[OfflineStore] Cached ${guides.length} guides`);
    }

    /**
     * Get cached guides
     */
    getGuides() {
        return this.data.guides || [];
    }

    /**
     * Update submissions cache
     */
    setSubmissions(submissions) {
        this.data.submissions = submissions;
        this.saveToDisk();
        console.log(`[OfflineStore] Cached ${submissions.length} submissions`);
    }

    /**
     * Get cached submissions
     */
    getSubmissions() {
        return this.data.submissions || [];
    }

    /**
     * Update settings cache
     */
    setSettings(settings) {
        this.data.settings = { ...this.data.settings, ...settings };
        this.saveToDisk();
    }

    /**
     * Get cached settings
     */
    getSettings() {
        return this.data.settings || {};
    }

    /**
     * Get last sync timestamp
     */
    getLastSync() {
        return this.data.lastSync;
    }

    /**
     * Add a pending action (to be synced when online)
     * @param {string} type - Action type (e.g., 'SELL_ITEM')
     * @param {object} payload - Action data
     */
    addPendingAction(type, payload) {
        const action = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type,
            payload,
            createdAt: new Date().toISOString(),
            attempts: 0
        };
        this.pendingActions.push(action);
        this.saveToDisk();
        console.log(`[OfflineStore] Queued pending action: ${type}`);
        return action;
    }

    /**
     * Get all pending actions
     */
    getPendingActions() {
        return this.pendingActions;
    }

    /**
     * Remove a pending action (after successful sync)
     */
    removePendingAction(actionId) {
        this.pendingActions = this.pendingActions.filter(a => a.id !== actionId);
        this.saveToDisk();
    }

    /**
     * Update pending action attempts
     */
    updatePendingAction(actionId, updates) {
        const action = this.pendingActions.find(a => a.id === actionId);
        if (action) {
            Object.assign(action, updates);
            this.saveToDisk();
        }
    }

    /**
     * Decrement local inventory stock (for offline sales)
     */
    decrementLocalStock(itemId, quantity = 1) {
        const item = this.data.inventory.find(i => i._id === itemId);
        if (item && item.stock >= quantity) {
            item.stock -= quantity;
            this.saveToDisk();
            return true;
        }
        return false;
    }

    /**
     * Clear all cached data
     */
    clearCache() {
        this.data = {
            inventory: [],
            services: [],
            templates: [],
            guides: [],
            settings: {},
            lastSync: null
        };
        this.saveToDisk();
    }

    /**
     * Add a public document notification
     */
    addPublicDocument(doc) {
        if (!this.data.publicDocuments) this.data.publicDocuments = [];
        // Add to beginning
        this.data.publicDocuments.unshift(doc);
        // Keep only last 50
        if (this.data.publicDocuments.length > 50) {
            this.data.publicDocuments = this.data.publicDocuments.slice(0, 50);
        }
        this.saveToDisk();
    }

    /**
     * Get public documents
     */
    getPublicDocuments() {
        return this.data.publicDocuments || [];
    }

    /**
     * Mark a file as downloaded (update status)
     * Do NOT remove it, as we want history.
     */
    markFileDownloaded(orderId, filename) {
        if (!this.data.publicDocuments) return [];

        const docIndex = this.data.publicDocuments.findIndex(d => d.orderId === orderId);
        if (docIndex === -1) return this.data.publicDocuments;

        const doc = this.data.publicDocuments[docIndex];
        const file = doc.files.find(f => (f.originalName || f.filename) === filename);

        if (file) {
            file.downloaded = true;
            file.downloadedAt = new Date().toISOString();
            this.saveToDisk();
        }

        return this.data.publicDocuments;
    }

    /**
     * Get cache age in minutes
     */
    getCacheAgeMinutes() {
        if (!this.data.lastSync) return Infinity;
        const syncTime = new Date(this.data.lastSync).getTime();
        const now = Date.now();
        return Math.round((now - syncTime) / (1000 * 60));
    }

    // ==================== SPOOLER CACHE PERSISTENCE ====================
    // The in-memory spoolerPageCache holds per-job DEVMODE data that is
    // ONLY available while the job is in the spooler. If the app crashes
    // or restarts before Event Log 307 fires, this data is lost forever.
    // These methods persist the cache to disk for recovery.

    /**
     * Save the current spooler cache Map to disk.
     * @param {Map} spoolerCache - Map of jobKey -> cached DEVMODE data
     */
    saveSpoolerCache(spoolerCache) {
        try {
            const entries = Array.from(spoolerCache.entries());
            // Only save entries from the last 10 minutes (same as in-memory TTL)
            const cutoff = Date.now() - 600000;
            const recent = entries.filter(([, v]) => (v.cachedAt || 0) > cutoff);
            fs.writeFileSync(this.spoolerCacheFile, JSON.stringify(recent), 'utf8');
        } catch (e) {
            // Silent â€” this is best-effort persistence
        }
    }

    /**
     * Load persisted spooler cache from disk.
     * @returns {Map} Map of jobKey -> cached DEVMODE data
     */
    loadSpoolerCache() {
        try {
            if (!fs.existsSync(this.spoolerCacheFile)) return new Map();
            const raw = fs.readFileSync(this.spoolerCacheFile, 'utf8');
            const entries = JSON.parse(raw);
            if (!Array.isArray(entries)) return new Map();
            // Filter out expired entries
            const cutoff = Date.now() - 600000;
            const valid = entries.filter(([, v]) => (v.cachedAt || 0) > cutoff);
            if (valid.length > 0) {
                console.log(`[OfflineStore] Recovered ${valid.length} spooler cache entries from disk.`);
            }
            return new Map(valid);
        } catch (e) {
            return new Map();
        }
    }

    // ==================== PRINT JOB LOG ====================
    // Local log of all captured print jobs. Used for:
    //   1. Offline auditing â€” admin can see what was printed even if server was down
    //   2. Deduplication â€” on reconnect, we can check what was already sent
    //   3. Billing recovery â€” if DataQueue entries are lost, this log has the data

    /**
     * Add a print job to the local log.
     * @param {object} printData - The print payload data object
     */
    addPrintJob(printData) {
        try {
            let jobs = this._loadPrintJobs();
            // Dedup by jobId
            if (printData.jobId) {
                const existIdx = jobs.findIndex(j => j.jobId === printData.jobId);
                if (existIdx >= 0) {
                    // Update with potentially better data
                    jobs[existIdx] = { ...jobs[existIdx], ...printData, updatedAt: new Date().toISOString() };
                } else {
                    jobs.push({ ...printData, loggedAt: new Date().toISOString() });
                }
            } else {
                jobs.push({ ...printData, loggedAt: new Date().toISOString() });
            }
            // Keep last 200 jobs
            if (jobs.length > 200) jobs = jobs.slice(-200);
            fs.writeFileSync(this.printJobsFile, JSON.stringify(jobs), 'utf8');
        } catch (e) {
            console.error('[OfflineStore] Failed to log print job:', e.message);
        }
    }

    /**
     * Get all locally logged print jobs.
     * @returns {Array} Array of print job objects
     */
    getPrintJobs() {
        return this._loadPrintJobs();
    }

    /**
     * Clear the local print jobs log.
     */
    clearPrintJobs() {
        try {
            fs.writeFileSync(this.printJobsFile, '[]', 'utf8');
        } catch (e) { /* silent */ }
    }

    /**
     * @private Load print jobs from disk.
     */
    _loadPrintJobs() {
        try {
            if (!fs.existsSync(this.printJobsFile)) return [];
            const raw = fs.readFileSync(this.printJobsFile, 'utf8');
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }
}

module.exports = OfflineStore;

