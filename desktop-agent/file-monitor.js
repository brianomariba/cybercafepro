const chokidar = require('chokidar');
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
    const extLower = ext.toLowerCase();
    for (const [category, extensions] of Object.entries(FILE_CATEGORIES)) {
        if (extensions.includes(extLower)) {
            return category;
        }
    }
    return 'other';
}

// Get file size in human-readable format
function getFileSize(filePath) {
    try {
        const stats = fs.statSync(filePath);
        const bytes = stats.size;
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    } catch (e) {
        return 'Unknown';
    }
}

// Get file size in bytes
function getFileSizeBytes(filePath) {
    try {
        return fs.statSync(filePath).size;
    } catch (e) {
        return 0;
    }
}

class FileMonitor {
    constructor(onFileDetected) {
        this.watcher = null;
        this.onFileDetected = onFileDetected;
        this.trackedFiles = [];
        this.categorySummary = {};
    }

    start() {
        const homeDir = os.homedir();

        const directoriesToWatch = [
            path.join(homeDir, 'Documents'),
            path.join(homeDir, 'Downloads'),
            path.join(homeDir, 'Desktop'),
            path.join(homeDir, 'Pictures'),
            path.join(homeDir, 'Videos'),
            path.join(homeDir, 'Music')
        ];

        // Ensure directories exist before watching
        const existingDirs = directoriesToWatch.filter(dir => fs.existsSync(dir));

        console.log('File Monitor watching:', existingDirs.map(d => path.basename(d)).join(', '));

        // Reset category summary
        this.categorySummary = {
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

        this.watcher = chokidar.watch(existingDirs, {
            ignored: [
                /(^|[\/\\])\../, // Dotfiles
                '**/desktop.ini',
                '**/*.tmp',
                '**/*.temp',
                '**/Thumbs.db',
                '**/*.lnk', // Shortcuts
                '**/~$*' // Office temp files
            ],
            persistent: true,
            ignoreInitial: true,
            depth: 2, // Watch up to 2 levels deep
            awaitWriteFinish: {
                stabilityThreshold: 1000, // Wait for file to finish writing
                pollInterval: 100
            }
        });

        // Handle new files
        this.watcher.on('add', (filePath) => {
            this._processFile(filePath, 'created');
        });

        // Handle file changes (modifications)
        this.watcher.on('change', (filePath) => {
            this._processFile(filePath, 'modified');
        });

        // Handle file copies (also triggers 'add')
        // Handled by 'add' event
    }

    _processFile(filePath, action) {
        const ext = path.extname(filePath);
        const category = getFileCategory(ext);
        const sizeBytes = getFileSizeBytes(filePath);
        const sizeHuman = getFileSize(filePath);
        const folder = path.dirname(filePath).split(path.sep).pop();

        const fileInfo = {
            name: path.basename(filePath),
            path: filePath,
            folder: folder,
            extension: ext,
            category: category,
            size: sizeHuman,
            sizeBytes: sizeBytes,
            action: action,
            timestamp: new Date().toISOString()
        };

        // Add to tracked files
        this.trackedFiles.push(fileInfo);

        // Update category summary
        if (this.categorySummary[category]) {
            this.categorySummary[category].count++;
            this.categorySummary[category].totalSize += sizeBytes;
            this.categorySummary[category].files.push({
                name: fileInfo.name,
                size: fileInfo.size,
                folder: fileInfo.folder,
                timestamp: fileInfo.timestamp
            });
        }

        // Callback
        if (this.onFileDetected) {
            this.onFileDetected(fileInfo);
        }

        console.log(`[FILE] ${action}: ${fileInfo.name} (${category}, ${sizeHuman})`);
    }

    stop() {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }
    }

    getTrackedFiles() {
        return this.trackedFiles;
    }

    getCategorySummary() {
        // Format sizes for human readability
        const summary = {};
        for (const [cat, data] of Object.entries(this.categorySummary)) {
            summary[cat] = {
                count: data.count,
                totalSize: this._formatBytes(data.totalSize),
                totalSizeBytes: data.totalSize,
                files: data.files
            };
        }
        return summary;
    }

    getStats() {
        const totalFiles = this.trackedFiles.length;
        const totalSize = this.trackedFiles.reduce((sum, f) => sum + (f.sizeBytes || 0), 0);

        // Count by action
        const created = this.trackedFiles.filter(f => f.action === 'created').length;
        const modified = this.trackedFiles.filter(f => f.action === 'modified').length;

        // Count by category
        const byCategory = {};
        for (const file of this.trackedFiles) {
            byCategory[file.category] = (byCategory[file.category] || 0) + 1;
        }

        return {
            totalFiles,
            totalSize: this._formatBytes(totalSize),
            totalSizeBytes: totalSize,
            created,
            modified,
            byCategory
        };
    }

    _formatBytes(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }

    reset() {
        this.trackedFiles = [];
        this.categorySummary = {
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
}

module.exports = FileMonitor;
