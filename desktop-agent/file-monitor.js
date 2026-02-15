const path = require('path');
const os = require('os');
const fs = require('fs');

// File type categories
const FILE_CATEGORIES = {
    documents: ['.doc', '.docx', '.pdf', '.txt', '.rtf', '.odt', '.pages'],
    spreadsheets: ['.xls', '.xlsx', '.csv', '.ods', '.numbers'],
    presentations: ['.ppt', '.pptx', '.key', '.odp'],
    images: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.ico', '.tiff'],
    videos: ['.mp4', '.avi', '.mov', '.wmv', '.mkv', '.flv', '.webm'],
    audio: ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma', '.m4a'],
    archives: ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2'],
    code: ['.js', '.py', '.java', '.cpp', '.c', '.html', '.css', '.json', '.xml'],
    executables: ['.exe', '.msi', '.bat', '.cmd', '.ps1', '.sh'],
    other: []
};

// Get category for a file extension
function getFileCategory(ext) {
    const extLower = (ext || '').toLowerCase();
    for (const [category, extensions] of Object.entries(FILE_CATEGORIES)) {
        if (extensions.includes(extLower)) {
            return category;
        }
    }
    return 'other';
}

// Format bytes to human readable
function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

class FileMonitor {
    constructor(onFileDetected) {
        this.watchers = [];
        this.onFileDetected = onFileDetected;
        this.trackedFiles = [];
        this.categorySummary = this._getEmptySummary();
        this.ignoredPatterns = [
            /(^|[\/\\])\../, // Dotfiles
            /desktop\.ini$/i,
            /\.tmp$/i,
            /\.temp$/i,
            /Thumbs\.db$/i,
            /\.lnk$/i,
            /~$/ // Office temp files
        ];
    }

    _getEmptySummary() {
        // Initialize all categories with empty stats
        const categories = [
            'documents', 'spreadsheets', 'presentations', 'images',
            'videos', 'audio', 'archives', 'code', 'executables', 'other'
        ];
        const summary = {};
        categories.forEach(cat => {
            summary[cat] = { count: 0, totalSize: 0, files: [] };
        });
        return summary;
    }

    start() {
        const homeDir = os.homedir();
        // Watch common user directories
        const directoriesToWatch = [
            path.join(homeDir, 'Documents'),
            path.join(homeDir, 'Downloads'),
            path.join(homeDir, 'Desktop'),
            path.join(homeDir, 'Pictures'),
            path.join(homeDir, 'Videos'),
            path.join(homeDir, 'Music')
        ];

        // Reset summary on start
        this.categorySummary = this._getEmptySummary();
        this.watchers = [];

        directoriesToWatch.forEach(dir => {
            if (fs.existsSync(dir)) {
                try {
                    // Windows: recursive true is efficient
                    const watcher = fs.watch(dir, { recursive: true }, (eventType, filename) => {
                        if (filename) {
                            // fs.watch returns filename relative to the watched dir
                            this._handleEvent(dir, eventType, filename);
                        }
                    });
                    this.watchers.push(watcher);
                    console.log(`[FILE] Watching: ${dir}`);
                } catch (e) {
                    // Directory might be locked or not accessible
                }
            }
        });
    }

    _handleEvent(rootDir, eventType, filename) {
        // Debounce simplistic check
        const filePath = path.join(rootDir, filename);

        // Filter ignored patterns
        if (this.ignoredPatterns.some(pattern => pattern.test(filename))) return;

        try {
            // Check existence (file might be deleted immediately after creation)
            if (!fs.existsSync(filePath)) return;

            const stats = fs.statSync(filePath);
            if (stats.isDirectory()) return;

            const ext = path.extname(filename);
            const category = getFileCategory(ext);

            // Avoid duplicate events for same file within short window
            const lastFile = this.trackedFiles[this.trackedFiles.length - 1];
            if (lastFile && lastFile.path === filePath && (Date.now() - new Date(lastFile.timestamp).getTime() < 1000)) {
                return;
            }

            const fileInfo = {
                name: path.basename(filename),
                path: filePath,
                folder: path.basename(path.dirname(filePath)), // Immediate parent folder
                rootFolder: path.basename(rootDir), // Watched root
                extension: ext,
                category: category,
                size: formatBytes(stats.size),
                sizeBytes: stats.size,
                action: eventType === 'rename' ? 'created' : 'modified',
                timestamp: new Date().toISOString()
            };

            this.trackedFiles.push(fileInfo);

            // Update category summary
            if (this.categorySummary[category]) {
                this.categorySummary[category].count++;
                this.categorySummary[category].totalSize += stats.size;
                // Keep track of recent files in this category
                this.categorySummary[category].files.push({
                    name: fileInfo.name,
                    size: fileInfo.size,
                    timestamp: fileInfo.timestamp,
                    action: fileInfo.action
                });
            }

            // Real-time callback
            if (this.onFileDetected) {
                this.onFileDetected(fileInfo);
            }

        } catch (e) {
            // Ignore errors (file access, permission, etc)
        }
    }

    stop() {
        this.watchers.forEach(w => w.close());
        this.watchers = [];
    }

    getTrackedFiles() {
        return this.trackedFiles;
    }

    getCategorySummary() {
        const result = {};
        for (const [cat, data] of Object.entries(this.categorySummary)) {
            // Only include categories that have activity
            if (data.count > 0) {
                result[cat] = {
                    count: data.count,
                    totalSize: formatBytes(data.totalSize),
                    totalSizeBytes: data.totalSize,
                    recentFiles: data.files.slice(-10).reverse() // Last 10 files, newest first
                };
            }
        }
        return result;
    }

    getStats() {
        const totalBytes = this.trackedFiles.reduce((sum, f) => sum + (f.sizeBytes || 0), 0);
        return {
            totalFiles: this.trackedFiles.length,
            totalSize: formatBytes(totalBytes),
            totalSizeBytes: totalSize,
            created: this.trackedFiles.filter(f => f.action === 'created').length,
            modified: this.trackedFiles.filter(f => f.action === 'modified').length
        };
    }

    reset() {
        this.trackedFiles = [];
        this.categorySummary = this._getEmptySummary();
    }
}

module.exports = FileMonitor;
