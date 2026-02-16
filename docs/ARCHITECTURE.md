# ClawNet C2C - Architecture

System architecture, design decisions, and module interactions.

## Table of Contents

- [System Overview](#system-overview)
- [Architecture Diagram](#architecture-diagram)
- [Core Components](#core-components)
- [Module Architecture](#module-architecture)
- [State Management](#state-management)
- [Authentication & Security](#authentication--security)
- [Data Flow](#data-flow)
- [Deployment Architecture](#deployment-architecture)
- [Design Decisions](#design-decisions)
- [Scaling Considerations](#scaling-considerations)

---

## System Overview

ClawNet C2C is a **multi-agent command and control relay** built with:

- **Runtime**: Node.js (CommonJS)
- **Web Server**: Fastify (lightweight, high-performance)
- **Real-time**: Socket.IO (WebSocket + polling fallback)
- **UI**: EJS templates with vanilla JavaScript
- **State**: In-memory with optional JSON persistence
- **Auth**: Token-based (environment variable)

**Version**: 3.5.0 Modular
**Architecture**: Event-driven, modular, multi-tenant

---

## Architecture Diagram

```
┌───────────────────────────────────────────────────────────────┐
│                        Browser / Dashboard                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  Operations  │  │  Chat Room   │  │   Management │       │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │
└─────────┼──────────────────┼──────────────────┼───────────────┘
          │                  │                  │
          │                  │                  │
┌─────────┴──────────────────┴──────────────────┴───────────────┐
│                    Fastify HTTP Server                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   /health    │  │   /dashboard │  │   /api/*     │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└────────────────────────────────────────────────────────────────┘
          │
          │ WebSocket
          │
┌─────────┴───────────────────────────────────────────────────────┐
│                  Socket.IO Server                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Auth Middleware (CLAWNET_SECRET_KEY)                 │   │
│  └─────────────────┬───────────────────────────────────────┘   │
└────────────────────┼───────────────────────────────────────────┘
                     │
    ┌────────────────┼────────────────┐
    │                │                │
    ▼                ▼                ▼
┌─────────┐   ┌──────────────┐   ┌──────────┐
│  Fleet  │   │   Dispatch   │   │   Chat   │  (Core Modules)
│  Mgmt   │   │    System    │   │  System  │
└─────────┘   └──────────────┘   └──────────┘
    │                │                │
    └────────────────┼────────────────┘
                     │
    ┌────────────────┼────────────────────────────────┐
    │                │                │                │
    ▼                ▼                ▼                ▼
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│Shared    │   │Credential│   │File      │   │Skills    │ (v3.5 Features)
│Memory    │   │Sharing   │   │Sharing   │   │Sharing   │
└──────────┘   └──────────┘   └──────────┘   └──────────┘
    │                │                │                │
    └────────────────┼────────────────┴────────────────┘
                     │
    ┌────────────────┼────────────────┐
    │                │                │
    ▼                ▼                ▼
┌──────────┐   ┌──────────┐   ┌──────────┐
│Orchest-  │   │Config    │   │State     │ (v3.5 Features + Core)
│ration    │   │Management│   │Store     │
└──────────┘   └──────────┘   └──────────┘
                     │
                     │ Tenant-Isolated State
                     │
┌────────────────────┴───────────────────────────────────────────┐
│                 Multi-Tenant Isolation Layer                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  state.getTenantState(tenantId) → isolated data store  │   │
│  └─────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
                     │
    ┌────────────────┼────────────────┐
    │                │                │
    ▼                ▼                ▼
┌──────────┐   ┌──────────┐   ┌──────────┐
│ Agent 1  │   │ Agent 2  │   │ Agent N  │ (Connected Clients)
│(Sidecar) │   │(Sidecar) │   │(Sidecar) │
└──────────┘   └──────────┘   └──────────┘
```

---

## Core Components

### 1. Server Bootstrap (`server.js`)

**Purpose**: Entry point, minimal logic

**Responsibilities**:
- Import and configure Fastify
- Register EJS view engine
- Serve static files
- Import and register Socket.IO modules
- Start HTTP server and Socket.IO server

**Design**: Bootstrapper only - all logic delegated to modules

---

### 2. Configuration (`src/config.js`)

**Purpose**: Centralized configuration

**Features**:
- Environment variable loading
- Safe lists parsing (denylist, riskylist)
- Path resolution
- Default value handling

**Key Config Variables**:
```javascript
CLAWNET_SECRET_KEY      // Auth token
PORT                    // Server port
CLAWNET_COMMAND_DENYLIST    // Blocked commands
CLAWNET_COMMAND_RISKYLIST   // Approval-gated commands
CLAWNET_TENANTS_PATH        // Multi-tenant config file
CLAWNET_ACK_TIMEOUT_MS      // ACK timeout
CLAWNET_ACK_MAX_RETRIES     // Max delivery retries
```

---

### 3. State Management (`src/state.js`)

**Purpose**: Centralized, multi-tenant state store

**Architecture**:
```javascript
const globalState = {
  tenants: {
    [tenantId]: {
      // Isolated state per tenant
      agents: {},
      activeCommands: {},
      offlineQueue: {},
      // v3.5 new features:
      sharedMemory: {},
      credentials: {},
      files: {},
      skills: {},
      orchestrations: {},
      agentConfigs: {}
    }
  }
};

function getTenantState(tenantId) {
  // Returns isolated state for tenant
}
```

**Key Features**:
- **Tenant Isolation**: Each tenant has completely isolated state
- **Type Safety**: Consistent data structure across tenants
- **Persistence**: Optional JSON file persistence
- **Clean State**: Function to reset tenant state

---

### 4. Persistence (`src/persistence.js`)

**Purpose**: State persistence to disk

**Features**:
- Save state to JSON file
- Load state from JSON file
- Automatic persistence on interval
- Automatic persistence on shutdown

**Config**:
```javascript
const PERSISTENCE_CONFIG = {
  enabled: false,
  saveInterval: 60000,  // Save every 60 seconds
  path: './data/state.json'
};
```

---

### 5. Authentication (`src/auth.js`)

**Purpose**: Token-based authentication for Socket.IO

**Mechanism**:
```javascript
authenticate(authHeader, tenantSecret) {
  // Parse "Bearer token" or raw token
  // For multi-tenant: "tenant:secret" format
  // Return: { authenticated: boolean, tenantId: string }
}
```

**Usage**:
- Socket.IO middleware (`io.use(authMiddleware)`)
- HTTP route auth (optional)

---

### 6. Core Socket Modules

#### Fleet Management (`src/socket/fleet.js`)

**Events**: `agent_connect`, `agent_disconnect`, `report`

**State**: `tenantState.agents`, `tenantState.agentTelemetry`

**Features**:
- Agent registration and catalog
- Connection/disconnection tracking
- Reporting (status, logs, errors)
- Real-time roster broadcasting

---

#### Dispatch System (`src/socket/dispatch.js`)

**Events**: `exec_command`, `ack`, `offline_queue`

**State**: `tenantState.activeCommands`, `tenantState.offlineQueue`

**Features**:
- Command routing to agents
- ACK/retry mechanism
- Offline queue for offline agents
- Delivery guarantees

---

#### Chat System (`src/socket/chat.js`)

**Events**: `message`, `message_ack`, `chat_history`

**State**: `tenantState.messages`, `tenantState.messageQueue`

**Features**:
- Global broadcast, room-scoped, direct messages
- Message deduplication (localId)
- Presence tracking
- Message acknowledgment

---

#### Rooms (`src/socket/rooms.js`)

**Events**: `join_room`, `leave_room`

**State**: `tenantState.rooms`, `tenantState.roomMembers`

**Features**:
- Dynamic room creation
- Join/leave with presence
- Agent-to-room associations

---

#### Safety (`src/socket/safety.js`)

**Events**: `safety_check`, `approve_command`

**State**: `tenantState.pendingApprovals`

**Features**:
- Denylist (auto-reject commands)
- Riskylist (approval-required commands)
- Manual approval workflow

---

#### Warden (`src/socket/warden.js`)

**Events**: `warden_report`, `warden_subscribe`

**State**: `tenantState.wardenSubscribers`

**Features**:
- Role-based traffic monitoring
- Event filtering for wardens
- Real-time audit stream

---

### 7. v3.5 Socket Modules

#### Shared Memory (`src/socket/shared-memory.js`)

**Events**: `set_shared_memory`, `get_shared_memory`, `list_shared_memory`, `delete_shared_memory`

**State**: `tenantState.sharedMemory`

**Data Structure**:
```javascript
sharedMemory: {
  [key]: {
    value: any,
    ttl: number,
    createdAt: timestamp,
    expiresAt: timestamp
  }
}
```

**Features**:
- Key-value storage with TTL expiration
- Broadcasting on changes
- Tenant isolation

---

#### Credentials (`src/socket/credentials.js`)

**Events**: `store_credentials`, `get_credentials`, `list_credentials`, `share_credentials`, `revoke_credentials_access`

**State**: `tenantState.credentials`

**Data Structure**:
```javascript
credentials: {
  [credentialId]: {
    name: string,
    value: object (encrypted),
    iv: string ( decryption IV),
    authTag: string (auth tag),
    description: string,
    owner: agentId,
    sharedWith: [agentId],
    createdAt: timestamp
  }
}
```

**Security**: AES-256-GCM encryption using server-side key

---

#### File Sharing (`src/socket/file-sharing.js`)

**Events**: `upload_file`, `download_file`, `list_files`, `share_file`, `revoke_file_access`, `delete_file`

**State**: `tenantState.files`

**Data Structure**:
```javascript
files: {
  [fileId]: {
    name: string,
    data: string (base64),
    type: string (MIME),
    size: number,
    owner: agentId,
    sharedWith: [agentId],
    createdAt: timestamp
  }
}
```

**Features**:
- Base64-encoded file storage
- Access control (owner + sharedWith)
- Size validation (max 10MB)

---

#### Skills (`src/socket/skills.js`)

**Events**: `register_skill`, `get_skill`, `list_skills`, `share_skill`, `update_skill_experience`, `revoke_skill_access`, `delete_skill`

**State**: `tenantState.skills`

**Data Structure**:
```javascript
skills: {
  [skillId]: {
    name: string,
    description: string,
    experience: number,
    owner: agentId,
    sharedWith: [agentId],
    createdAt: timestamp
  }
}
```

**Features**:
- Skill registration and discovery
- Experience tracking and incrementing
- Access control

---

#### Orchestration (`src/socket/orchestration.js`)

**Events**: `create_orchestration`, `start_orchestration`, `get_orchestration`, `list_orchestrations`, `cancel_orchestration`, `report_task_result`

**State**: `tenantState.orchestrations`

**Data Structure**:
```javascript
orchestrations: {
  [orchestrationId]: {
    name: string,
    agents: [agentId],
    tasks: [
      {
        description: string,
        command: string,
        targetAgentId: agentId,
        status: 'pending|running|completed|failed',
        result: string,
        startedAt: timestamp,
        completedAt: timestamp
      }
    ],
    mode: 'sequential|parallel',
    status: 'pending|running|completed|cancelled',
    createdAt: timestamp,
    startedAt: timestamp
  }
}
```

**Features**:
- Sequential vs parallel execution modes
- Task distribution to specific agents
- Result aggregation

---

#### Configuration (`src/socket/config.js`)

**Events**: `save_agent_config`, `get_agent_config`, `list_agent_configs`, `update_agent_config`, `clone_agent_config`, `revert_agent_config`, `delete_agent_config`

**State**: `tenantState.agentConfigs`

**Data Structure**:
```javascript
agentConfigs: {
  [configId]: {
    name: string,
    data: object (JSON),
    versions: [
      {
        version: number,
        data: object,
        createdAt: timestamp
      }
    ],
    currentVersion: number,
    owner: agentId,
    createdAt: timestamp
  }
}
```

**Features**:
- Configuration versioning with history
- Clone, revert, delete operations
- History tracking

---

### 8. HTTP Routes (`src/routes/`)

#### Health (`src/routes/health.js`)
- `GET /` - Health check

#### Dashboard (`src/routes/dashboard.js`)
- `GET /dashboard` - Dashboard UI (EJS template)

#### API (`src/routes/api.js`)
- `GET /api/metrics` - Counters (agents, commands, messages)
- `GET /api/traffic` - Audit log entries
- `GET /api/logs/server` - Server event log
- `POST /api/settings` - Update persistence config

---

### 9. UI Layer (`views/`)

**Dashboard Structure**:
```
views/
├── dashboard.ejs              # Main structure (74 lines)
└── partials/
    ├── _header.ejs            # Header navigation
    ├── _operations_tab.ejs    # Operations tab HTML
    ├── _chatroom_tab.ejs      # Chatroom tab HTML
    ├── _management_tab.ejs    # Management tab HTML
    ├── _scripts_operations.ejs # Operations JS
    ├── _scripts_chatroom.ejs   # Chatroom JS
    └── _scripts_management.ejs # Management JS (825 lines)
```

**Design Pattern**:
- Modularity: 21 partials from monolithic dashboard.ejs
- Client-side state: Vanilla JS with Socket.IO client
- Real-time updates: Listen to `management_data_update` event

---

## State Management

### Multi-Tenant Architecture

**Isolation Strategy**:
```javascript
// Each tenant gets complete state isolation
function getTenantState(tenantId) {
  if (!state.tenants[tenantId]) {
    state.tenants[tenantId] = initializeTenantState();
  }
  return state.tenants[tenantId];
}

// Tenant state is separate object
const tenantState = {
  agents: {},
  activeCommands: {},
  offlineQueue: {},
  sharedMemory: {},
  credentials: {},
  files: {},
  skills: {},
  orchestrations: {},
  agentConfigs: {},
  // ... other tenant-specific data
};
```

**No Cross-Tenant Leaks**:
- Agent IDs scoped to tenant
- Socket connections scoped to tenant
- All operations check tenant identity
- No tenant can access another's data

---

### In-Memory vs Persistence

**Default**: In-memory only (for speed)

**Optional Persistence**:
```javascript
// Save state periodically
setInterval(() => {
  persistence.saveState(globalState);
}, 60000); // Every 60 seconds
```

**Trade-offs**:
- **In-Memory**: Fast, no disk I/O, data lost on restart
- **Persisted**: Survives restarts, slower, potential file corruption

**Recommendation**: Use in-memory for production (use external persistence layer for critical data)

---

## Authentication & Security

### Token-Based Auth

**Mechanism**:
```javascript
// Socket connection with token
socket = io('wss://server', {
  query: { secret: 'CLAWNET_SECRET_KEY' }
});

// Server verifies via middleware
io.use(async (socket, next) => {
  const token = socket.handshake.query.secret;
  const result = auth.authenticate(null, token);
  if (result.authenticated) {
    socket.tenantId = result.tenantId;
    next();
  } else {
    next(new Error('Authentication failed'));
  }
});
```

**Multi-Tenant Auth**:
```javascript
// Format: "tenant-id:secret-key"
const token = "my-tenant:my-secret-password";
```

---

### Credential Encryption

**Algorithm**: AES-256-GCM
**Key Source**: `ENCRYPTION_KEY` environment variable
**Fallback**: Server-generated key (in-memory only)

**Implementation**:
```javascript
const crypto = require('crypto');

function encrypt(value, key) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(JSON.stringify(value), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return {
    value: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
}

function decrypt(encrypted, iv, authTag, key) {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return JSON.parse(decrypted);
}
```

---

### Access Control

**Pattern**: Owner + sharedWith model

```javascript
// Check access
function hasAccess(resource, agentId) {
  return resource.owner === agentId ||
         resource.sharedWith.includes(agentId);
}

// Share resource
function shareResource(resource, targetAgentId, requesterId) {
  if (resource.owner !== requesterId) {
    return { success: false, error: 'Access denied' };
  }
  resource.sharedWith.push(targetAgentId);
  return { success: true };
}

// Revoke access
function revokeAccess(resource, targetAgentId, requesterId) {
  if (resource.owner !== requesterId) {
    return { success: false, error: 'Access denied' };
  }
  const index = resource.sharedWith.indexOf(targetAgentId);
  if (index > -1) {
    resource.sharedWith.splice(index, 1);
  }
  return { success: true };
}
```

**Applied to**: Credentials, files, skills

---

### Safety Controls

**Denylist**: Automatic rejection
```javascript
if (config.COMMAND_DENYLIST.includes(command)) {
  return { success: false, error: 'Command blocked by denylist' };
}
```

**Riskylist**: Requires approval
```javascript
if (config.COMMAND_RISKYLIST.includes(command)) {
  tenantState.pendingApprovals[commandId] = { command, timestamp };
  broadcast('approval_required', { command, commandId });
  return { success: false, pendingApproval: true };
}
```

---

## Data Flow

### Agent Connect Flow

```
1. Agent connects via Socket.IO client
   ↓
2. Connection passes through auth middleware
   ↓
3. Token validated (CLAWNET_SECRET_KEY)
   ↓
4. socket.tenantId set
   ↓
5. Agent emits 'agent_connect' with metadata
   ↓
6. Fleet module stores agent in tenantState.agents
   ↓
7. 'agent_joined' broadcast to all tenant sockets
   ↓
8. Agent ready to receive commands and messages
```

---

### Command Dispatch Flow (Sequential Mode - With ACK)

```
1. Dashboard emits 'exec_command' to server
   ↓
2. Dispatch module validates command
   ↓
3. Command stored in tenantState.activeCommands
   ↓
4. Command emitted to target agent
   ↓
5. Agent receives and executes
   ↓
6. Agent emits 'ack' with result
   ↓ (if no ACK within timeout)
   ↓
7a. ACK received: Remove from activeCommands
   ↓
8b. ACK timeout: Max retries
     ↓
     After 3 failures: Move to offlineQueue
   ↓
9. Result broadcast to dashboard
```

---

### Message Broadcast Flow

```
1. User sends message from dashboard
   ↓
2. Message assigned localId (UUID)
   ↓
3. Message stored with localId
   ↓
4. Message broadcast to all agents (based on scope: global/room/direct)
   ↓
5. Agent receives message
   ↓
6. Agent checks localId for deduplication
   ↓
7. If new: Process and emit 'message_ack' + response
   ↓
8. Dashboard receives ACK and response
   ↓
9. Display message and response in chat
```

---

### Orchestration Flow (Sequential Mode)

```
1. Dashboard creates orchestration via API
   ↓
2. Orchestration stored in tenantState.orchestrations
   ↓
3. Dashboard starts orchestration
   ↓
4a. Task 1 sent to Agent 1
   ↓
   Agent 1 executes and reports 'task_result'
   ↓ (wait for Task 1 completion in sequential mode)
5a. Task 2 sent to Agent 2
   ↓
   Agent 2 executes and reports 'task_result'
   ↓
6a. Continue until all tasks complete
   ↓ (if any task fails)
   ↓   Orchestration marked 'failed'
     ↓ (if all tasks succeed)
   ↓   Orchestration marked 'completed'
   ↓
7. Dashboard queries orchestration status
   ↓
8. Display results in modal
```

---

### Configuration Save Flow

```
1. Dashboard fills form with JSON data
   ↓
2. Real-time validation (✓ Valid JSON / ✗ Invalid JSON)
   ↓
3. User clicks 'Save Configuration'
   ↓
4. 'save_agent_config' emitted to server
   ↓
5. Config module validates JSON (parse check)
   ↓
6. Config stored in tenantState.agentConfigs
   ↓
7. New version created (version 1)
   ↓
8. 'management_data_update' broadcast
   ↓
9. Dashboard refreshes config table
```

---

## Deployment Architecture

### Production Deployment (Fly.io)

```
┌─────────────────────────────────────────────────────┐
│                   Fly.io App                         │
│  ┌───────────────────────────────────────────────┐  │
│  │  Single Instance (for now)                    │  │
│  │  • Node.js 20.x                              │  │
│  │  • PORT: 3000 (internal)                     │  │
│  │  • External URL: https://clownet-c2c.fly.dev │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
          │
          │
    ┌─────┴─────┐
    │           │
    ▼           ▼
┌─────────┐  ┌─────────┐
│Agent 1  │  │Agent 2  │ (Sidecars connecting from anywhere)
└─────────┘  └─────────┘
```

**Configuration**:
```yaml
# fly.toml
app = "clownet-c2c"

[build]
  [build.command]
    cmd = "npm install"

[env]
  PORT = "3000"
  CLAWNET_SECRET_KEY = "jarancokasu"

[[services]]
  internal_port = 3000
  protocol = "tcp"

  [[services.ports]]
    port = 80
    handlers = ["http"]

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]
```

---

### Scaling Considerations

**Current**:
- Single server instance
- In-memory state (no persistence)
- No horizontal scaling

**Limitations**:
- **State not shared**: Multiple instances would have separate state
- **No replication**: Single point of failure
- **Memory bound**: All state in memory

**Potential Improvements**:
- **Redis state backend**: Share state across instances
- **Database persistence**: PostgreSQL or MongoDB for durable storage
- **Load balancer**: Distribute Socket.IO connections
- **Socket.IO Redis adapter**: Scale Socket.IO horizontally
- **Horizontal scaling**: Multiple Fly.io instances

---

## Design Decisions

### 1. In-Memory State

**Decision**: In-memory state by default

**Rationale**:
- **Speed**: No disk I/O on every operation
- **Simplicity**: No database setup
- **Development ease**: Fast iteration, no migrations

**Trade-off**:
- Data lost on restart
- Not suitable for critical persistent data

**Future**: Add optional Redis/database backend

---

### 2. Multi-Tenant Isolation

**Decision**: Complete state isolation per tenant

**Rationale**:
- **Security**: Prevent cross-tenant data leaks
- **Clean architecture**: Each tenant is self-contained
- **Scalability**: Easy to migrate tenant to separate server

**Trade-off**:
- Slightly more complex state access pattern

---

### 3. Modular Architecture

**Decision**: Each feature in separate module

**Rationale**:
- **Maintainability**: Easy to add/remove features
- **Testing**: Test modules in isolation
- **Clarity**: Clear boundaries and responsibilities

**Trade-off**:
- More files to manage
- Initial setup overhead

---

### 4. Socket.IO over REST

**Decision**: Real-time operations (commands, chat, sharing) via Socket.IO

**Rationale**:
- **Bi-directional**: Server can push to clients
- **Low latency**: No polling overhead
- **Real-time**: Instant feedback and updates

**Trade-off**:
- Not as cacheable as REST
- Firewall issues (WebSocket blocked in some networks)

---

### 5. Base64 File Encoding

**Decision**: Encode files as base64 in JSON payload

**Rationale**:
- **Simplicity**: No multipart/form-data complexity
- **Compatibility**: Works over JSON/WebSocket
- **Ease of use**: Easy to serialize/deserialize

**Trade-off**:
- 33% size overhead from base64 encoding
- Large files in memory

**Future**: Alternative: Upload via HTTP POST, store reference

---

### 6. AES-256-GCM for Credentials

**Decision**: Encrypt credentials at rest

**Rationale**:
- **Security**: Prevent credential exposure in memory dumps
- **Compliance**: Basic encryption standard
- **Availability**: Built into Node.js crypto

**Trade-off**:
- Key management complexity
- Decryption overhead

**Future**: Use external secrets manager (Vault, AWS Secrets Manager)

---

### 7. Plain Node.js (No TypeScript)

**Decision**: Use plain CommonJS, no TypeScript

**Rationale**:
- **Simplicity**: No build step
- **Speed**: No compilation
- **Compatibility**: Works everywhere Node runs

**Trade-off**:
- No type safety
- No IDE autocomplete (without JSDoc)

**Future**: TypeScript migration option

---

### 8. No Task Queue Library

**Decision**: Implement offline queue in memory

**Rationale**:
- **Simplicity**: No Redis/Bull setup
- **Sufficient**: For small fleets (100 agents)

**Trade-off**:
- No persistent queues across restarts
- No advanced scheduling or retries

**Future**: Add BullMQ or similar for production

---

## Performance Considerations

### Memory Usage

**Estimated per tenant**:
- Agents (100): ~1 KB each = 100 KB
- Active commands (100): ~500 B each = 50 KB
- Shared memory (1000): ~1 KB each = 1 MB
- Credentials (100): ~2 KB each = 200 KB
- Files (100, 10 MB max): **1 GB** (worst case!)
- Skills (100): ~500 B each = 50 KB
- Orchestrations (50): ~5 KB each = 250 KB
- Configs (50): ~2 KB each = 100 KB

**Total**: ~1.5 GB per tenant (heavy file usage)

**Recommendation**:
- Limit file sizes and quotas
- Implement file cleanup
- Use external storage for large files

---

### CPU Usage

**Hot paths**:
- Message routing (chat.js): Loop through recipients
- Command dispatch (dispatch.js): Queue management
- Encryption/decryption (credentials.js): Crypto operations
- Orchestration execution (orchestration.js): Task distribution

**Optimizations**:
- Batch broadcast operations
- Pool crypto workers (for encryption)
- Cache frequently accessed data

---

### Network

**Bandwidth usage**:
- Small messages: <1 KB (chat, commands, status)
- Large messages: File uploads (up to 10 MB)
- Real-time overhead: WebSocket keepalive frames

**Optimizations**:
- Compress large payloads (gzip)
- Binary transport (for file downloads)
- HTTP 2+ for dashboard assets

---

## Security Model

### Trust Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│                   Public Internet                            │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Untrusted                                            │  │
│  │  • Browser/Dashboard users                           │  │
│  │  • Agent sidecars (external)                         │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
            │
            │ Auth Token (CLAWNET_SECRET_KEY)
            ▼
┌─────────────────────────────────────────────────────────────┐
│                   Trusted Zone                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  ClawNet C2C Server                                   │  │
│  │  • Authenticated tenants                              │  │
│  │  • In-memory state (encrypted credentials)            │  │
│  │  • Multi-tenant isolation                            │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Threat Model

| Threat | Mitigation |
|--------|------------|
| Unauthorized access | Token-based auth |
| Cross-tenant data leak | Complete state isolation |
| Credential exposure | AES-256-GCM encryption |
| Command injection | Denylist + riskylist |
| DoS via file upload | File size limits (10 MB) |
| Replay attacks | Timestamps, nonces (future) |
| Eavesdropping | TLS (WSS) encryption |

---

## Future Enhancements

### Planned Features

1. **External State Backend**: Redis or PostgreSQL
2. **Message Persistence**: Chat history to database
3. **Audit Logging**: Detailed operation logs to external system
4. **Rate Limiting**: Per-tenant API rate limits
5. **Webhooks**: Notify external systems on events
6. **Advanced Orchestration**: Conditional task execution, loops
7. **Skill Marketplace**: Share skills across deployments
8. **Configuration Diff**: Visual diff between versions
9. **Real-time Metrics**: Grafana/Prometheus integration
10. **Agent Health**: Heartbeat monitoring, auto-restart

---

## See Also

- [Socket Events API](./SOCKET_EVENTS.md) - Complete API reference
- [Feature Guides](./FEATURE_GUIDES.md) - How-to guides
- [OpenAPI Spec](./openapi.yaml) - REST API endpoints
- [AGENTS.md](../AGENTS.md) - Agent knowledge base
