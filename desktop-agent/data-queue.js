const fs = require('fs');
const path = require('path');
const axios = require('axios');

const QUEUE_FILE = path.join(__dirname, 'data-queue.json');
const MAX_QUEUE_SIZE = 100; // Limit stored items to prevent disk bloat

class DataQueue {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
        this.loadQueue();
    }

    loadQueue() {
        try {
            if (fs.existsSync(QUEUE_FILE)) {
                const data = fs.readFileSync(QUEUE_FILE, 'utf8');
                this.queue = JSON.parse(data);
                console.log(`Loaded ${this.queue.length} queued items from disk.`);
            }
        } catch (e) {
            console.error('Failed to load queue:', e.message);
            this.queue = [];
        }
    }

    saveQueue() {
        try {
            fs.writeFileSync(QUEUE_FILE, JSON.stringify(this.queue.slice(-MAX_QUEUE_SIZE)), 'utf8');
        } catch (e) {
            console.error('Failed to save queue:', e.message);
        }
    }

    enqueue(url, data) {
        this.queue.push({ url, data, timestamp: new Date().toISOString(), attempts: 0 });
        if (this.queue.length > MAX_QUEUE_SIZE) {
            this.queue.shift(); // Remove oldest if over limit
        }
        this.saveQueue();
    }

    async processQueue() {
        if (this.isProcessing || this.queue.length === 0) return;

        this.isProcessing = true;

        const itemsToRetry = [...this.queue];
        const successfulItems = [];

        for (const item of itemsToRetry) {
            try {
                await axios.post(item.url, item.data, { timeout: 10000 });
                successfulItems.push(item);
            } catch (e) {
                item.attempts++;
                if (item.attempts >= 5) {
                    // Too many failures, discard this item
                    successfulItems.push(item);
                    console.log(`Discarding item after ${item.attempts} failed attempts.`);
                }
                // Stop retrying on first failure to avoid hammering a down server
                break;
            }
        }

        // Remove successful items from queue
        this.queue = this.queue.filter(item => !successfulItems.includes(item));
        this.saveQueue();
        this.isProcessing = false;
    }

    getQueueLength() {
        return this.queue.length;
    }
}

module.exports = DataQueue;
