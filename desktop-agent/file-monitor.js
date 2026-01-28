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
        return {
            documents: { count: 0, totalSize: 0, files: [] },
            spreadsheets: { count: 0, totalSize: 0, files: [] },
            presentations: { count: 0, totalSize: 0, files: [] },
            images: { count: 0, totalSize: 0, files: [] },
            videos: { count: 0, totalSize: 0, files: [] },
            audio: { count: 0, totalSize: 0, files: [] },
            archives: { count: 0, totalSize: 0, files: [] },
            code: { count: 0, totalSize: 0, files: [] },
            executables: { count: 0, totalSize: 0, files: [] },
            other: { count: 0, totalSize: 0, files: [] }
        };
    }

    start() {
        const homeDir = os.homedir();
        const directoriesToWatch = [
            path.join(homeDir, 'Documents'),
            path.join(homeDir, 'Downloads'),
            path.join(homeDir, 'Desktop'),
            path.join(homeDir, 'Pictures'),
            path.join(homeDir, 'Videos')
        ];

        this.categorySummary = this._getEmptySummary();

        directoriesToWatch.forEach(dir => {
            if (fs.existsSync(dir)) {
                try {
                    // Windows supports recursive: true which is very efficient
                    const watcher = fs.watch(dir, { recursive: true }, (eventType, filename) => {
                        if (filename) {
                            this._handleEvent(dir, eventType, filename);
                        }
                    });
                    this.watchers.push(watcher);
                    console.log(`Watching: ${dir}`);
                } catch (e) {
                    console.error(`Failed to watch ${dir}:`, e.message);
                }
            }
        });
    }

    _handleEvent(rootDir, eventType, filename) {
        const filePath = path.join(rootDir, filename);

        // Basic filtering
        if (this.ignoredPatterns.some(pattern => pattern.test(filename))) return;

        // We only care about certain events for the agent report
        // Note: fs.watch 'rename' is used for both creation and deletion
        try {
            if (!fs.existsSync(filePath)) return; // Probably deleted or temp file gone

            const stats = fs.statSync(filePath);
            if (stats.isDirectory()) return;

            const ext = path.extname(filename);
            const category = getFileCategory(ext);

            const fileInfo = {
                name: filename,
                path: filePath,
                folder: path.basename(path.dirname(filePath)),
                extension: ext,
                category: category,
                size: formatBytes(stats.size),
                sizeBytes: stats.size,
                action: eventType === 'rename' ? 'created' : 'modified',
                timestamp: new Date().toISOString()
            };

            // Avoid reporting the same file modification too many times in a row
            const lastFile = this.trackedFiles[this.trackedFiles.length - 1];
            if (lastFile && lastFile.path === filePath && (Date.now() - new Date(lastFile.timestamp) < 2000)) {
                return;
            }

            this.trackedFiles.push(fileInfo);

            if (this.categorySummary[category]) {
                this.categorySummary[category].count++;
                this.categorySummary[category].totalSize += stats.size;
                this.categorySummary[category].files.push({
                    name: fileInfo.name,
                    size: fileInfo.size,
                    timestamp: fileInfo.timestamp
                });
            }

            if (this.onFileDetected) {
                this.onFileDetected(fileInfo);
            }
        } catch (e) {
            // File might have been moved/deleted between events
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
        const summary = {};
        for (const [cat, data] of Object.entries(this.categorySummary)) {
            summary[cat] = {
                count: data.count,
                totalSize: formatBytes(data.totalSize),
                totalSizeBytes: data.totalSize,
                files: data.files.slice(-5) // Only last 5 for summary
            };
        }
        return summary;
    }

    getStats() {
        const totalSize = this.trackedFiles.reduce((sum, f) => sum + (f.sizeBytes || 0), 0);
        return {
            totalFiles: this.trackedFiles.length,
            totalSize: formatBytes(totalSize),
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
