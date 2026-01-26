# HawkNine Desktop Agent - File Monitoring Documentation

## Overview

The Desktop Agent monitors all file activity on the client PC during active sessions. Files are automatically categorized by type and reported to the admin dashboard.

---

## Monitored Directories

The agent watches the following user folders:
- `Documents`
- `Downloads`
- `Desktop`
- `Pictures`
- `Videos`
- `Music`

---

## File Categories

Files are automatically categorized into the following groups:

| Category | Extensions |
|----------|-----------|
| **Documents** | .doc, .docx, .pdf, .txt, .rtf, .odt, .pages |
| **Spreadsheets** | .xls, .xlsx, .csv, .ods, .numbers |
| **Presentations** | .ppt, .pptx, .key, .odp |
| **Images** | .jpg, .jpeg, .png, .gif, .bmp, .svg, .webp, .ico, .tiff |
| **Videos** | .mp4, .avi, .mov, .wmv, .mkv, .flv, .webm |
| **Audio** | .mp3, .wav, .flac, .aac, .ogg, .wma, .m4a |
| **Archives** | .zip, .rar, .7z, .tar, .gz, .bz2 |
| **Code** | .js, .py, .java, .cpp, .c, .html, .css, .json, .xml |
| **Executables** | .exe, .msi, .bat, .cmd, .ps1, .sh |
| **Other** | Any file not matching above categories |

---

## Tracked Information

For each file detected, the agent records:

```json
{
    "name": "Annual_Report.docx",
    "path": "C:\\Users\\John\\Documents\\Annual_Report.docx",
    "folder": "Documents",
    "extension": ".docx",
    "category": "documents",
    "size": "2.5 MB",
    "sizeBytes": 2621440,
    "action": "created",
    "timestamp": "2026-01-07T23:15:00.000Z"
}
```

---

## Session Report Structure

When a user ends their session, the file activity summary is included:

```json
{
    "filesCreated": [...],  // Array of all files
    "fileStats": {
        "totalFiles": 15,
        "totalSize": "45.2 MB",
        "totalSizeBytes": 47420000,
        "created": 12,
        "modified": 3,
        "byCategory": {
            "documents": 5,
            "images": 4,
            "spreadsheets": 2,
            "videos": 1,
            "other": 3
        }
    },
    "fileCategorySummary": {
        "documents": {
            "count": 5,
            "totalSize": "12.5 MB",
            "files": [...]
        },
        "images": {
            "count": 4,
            "totalSize": "8.2 MB",
            "files": [...]
        }
    }
}
```

---

## API Endpoints

### Get All File Activity
```
GET /api/v1/admin/file-activity
```

Query Parameters:
- `limit` - Max results (default: 100)
- `clientId` - Filter by computer
- `user` - Filter by user
- `category` - Filter by file category (documents, images, etc.)
- `groupByCategory=true` - Group results by category

### Get File Statistics
```
GET /api/v1/admin/file-stats
```

Returns aggregated statistics including:
- Total files by category
- Total size by category
- Recent files for each category

---

## Ignored Files

The following are automatically ignored:
- Dotfiles (hidden files starting with `.`)
- `desktop.ini`
- `Thumbs.db`
- `.tmp` and `.temp` files
- `.lnk` shortcuts
- Office temp files (`~$...`)

---

## How It Works

1. **Session Start**: File monitoring begins when user logs in
2. **Real-time Detection**: New/modified files are detected immediately
3. **Categorization**: Files are auto-categorized by extension
4. **Size Tracking**: File sizes are recorded in human-readable format
5. **Session End**: Complete summary is sent to admin dashboard

---

## Admin Dashboard View

The admin can see:
- 📁 Total files created per session
- 📊 Files grouped by category with counts
- 📈 Storage used per category
- 🔍 Filter by specific file types
- 👤 Filter by user or computer
