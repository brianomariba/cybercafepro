/**
 * HawkNine Offline Data Store
 * Handles caching of data for offline use and syncing when back online
 */

const fs = require('fs');
const path = require('path');

class OfflineStore {
    constructor(storeDir = __dirname) {
        this.storeFile = path.join(storeDir, '.offline-store.json');
        this.pendingActionsFile = path.join(storeDir, '.pending-actions.json');
        this.data = {
            inventory: [],
            services: [],
            templates: [],
            templates: [],
            guides: [],
            submissions: [],
            settings: {},
            lastSync: null
        };
        this.pendingActions = [];
        this.loadFromDisk();
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
     * Mark a file as downloaded (remove it from the list)
     * If all files in a request are downloaded, remove the request
     */
    markFileDownloaded(orderId, filename) {
        if (!this.data.publicDocuments) return [];

        const docIndex = this.data.publicDocuments.findIndex(d => d.orderId === orderId);
        if (docIndex === -1) return this.data.publicDocuments;

        const doc = this.data.publicDocuments[docIndex];

        // Remove the specific file
        doc.files = doc.files.filter(f => (f.originalName || f.filename) !== filename);

        // If no files left, remove the document request
        if (doc.files.length === 0) {
            this.data.publicDocuments.splice(docIndex, 1);
        }

        this.saveToDisk();
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
}

module.exports = OfflineStore;
