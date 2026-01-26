# HawkNine Document Sharing System

## Overview

The Document Sharing System allows secure file transfer between:
- **Admin → User** (send documents to specific computers)
- **User → Admin** (users can send documents from their workstations)
- **User → User** (share documents between computers)

---

## API Endpoints

### Upload a Document
```http
POST /api/v1/documents/upload
Content-Type: multipart/form-data

file: [binary file data]
fromUser: "John Doe"
fromClientId: "PC-01-abc123"
toUser: "admin" | "all" | "username"
toClientId: "admin" | "all" | "client-id"
message: "Please review this report"
```

### Send Document to Specific Computer (Admin)
```http
POST /api/v1/documents/send-to-computer
Content-Type: multipart/form-data

file: [binary file data]
targetClientId: "PC-01-abc123"
targetHostname: "PC-01"
message: "Here is the requested file"
```

### List Documents
```http
GET /api/v1/documents
GET /api/v1/documents?clientId=abc123
GET /api/v1/documents?user=admin
GET /api/v1/documents?direction=received
GET /api/v1/documents?direction=sent
```

### Download Document
```http
GET /api/v1/documents/:id/download
```

### Delete Document
```http
DELETE /api/v1/documents/:id
```

### Document Statistics
```http
GET /api/v1/documents/stats
```

---

## Document Object Structure

```json
{
    "id": "1704665432123abc456def",
    "filename": "Annual_Report.pdf",
    "size": 2621440,
    "sizeFormatted": "2.5 MB",
    "mimetype": "application/pdf",
    "from": {
        "user": "John Doe",
        "clientId": "PC-01-abc123"
    },
    "to": {
        "user": "Admin",
        "clientId": "admin"
    },
    "message": "Please review this report",
    "status": "pending",
    "uploadedAt": "2026-01-07T23:30:00.000Z",
    "downloadedAt": null
}
```

---

## WebSocket Events

### Real-time Notifications

| Event | Direction | Description |
|-------|-----------|-------------|
| `document-received` | Server → Client | New document uploaded |
| `document-downloaded` | Server → Client | Document was downloaded |
| `document-deleted` | Server → Client | Document was deleted |
| `document-for-agent` | Server → Agent | Admin sent document to specific computer |

---

## Supported File Types

| Category | Extensions |
|----------|-----------|
| Documents | .pdf, .doc, .docx, .txt, .rtf |
| Spreadsheets | .xls, .xlsx, .csv |
| Presentations | .ppt, .pptx |
| Images | .jpg, .png, .gif, .bmp |
| Archives | .zip, .rar |

**Max File Size:** 50 MB

---

## Usage Examples

### Admin Dashboard - Send to Computer
```javascript
const formData = new FormData();
formData.append('file', selectedFile);
formData.append('targetClientId', 'PC-01-abc123');
formData.append('targetHostname', 'PC-01');
formData.append('message', 'Here is the document you requested');

await sendDocumentToComputer(formData);
```

### Desktop Agent - Upload to Admin
```javascript
const formData = new FormData();
formData.append('file', selectedFile);
formData.append('fromUser', currentSession.user);
formData.append('fromClientId', CLIENT_ID);
formData.append('toUser', 'admin');

await axios.post('http://localhost:5000/api/v1/documents/upload', formData);
```

---

## File Storage

Documents are stored in:
```
backend/uploads/
└── [timestamp]-[random]-[original-filename]
```

Files are served statically at `/uploads/` but downloads should go through the `/api/v1/documents/:id/download` endpoint to track analytics.

---

## Security Considerations

1. **File Validation**: Only allowed MIME types are accepted
2. **Size Limits**: 50MB max per file
3. **Access Control**: In production, implement authentication tokens
4. **Virus Scanning**: Consider integrating ClamAV for uploaded files
5. **Expiration**: Documents can be set to expire after a period
