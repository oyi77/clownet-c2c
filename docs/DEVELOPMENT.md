# ClawNet C2C - Developer Guide

How to develop, test, and contribute to ClawNet C2C.

## Table of Contents

- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Adding a New Socket Module](#adding-a-new-socket-module)
- [Testing Guide](#testing-guide)
- [Code Style & Conventions](#code-style--conventions)
- [Debugging Tips](#debugging-tips)
- [Performance Optimization](#performance-optimization)
- [Contributing Guidelines](#contributing-guidelines)

---

## Getting Started

### Prerequisites

- **Node.js**: 18.x or 20.x
- **npm**: 9.x or 10.x
- **Git**: Latest version

### Installation

```bash
# Clone repository
git clone https://github.com/your-org/clownet-c2c.git
cd clownet-c2c

# Install dependencies
npm install

# Set secret key
export CLAWNET_SECRET_KEY="dev-secret-key"

# Start server
npm start

# In another terminal, start test agent
export CLAWNET_SECRET_KEY="dev-secret-key"
node client.js
```

### Verify Installation

```bash
# Run all tests
npm test

# Health check
curl http://localhost:3000/

# Access dashboard
open http://localhost:3000/dashboard
```

---

## Project Structure

```
clownet-c2c/
├── server.js                 # Main entry point (bootstrapper)
├── client.js                 # Agent sidecar
├── package.json              # Dependencies and scripts
│
├── src/                      # Source code
│   ├── config.js             # Configuration management
│   ├── state.js              # Multi-tenant state store
│   ├── persistence.js        # State persistence to disk
│   ├── auth.js               # Token-based authentication
│   │
│   ├── routes/               # HTTP endpoints
│   │   ├── health.js         # Health check
│   │   ├── dashboard.js      # Dashboard UI
│   │   └── api.js            # REST API endpoints
│   │
│   ├── socket/               # Socket.IO event handlers
│   │   ├── index.js          # Socket.IO setup & middleware
│   │   ├── fleet.js          # Agent connect/disconnect
│   │   ├── dispatch.js       # Command dispatch
│   │   ├── chat.js           # Chat system
│   │   ├── rooms.js          # Room join/leave
│   │   ├── warden.js         # Traffic monitoring
│   │   ├── safety.js         # Command denylist/riskylist
│   │   ├── shared-memory.js  # Shared memory (v3.5)
│   │   ├── credentials.js    # Credential storage (v3.5)
│   │   ├── file-sharing.js   # File sharing (v3.5)
│   │   ├── skills.js         # Skill registry (v3.5)
│   │   ├── orchestration.js  # Task orchestration (v3.5)
│   │   └── config.js         # Config management (v3.5)
│   │
│   └── utils/
│       ├── logger.js         # Event logging
│       └── audit.js          # Traffic audit + hash chain
│
├── views/                    # EJS templates
│   ├── dashboard.ejs         # Main dashboard (74 lines)
│   └── partials/             # Modular components
│       ├── _header.ejs
│       ├── _operations_tab.ejs
│       ├── _chatroom_tab.ejs
│       ├── _management_tab.ejs
│       ├── _scripts_operations.ejs
│       ├── _scripts_chatroom.ejs
│       └── _scripts_management.ejs
│
├── public/                   # Static assets
│   ├── css/
│   ├── js/
│   └── images/
│
├── tests/                    # Test suite
│   ├── run-all.js            # Test runner
│   ├── persistence.test.js
│   ├── audit-metrics.test.js
│   ├── warden.test.js
│   ├── rooms.test.js
│   ├── broadcast.test.js
│   ├── delivery.test.js
│   ├── tenant.test.js
│   ├── safety.test.js
│   └── dashboard-ui.test.js
│
├── docs/                     # Documentation
│   ├── SOCKET_EVENTS.md      # Socket API reference
│   ├── FEATURE_GUIDES.md     # User guides
│   ├── ARCHITECTURE.md       # System architecture
│   ├── DEVELOPMENT.md        # This file
│   ├── TESTING_REPORT.md     # Testing report
│   ├── openapi.yaml          # REST API spec
│   └── schema.sql            # SQL schema
│
├── README.md                 # Project overview
├── AGENTS.md                 # Agent knowledge base
└── Dockerfile                # Docker build
```

---

## Development Workflow

### 1. Create a Feature Branch

```bash
git checkout -b feature/my-new-feature
```

### 2. Make Changes

- Edit code in `src/`
- Add tests in `tests/`
- Update documentation as needed

### 3. Test Locally

```bash
# Run tests
npm test

# Start server for manual testing
npm start

# In another terminal, start agent
node client.js
```

### 4. Commit Changes

```bash
git add .
git commit -m "feat: add new feature"
```

**Commit message format**:
```
type(scope): subject

body

footer
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `refactor`: Refactoring
- `test`: Test changes
- `chore`: Maintenance tasks

**Example**:
```
feat(orchestration): add parallel execution mode

- Add parallel task distribution
- Update UI to support mode selection
- Add tests for parallel execution
```

### 5. Push and Create Pull Request

```bash
git push origin feature/my-new-feature
# Then create PR on GitHub
```

---

## Adding a New Socket Module

### Step 1: Create Module File

Create `src/socket/my-feature.js`:

```javascript
/**
 * My Feature Module
 *
 * Purpose: Brief description of what this module does
 */

const state = require('../state.js');

module.exports = function(io, socket, agentStore) {
  const tenantState = state.getTenantState(socket.tenantId);

  /**
   * Handle create_my_resource event
   *
   * Request: { name: string, data: object }
   * Response: { success: boolean, resourceId: uuid }
   */
  socket.on('create_my_resource', async (payload, callback) => {
    try {
      // Validate input
      if (!payload.name || !payload.data) {
        callback({ success: false, error: 'Missing required fields' });
        return;
      }

      // Create resource
      const resourceId = generateId();
      tenantState.myResources[resourceId] = {
        resource_id: resourceId,
        name: payload.name,
        data: payload.data,
        owner: socket.agentId,
        created_at: Date.now()
      };

      // Broadcast update
      socket.to(`tenant:${socket.tenantId}`).emit('management_data_update', {
        type: 'my_resource_updated',
        data: { resourceId }
      });

      callback({
        success: true,
        resourceId,
        message: 'Resource created successfully'
      });

    } catch (error) {
      callback({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Handle get_my_resource event
   *
   * Request: { resourceId: uuid }
   * Response: { success: boolean, data: object }
   */
  socket.on('get_my_resource', async (payload, callback) => {
    try {
      const resource = tenantState.myResources[payload.resourceId];

      if (!resource) {
        callback({ success: false, error: 'Resource not found' });
        return;
      }

      callback({
        success: true,
        data: resource
      });

    } catch (error) {
      callback({
        success: false,
        error: error.message
      });
    }
  });

  // Add more events...
};
```

### Step 2: Initialize State

Add state structure in `src/state.js`:

```javascript
function initializeTenantState(tenantId) {
  return {
    // ... existing state
    myResources: {},  // Add this
  };
}
```

### Step 3: Register Module

Add import and registration in `src/socket/index.js`:

```javascript
// Import at top
import myFeature from './my-feature.js';

// Register in setup function
myFeature(io, socket, agentStore);
```

### Step 4: Add UI (if applicable)

Create/update UI files in `views/partials/`:

1. Add HTML section in `_management_tab.ejs`:
```html
<div id="my-resources" class="resource-section">
  <h3>My Resources</h3>
  <button class="btn-primary" onclick="showCreateMyResourceModal()">+ CREATE NEW</button>
  <table id="my-resource-table">
    <!-- Dynamic content -->
  </table>
</div>
```

2. Add JavaScript in `_scripts_management.ejs`:
```javascript
function showCreateMyResourceModal() {
  // Show modal with form
}

function createMyResource() {
  socket.emit('create_my_resource', {
    name: document.getElementById('resourceName').value,
    data: JSON.parse(document.getElementById('resourceData').value)
  }, (response) => {
    if (response.success) {
      showToast('Resource created successfully');
      loadManagementData();
    } else {
      showToast('Error: ' + response.error, 'error');
    }
  });
}

function loadMyResources() {
  socket.emit('list_my_resources', (response) => {
    // Populate table
  });
}

// Listen for updates
socket.on('management_data_update', (update) => {
  if (update.type === 'my_resource_updated') {
    loadMyResources();
  }
});
```

### Step 5: Add Tests

Create `tests/my-feature.test.js`:

```javascript
const ioClient = require('socket.io-client');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const TEST_PORT = 3335;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const AUTH_TOKEN = 'test-secret';

let serverProcess = null;

async function startServer() {
  // ... server startup code
}

async function stopServer() {
  // ... server shutdown code
}

async function runTests() {
  console.log('🧪 My Feature Tests');
  console.log('='.repeat(50));

  let passed = 0;
  let failed = 0;

  try {
    await startServer();

    // Test 1: Create resource
    console.log('Test 1: Create my_resource');
    try {
      const socket = ioClient(BASE_URL, {
        query: { secret: AUTH_TOKEN },
        transports: ['websocket']
      });

      socket.on('connect', () => {
        socket.emit('create_my_resource', {
          name: 'test-resource',
          data: { key: 'value' }
        }, (response) => {
          if (response.success) {
            console.log('  ✓ Resource created');
            passed++;
          } else {
            console.log('  ✗ Failed:', response.error);
            failed++;
          }
          socket.disconnect();
        });
      });

      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      console.log('  ✗ Test failed:', error.message);
      failed++;
    }

    // Test 2: Get resource
    console.log('Test 2: Get my_resource');
    try {
      // ... test implementation
    } catch (error) {
      console.log('  ✗ Test failed:', error.message);
      failed++;
    }

    console.log(`\nResults: ${passed} passed, ${failed} failed`);

    process.exit(failed > 0 ? 1 : 0);

  } catch (error) {
    console.error('Test suite error:', error);
    process.exit(1);
  } finally {
    await stopServer();
  }
}

runTests();
```

### Step 6: Update Documentation

- Add socket events to `docs/SOCKET_EVENTS.md`
- Add feature guide to `docs/FEATURE_GUIDES.md`
- Update architecture if needed in `docs/ARCHITECTURE.md`

---

## Testing Guide

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
node tests/my-feature.test.js

# Run tests with verbose output
DEBUG=* npm test
```

### Test Structure

Each test file follows this pattern:

```javascript
const ioClient = require('socket.io-client');
const { spawn } = require('child_process');

const TEST_PORT = 3334;  // Use different port for parallel tests
const AUTH_TOKEN = 'test-secret';

let serverProcess = null;

// Helper: Start server
async function startServer() {
  return new Promise((resolve, reject) => {
    serverProcess = spawn('node', ['server.js'], {
      env: {
        ...process.env,
        PORT: TEST_PORT,
        CLAWNET_SECRET_KEY: AUTH_TOKEN
      }
    });
    // Wait for 'listening' in stdout
    // ...
  });
}

// Helper: Stop server
async function stopServer() {
  // Kill process and cleanup
}

// Main test suite
async function runTests() {
  console.log('🧪 Feature Tests');
  let passed = 0;
  let failed = 0;

  try {
    await startServer();

    // Test 1: Happy path
    // Test 2: Error cases
    // Test 3: Edge cases
    // ...

    console.log(`Results: ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await stopServer();
  }
}

runTests();
```

### Writing Tests

#### 1. Happy Path Tests

```javascript
console.log('Test: Create resource (happy path)');
const socket = ioClient(BASE_URL, { query: { secret: AUTH_TOKEN } });

socket.on('connect', () => {
  socket.emit('create_resource', {
    name: 'test',
    data: {}
  }, (response) => {
    if (response.success && response.resourceId) {
      console.log('  ✓ Resource created');
      passed++;
    } else {
      console.log('  ✗ Unexpected response:', response);
      failed++;
    }
    socket.disconnect();
  });
});

await new Promise(resolve => setTimeout(resolve, 500));
```

#### 2. Error Case Tests

```javascript
console.log('Test: Create resource without name (error case)');
socket.emit('create_resource', {
  data: {}  // Missing 'name'
}, (response) => {
  if (!response.success) {
    console.log('  ✓ Correctly rejected missing name');
    passed++;
  } else {
    console.log('  ✗ Should have failed but succeeded');
    failed++;
  }
});
```

#### 3. Access Control Tests

```javascript
console.log('Test: Access denied for non-owner');
socket.emit('get_resource', { resourceId: 'other-owners-id' }, (response) => {
  if (!response.success && response.error.includes('Access denied')) {
    console.log('  ✓ Access correctly denied');
    passed++;
  } else {
    console.log('  ✗ Should have denied access');
    failed++;
  }
});
```

#### 4. State Verification Tests

```javascript
console.log('Test: Verify state persistence');
socket.emit('create_resource', {
  name: 'persist-test',
  data: { key: 'value' }
}, (response) => {
  // Fetch again to verify it persisted
  socket.emit('get_resource', {
    resourceId: response.resourceId
  }, (getResponse) => {
    if (getResponse.success && getResponse.data.name === 'persist-test') {
      console.log('  ✓ State persisted correctly');
      passed++;
    } else {
      console.log('  ✗ State not persisted');
      failed++;
    }
  });
});
```

### Integration Tests

Create `tests/integration/multi-agent.test.js`:

```javascript
async function testMultiAgent() {
  // Connect agent 1
  const agent1 = ioClient(BASE_URL, {
    query: { secret: AUTH_TOKEN }
  });
  agent1.emit('agent_connect', { agentId: 'agent-1' });

  // Connect agent 2
  const agent2 = ioClient(BASE_URL, {
    query: { secret: AUTH_TOKEN }
  });
  agent2.emit('agent_connect', { agentId: 'agent-2' });

  // Wait for connections
  await new Promise(resolve => setTimeout(resolve, 500));

  // Test: Agent 1 shares resource with Agent 2
  agent1.emit('create_resource', {
    name: 'shared',
    data: {}
  }, (response) => {
    const resourceId = response.resourceId;

    agent1.emit('share_resource', {
      resourceId,
      targetAgentId: 'agent-2'
    }, (shareResponse) => {
      if (shareResponse.success) {
        // Verify Agent 2 can access
        agent2.emit('get_resource', {
          resourceId
        }, (getResponse) => {
          if (getResponse.success) {
            console.log('  ✓ Agent 2 can access shared resource');
            passed++;
          } else {
            console.log('  ✗ Agent 2 cannot access shared resource');
            failed++;
          }
        });
      }
    });
  });
}
```

---

## Code Style & Conventions

### JavaScript/Node.js

**Module format**: CommonJS (`require`/`module.exports`)

```javascript
// ✅ Correct
const state = require('../state.js');
module.exports = function(io, socket, agentStore) { /* ... */ };

// ❌ Incorrect
import state from '../state.js';
export default function(io, socket, agentStore) { /* ... */ };
```

**Naming conventions**:
- Variables/Functions: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Classes: `PascalCase`
- Event names: `underscore_case` (e.g., `agent_connect`)

```javascript
// ✅ Correct
const MAX_FILES = 100;
function getCurrentTime() { /* ... */ }
class AgentManager { /* ... */ }
socket.on('agent_connect', handler);

// ❌ Incorrect
const maxFiles = 100;
function get_Current_Time() { /* ... */ }
socket.on('agentConnect', handler);
```

**Code organization**:
- Imports at top
- Constants after imports
- Functions in logical order (helpers first, event handlers below)
- Module exports at bottom

```javascript
// ✅ Correct structure
const state = require('../state.js');
const utils = require('./utils.js');

const MAX_ITEMS = 100;

module.exports = function(io, socket, agentStore) {
  const tenantState = state.getTenantState(socket.tenantId);

  function helperFunction() { /* ... */ }

  socket.on('event_name', (payload, callback) => { /* ... */ });

  socket.on('another_event', (payload, callback) => { /* ... */ });
};
```

### Error Handling

**Always use try-catch for async operations**:

```javascript
socket.on('my_event', async (payload, callback) => {
  try {
    // ... operation
    callback({ success: true });
  } catch (error) {
    callback({ success: false, error: error.message });
  }
});
```

**Validate input before processing**:

```javascript
// ✅ Correct
if (!payload.name) {
  callback({ success: false, error: 'Missing required field: name' });
  return;
}

// ❌ Incorrect
await process(payload.name);  // Crashes if undefined
```

### Comments

**JSDoc for functions**:
```javascript
/**
 * Process a resource and return result
 *
 * @param {Object} resource - The resource to process
 * @param {string} resource.id - Resource ID
 * @param {Object} resource.data - Resource data
 * @returns {Promise<Object>} Processing result
 */
async function processResource(resource) {
  // ...
}
```

**Inline comments for complex logic**:
```javascript
// Base64 encode to ensure safe transmission over WebSocket
const encoded = Buffer.from(data).toString('base64');

// Deduplication: Store localId to prevent message duplication
const localId = payload.localId || generateId();
```

---

## Debugging Tips

### Enable Debug Logging

```bash
# Enable Socket.IO debug
DEBUG=socket.io* npm start

# Enable all debug logs
DEBUG=* npm start
```

### Use Chrome DevTools

1. Open dashboard
2. F12 to open DevTools
3. **Console** tab: View socket events and errors
4. **Network** tab: → WS → View WebSocket messages
5. **Application** tab: → Local Storage → View stored data

### Add Custom Logging

```javascript
const utils = require('./utils/logger.js');

// Log event
utils.auditLog({
  event: 'my_event',
  agentId: socket.agentId,
  payload,
  timestamp: Date.now()
});

// Log to console
console.log('Processing event:', payload);
console.debug('Debug info:', intermediateState);
console.error('Error occurred:', error);
```

### Test with Custom Client

Create `test-client.js`:

```javascript
const io = require('socket.io-client');
const socket = io('ws://localhost:3000', {
  query: { secret: 'dev-secret-key' },
  transports: ['websocket']
});

socket.on('connect', () => {
  console.log('Connected!');

  // Test event
  socket.emit('my_event', {
    test: 'data'
  }, (response) => {
    console.log('Response:', response);
  });
});

socket.on('error', (error) => {
  console.error('Socket error:', error);
});

socket.on('disconnect', () => {
  console.log('Disconnected');
});
```

Run: `node test-client.js`

---

## Performance Optimization

### 1. Use Debouncing for Frequent Events

```javascript
const debounce = require('lodash.debounce');

socket.on('frequent_event', debounce((payload) => {
  // Process event (debounced)
}, 100));
```

### 2. Batch Operations

```javascript
// ❌ Inefficient: Multiple database/file operations
for (const item of items) {
  await saveToFile(item);
}

// ✅ Efficient: Batch save
await saveAllFiles(items);
```

### 3. Use Broadcast to Same Room

```javascript
// ❌ Inefficient: Emit to all sockets
io.emit('update', data);

// ✅ Efficient: Emit to specific room
io.to(`tenant:${tenantId}`).emit('update', data);
```

### 4. Cache Frequently Accessed Data

```javascript
const cache = new Map();

function getCachedData(key) {
  if (cache.has(key)) {
    return cache.get(key);
  }
  const data = fetchFromState(key);
  cache.set(key, data);
  return data;
}

// Clear cache periodically
setInterval(() => cache.clear(), 60000);
```

---

## Contributing Guidelines

### Before You Contribute

1. **Check existing issues**: Look for related issues or pull requests
2. **Read documentation**: Understand the system architecture
3. **Start small**: Fix a bug or add a small feature first

### Pull Request Checklist

- [ ] Code follows project style guidelines
- [ ] Tests pass locally (`npm test`)
- [ ] New tests added for new features
- [ ] Documentation updated (SOCKET_EVENTS.md, FEATURE_GUIDES.md)
- [ ] Commit messages follow conventional format
- [ ] No console.log or debug code left in
- [ ] No sensitive data (keys, tokens, secrets) committed

### Code Review Process

1. Open pull request
2. Reviewer checks tests and documentation
3. Reviewer provides feedback
4. Make requested changes
5. Update and push changes
6. Merge when approved

### Reporting Bugs

When reporting bugs, include:

1. **Steps to reproduce**: Clear steps to trigger the bug
2. **Expected behavior**: What should happen
3. **Actual behavior**: What actually happens
4. **Environment**: Node.js version, OS, etc.
5. **Logs**: Relevant error messages or stack traces
6. **Browser**: If UI issue, include browser and version

---

## Common Tasks

### Updating Dependencies

```bash
# Check for outdated packages
npm outdated

# Update all packages
npm update

# Update specific package
npm update package-name

# Test after updates
npm test
```

### Adding Environment Variable

1. Add default in `src/config.js`:
```javascript
const MY_NEW_VAR = process.env.MY_NEW_VAR || 'default-value';
```

2. Document in README.md
3. Add to .env.example (if exists)

### Adding New Route

1. Create `src/routes/my-route.js`:
```javascript
module.exports = async function(fastify, options) {
  fastify.get('/my-endpoint', async (request, reply) => {
    return { message: 'Hello' };
  });
};
```

2. Register in `server.js`:
```javascript
fastify.register(routes.myRoute);
```

### Modifying UI

1. Edit EJS template in `views/partials/`
2. Add JavaScript in `views/partials/_scripts_*.ejs`
3. Test in browser
4. Refresh page (F5) to see changes

---

## Troubleshooting Development Issues

### Port Already in Use

```bash
# Find process using port 3000
lsof -i :3000

# Kill process
kill -9 <PID>

# Or use different port
PORT=3001 npm start
```

### Module Not Found

```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Socket Connection Failing

Check:
- Secret key matches between server and client
- Server is running (`npm test` or `npm start`)
- Network/firewall not blocking WebSocket
- Browser console for connection errors

### Tests Fail Randomly

Common causes:
- **Port collision**: Use unique TEST_PORT per test file
- **Race conditions**: Add delays between tests
- **State leakage**: Clean up/reset state between tests

---

## Resources

- **Socket.IO Docs**: https://socket.io/docs/
- **Fastify Docs**: https://www.fastify.io/docs/latest/
- **Node.js Docs**: https://nodejs.org/docs/
- **Project Issues**: https://github.com/your-org/clownet-c2c/issues

---

## License

MIT - see LICENSE file for details

---

## See Also

- [Socket Events API](./SOCKET_EVENTS.md) - Complete API reference
- [Feature Guides](./FEATURE_GUIDES.md) - User guides
- [Architecture](./ARCHITECTURE.md) - System design
- [AGENTS.md](../AGENTS.md) - Agent knowledge base
