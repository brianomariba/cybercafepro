const fs = require('fs');
const path = require('path');
const axios = require('axios');

const MAX_QUEUE_SIZE = 500; // Increased from 100: print data is small, we need durability
const MAX_RETRY_ATTEMPTS = 20; // Increased from 5: give more time for server recovery
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // Discard data older than 24 hours

class DataQueue {
    constructor(storeDir = __dirname, legacyStoreDir = __dirname) {
        this.storeDir = storeDir;
        this.legacyStoreDir = legacyStoreDir;
        this.queueFile = path.join(this.storeDir, 'data-queue.json');
        this.queueBackupFile = path.join(this.storeDir, 'data-queue.backup.json');
        this.queue = [];
        this.isProcessing = false;

        this.ensureStoreDir();
        this.migrateLegacyFiles();
        this.loadQueue();
    }

    ensureStoreDir() {
        try {
            if (!fs.existsSync(this.storeDir)) {
                fs.mkdirSync(this.storeDir, { recursive: true });
            }
        } catch (e) {
            console.error(`[DataQueue] Failed to create store directory ${this.storeDir}:`, e.message);
        }
    }

    migrateLegacyFiles() {
        if (!this.legacyStoreDir || path.resolve(this.legacyStoreDir) === path.resolve(this.storeDir)) {
            return;
        }

        const migrations = [
            { from: path.join(this.legacyStoreDir, 'data-queue.json'), to: this.queueFile },
            { from: path.join(this.legacyStoreDir, 'data-queue.backup.json'), to: this.queueBackupFile }
        ];

        for (const file of migrations) {
            try {
                if (!fs.existsSync(file.to) && fs.existsSync(file.from)) {
                    fs.copyFileSync(file.from, file.to);
                    console.log(`[DataQueue] Migrated ${path.basename(file.from)} to ${this.storeDir}`);
                }
            } catch (e) {
                console.warn(`[DataQueue] Failed to migrate ${path.basename(file.from)}:`, e.message);
            }
        }
    }

    /**
     * Load queue from disk with corruption recovery.
     * If the main file is corrupted, tries the backup.
     */
    loadQueue() {
        this.queue = this._tryLoadFile(this.queueFile);
        if (this.queue === null) {
            console.warn('[DataQueue] Main queue file corrupted, trying backup...');
            this.queue = this._tryLoadFile(this.queueBackupFile);
            if (this.queue === null) {
                console.error('[DataQueue] Both queue files corrupted. Starting fresh.');
                this.queue = [];
            } else {
                console.log(`[DataQueue] Recovered ${this.queue.length} items from backup.`);
                // Immediately save recovered data to main file
                this._atomicWrite(this.queueFile, this.queue);
            }
        } else {
            if (this.queue.length > 0) {
                console.log(`[DataQueue] Loaded ${this.queue.length} queued items from disk.`);
            }
        }

        // Clean up expired entries on load
        this._pruneExpired();
    }

    /**
     * Try to load and parse a JSON array from a file.
     * Returns the parsed array, or null if the file is missing/corrupted.
     */
    _tryLoadFile(filePath) {
        try {
            if (!fs.existsSync(filePath)) return [];
            const raw = fs.readFileSync(filePath, 'utf8').trim();
            if (!raw || raw === '[]') return [];

            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                console.warn(`[DataQueue] ${filePath} is not an array, discarding.`);
                return null;
            }
            return parsed;
        } catch (e) {
            console.error(`[DataQueue] Failed to parse ${filePath}:`, e.message);
            return null;
        }
    }

    /**
     * Atomic write: write to a temp file first, then rename.
     * This prevents corruption if the process crashes mid-write.
     */
    _atomicWrite(filePath, data) {
        const tmpFile = filePath + '.tmp';
        try {
            const json = JSON.stringify(data);
            fs.writeFileSync(tmpFile, json, 'utf8');
            // Rename is atomic on most filesystems
            fs.renameSync(tmpFile, filePath);
        } catch (e) {
            console.error(`[DataQueue] Atomic write failed for ${filePath}:`, e.message);
            // Fallback: try direct write
            try {
                fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
            } catch (e2) {
                console.error(`[DataQueue] Direct write also failed:`, e2.message);
            }
            // Clean up temp file
            try { fs.unlinkSync(tmpFile); } catch (_) { }
        }
    }

    /**
     * Remove entries older than MAX_AGE_MS
     */
    _pruneExpired() {
        const now = Date.now();
        const before = this.queue.length;
        this.queue = this.queue.filter(item => {
            if (!item.timestamp) return true; // Keep items without timestamp
            const age = now - new Date(item.timestamp).getTime();
            return age < MAX_AGE_MS;
        });
        const removed = before - this.queue.length;
        if (removed > 0) {
            console.log(`[DataQueue] Pruned ${removed} expired entries (older than 24h).`);
            this.saveQueue();
        }
    }

    /**
     * Save queue to disk with backup.
     */
    saveQueue() {
        const data = this.queue.slice(-MAX_QUEUE_SIZE);
        // Write backup first, then main
        this._atomicWrite(this.queueBackupFile, data);
        this._atomicWrite(this.queueFile, data);
    }

    /**
     * Add an item to the retry queue.
     * Deduplicates print jobs by checking for existing entries with the same jobId.
     */
    enqueue(url, data) {
        // Dedup: if this is a print log, check if the same print job is already queued
        if (data && data.type === 'print' && data.data && data.data.jobId) {
            const existingIdx = this.queue.findIndex(
                item => item.data && item.data.type === 'print' &&
                    item.data.data && item.data.data.jobId === data.data.jobId
            );
            if (existingIdx >= 0) {
                // Replace with newer data (might have better page count from cache merge)
                this.queue[existingIdx] = { url, data, timestamp: new Date().toISOString(), attempts: 0 };
                this.saveQueue();
                console.log(`[DataQueue] Updated existing print job in queue: ${data.data.jobId}`);
                return;
            }
        }

        this.queue.push({ url, data, timestamp: new Date().toISOString(), attempts: 0 });
        if (this.queue.length > MAX_QUEUE_SIZE) {
            // Remove oldest NON-print items first, then oldest print items
            const nonPrintIdx = this.queue.findIndex(item => !item.data || item.data.type !== 'print');
            if (nonPrintIdx >= 0) {
                this.queue.splice(nonPrintIdx, 1);
            } else {
                this.queue.shift(); // All items are print, remove oldest
            }
        }
        this.saveQueue();
        console.log(`[DataQueue] Queued item (${data?.type || 'unknown'}) - queue size: ${this.queue.length}`);
    }

    /**
     * Process the queue: retry sending all queued items.
     * Stops on first failure to avoid hammering a down server.
     */
    async processQueue() {
        if (this.isProcessing || this.queue.length === 0) return;

        this.isProcessing = true;
        let successCount = 0;
        let failedOnce = false;

        // Process in order (oldest first)
        const itemsToProcess = [...this.queue];

        for (const item of itemsToProcess) {
            if (failedOnce) break; // Stop on first failure

            try {
                await axios.post(item.url, item.data, { timeout: 10000 });
                // Remove successful item from queue
                const idx = this.queue.indexOf(item);
                if (idx >= 0) this.queue.splice(idx, 1);
                successCount++;
            } catch (e) {
                item.attempts = (item.attempts || 0) + 1;

                if (item.attempts >= MAX_RETRY_ATTEMPTS) {
                    // Too many failures - discard
                    const idx = this.queue.indexOf(item);
                    if (idx >= 0) this.queue.splice(idx, 1);
                    console.log(`[DataQueue] Discarded item after ${item.attempts} failed attempts (${item.data?.type || 'unknown'}).`);
                } else {
                    failedOnce = true; // Stop retrying
                }
            }
        }

        if (successCount > 0) {
            console.log(`[DataQueue] Synced ${successCount} queued items. Remaining: ${this.queue.length}`);
        }

        this.saveQueue();
        this.isProcessing = false;
    }

    getQueueLength() {
        return this.queue.length;
    }

    /**
     * Get count of print-type items in the queue (for UI display).
     */
    getPrintQueueLength() {
        return this.queue.filter(item => item.data && item.data.type === 'print').length;
    }
}

module.exports = DataQueue;
