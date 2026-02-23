# HawkNine Architecture & System Flow

The visual diagrams below illustrate the architecture, telemetry flow, and transaction lifecycles for the HawkNine platform.

## 1. High-Level Core Architecture

```mermaid
flowchart TD
    %% Define Nodes
    subgraph Client Environments
        A[Desktop Agent PC 1]
        B[Desktop Agent PC 2]
        C[Desktop Agent PC N]
    end

    subgraph The World
        L[Public Landing Page]
        CU[Customer Mobile/Home PC]
    end

    subgraph HawkNine Core Backend
        DB[(MongoDB)]
        API[Node.js Express API]
        WS((WebSockets Socket.io))
        Auth{Authentication JWT}
        
        API <--> DB
        WS <--> DB
        API <--> Auth
    end

    subgraph Management
        AD[Admin Dashboard React]
        Staff[Staff/Admin]
    end

    %% Connections
    A <==>|Telemetry, Commands, Pings| WS
    B <==>|Telemetry, Commands, Pings| WS
    C <==>|Telemetry, Commands, Pings| WS
    
    A <-->|IPC| A_UI[User Portal Overlay UI]
    B <-->|IPC| B_UI[User Portal Overlay UI]
    
    A_UI -->|Purchases, Logins| API
    A -->|Offline Cache Sync| API

    L <--> API
    CU -->|Uploads Documents| L

    WS <==>|Live Updates, Monitor Streams| AD
    API <-->|REST Analytics, Settings| AD
    Staff -->|Manage| AD
```

## 2. Inventory Purchase Flow Lifecycle

```mermaid
sequenceDiagram
    participant User as Cybercafe Customer
    participant Portal as User Portal (React)
    participant Agent as Desktop Agent (Electron)
    participant Backend as Node.js / MongoDB
    participant Admin as Admin Dashboard
    
    User->>Portal: Clicks "Buy Snack"
    Portal->>Agent: IPC Event: 'buy-item' (itemId)
    
    alt Agent is Offline
        Agent-->>Portal: Error / Read from Cache
    else Agent is Online
        Agent->>Backend: POST /api/v1/inventory/:itemId/sell
        Backend->>Backend: Verify Auth & Stock Levels
        alt Stock Sufficient
            Backend->>Backend: Decrement Stock
            Backend->>Backend: Create 'Inventory-Sale' Transaction
            Backend-->>Agent: 200 OK (Success)
            Agent-->>Portal: Show Success Notification
            Backend--)Admin: WebSocket: 'inventory-update' (New Count)
            Backend--)Admin: WebSocket: 'transaction-created' (Ledger)
            
            alt Stock Drops Below Threshold
                Backend->>Backend: Trigger Low-Stock Logic
                Backend--)Admin: Send Low Stock Email / UI Alert
            end
        else Stock Insufficient
            Backend-->>Agent: 400 Bad Request
            Agent-->>Portal: Show Error Notification
        end
    end
```

## 3. Print Interception & Activity Telemetry Engine

```mermaid
flowchart LR
    subgraph Desktop Agent Modules
        Sys[System Process Monitor]
        Net[Network / Browser Hook]
        File[File System Watcher]
        USB[USB Detector]
        Print[Print Spooler Hook]
    end
    
    subgraph Data Queue System
        Q[data-queue.js Cache]
    end

    Sys -->|Logs App Usage| Q
    Net -->|Extracts URLs & Categories| Q
    File -->|Logs Downloads & Saves| Q
    USB -->|Logs Plug/Unplug| Q
    Print -->|Calculates Pages & Color| Q

    Q -->|Batched Upload Over WebSocket| Server[(Core Server)]
    
    Server -->|Routes 'print' Event| Ledger{Billing Engine}
    Ledger -->|Calculates KSH Cost| Bill[Add to User Session Ledger]
    
    Server -->|Routes 'browser'/'file'| DB[(Data Lake DB)]
    DB -->|Filters & Aggregates| AdminView[Admin Activity Drawer]
```

## 4. Public Document Handling & Remote Downloads

```mermaid
sequenceDiagram
    participant Public as Customer at Home
    participant Backend as Express Server
    participant Agent as Cybercafe Agent (PC 3)
    participant Admin as Admin Dashboard
    
    Public->>Backend: Uploads 'Resume.pdf' via Landing Page
    Backend->>Backend: Saves 'Resume.pdf' to Server Disk
    Backend->>Backend: Creates 'DocumentRequest' DB Entry
    
    Backend--)Admin: WebSocket: 'new-document-request'
    Admin-->>Admin: Updates "Landing Page Requests" UI/Badge
    
    Backend--)Agent: WebSocket: 'agent-public-document-notification'
    
    Agent->>Agent: Prompt User/Staff to Download?
    Agent->>Backend: GET 'Resume.pdf' via HTTP Download
    
    Agent--)Backend: WebSocket: 'agent-response' (type: document-downloaded, clientId)
    Backend->>Backend: Updates DB with 'receivedBy: PC 3'
    
    Backend--)Admin: WebSocket: 'document-status-update'
    Admin-->>Admin: Updates Document Table: "Downloaded by PC 3"
```

## 5. Remote Screenshot Flow

```mermaid
flowchart TD
    Staff[Admin] -->|Clicks 'Screenshot'| AD[Admin Dashboard]
    AD -->|POST /api/v1/admin/computers/:id/screenshot| API[Node.js API]
    API -->|Identify Target Socket Connection| Router{Socket Router}
    Router -->|socket.to(clientId).emit('agent-command')| TargetAgent[Specific Desktop Agent]
    TargetAgent -->|Invokes screenshot-desktop package| Screen(Capture OS Display)
    Screen -->|Encodes to Base64| TargetAgent
    TargetAgent -->|socket.emit('agent-response', base64)| Router
    Router -->|io.emit('agent-screenshot')| AD
    AD -->|Renders Image| Staff 
```
