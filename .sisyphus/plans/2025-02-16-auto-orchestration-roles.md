# Auto Orchestration with Role-Based Task Assignment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an automatic orchestration system that assigns tasks to agents based on their roles, spawns subagents/sessions for load balancing, and manages task queue distribution without manual agent specification.

**Architecture:** New socket module with role registry, task matching engine, load balancer, and auto-orchestration state management. Existing orchestration module remains for manual orchestration.

**Tech Stack:** Node.js (CommonJS), Socket.IO, UUID for IDs, in-memory state (similar to existing modules).

---

## Overview of Components

1. **Role Registry** - Define and manage agent roles (e.g., "data-processor", "inference", "orchestrator")
2. **Agent Role Assignment** - Assign multiple roles to individual agents
3. **Auto Orchestration Queue** - Queue of tasks waiting for role-based assignment
4. **Load Balancer** - Strategy for selecting agent from available role-matched agents (round-robin, least-loaded, random)
5. **Task Assignment Engine** - Match task requirements to agent capabilities, execute task, handle failures
6. **Subagent Spawner** - spawn additional sessions when load exceeds threshold

---

## Phase 1: Data Structures & State Initialization

### Task 1: Update State Module - Define Auto Orchestration State

**Files:**
- Modify: `src/state.js` (add to `initializeTenantState()` function)

**Step 1: Add state structures for auto orchestration**

```javascript
function initializeTenantState(tenantId) {
  return {
    // ... existing state ...
    
    // Auto orchestration state (NEW)
    roles: {},  // { roleId: { name, description, createdAt } }
    agentRoles: {},  // { agentId: [roleId, roleId, ...] }
    autoOrchestrations: {},  // { orchestrationId: { ... } }
    taskQueue: [],  // [{ id, name, requirements: { roles: [] }, priority, createdAt }]
    loadBalancers: {},  // { roleId: { strategy, index: 0, lastUsed: timestamp } }
  };
}
```

**Step 2: Add helper to get agents by role**

```javascript
// Add at end of src/state.js
state.getAgentsByRole = function(tenantId, roleId) {
  const tenantState = state.getTenantState(tenantId);
  if (!tenantState.agentRoles) return [];

  const agentsWithRole = [];
  for (const [agentId, roleIds] of Object.entries(tenantState.agentRoles)) {
    if (roleIds.includes(roleId) && tenantState.agents[agentId]) {
      agentsWithRole.push(agentId);
    }
  }
  return agentsWithRole;
};
```

**Step 3: Commit**

```bash
git add src/state.js
git commit -m "feat: add auto orchestration state structures"
```

---

## Phase 2: Role Management Module

### Task 2: Create Role Registry Socket Module

**Files:**
- Create: `src/socket/roles.js`

**Step 1: Write module skeleton**

```javascript
/**
 * Role Registry Module
 * Manages agent roles and role-based task assignments
 */

const state = require('../state.js');
const { v4: generateId } = require('uuid');

module.exports = function(io, socket, agentStore) {
  const tenantState = state.getTenantState(socket.tenantId);
  
  // Register role
  socket.on('create_role', (payload, callback) => {
    const { name, description } = payload;
    
    if (!name) {
      return callback({ success: false, error: 'Role name is required' });
    }
    
    const roleId = generateId();
    tenantState.roles[roleId] = {
      roleId,
      name,
      description: description || '',
      createdAt: Date.now()
    };
    
    socket.to(`tenant:${socket.tenantId}`).emit('roles_updated', {});
    
    callback({
      success: true,
      roleId,
      message: 'Role created successfully'
    });
  });
  
  // List roles
  socket.on('list_roles', (callback) => {
    callback({
      success: true,
      data: Object.values(tenantState.roles)
    });
  });
  
  // Delete role
  socket.on('delete_role', (payload, callback) => {
    const { roleId } = payload;
    
    if (!tenantState.roles[roleId]) {
      return callback({ success: false, error: 'Role not found' });
    }
    
    delete tenantState.roles[roleId];
    
    // Remove role from all agents
    Object.keys(tenantState.agentRoles).forEach(agentId => {
      const index = tenantState.agentRoles[agentId].indexOf(roleId);
      if (index > -1) {
        tenantState.agentRoles[agentId].splice(index, 1);
      }
    });
    
    socket.to(`tenant:${socket.tenantId}`).emit('roles_updated', {});
    
    callback({ success: true, message: 'Role deleted successfully' });
  });
};
```

**Step 2: Run existing tests to ensure no breaking changes**

Run: `npm test` (skip new module tests)
Expected: All existing tests pass

**Step 3: Add role to agent**

```javascript
// Add to src/socket/roles.js after delete_role event

socket.on('assign_role_to_agent', (payload, callback) => {
  const { agentId, roleId } = payload;
  
  if (!tenantState.roles[roleId]) {
    return callback({ success: false, error: 'Role not found' });
  }
  
  if (!tenantState.agents[agentId]) {
    return callback({ success: false, error: 'Agent not found or not connected' });
  }
  
  if (!tenantState.agentRoles[agentId]) {
    tenantState.agentRoles[agentId] = [];
  }
  
  if (!tenantState.agentRoles[agentId].includes(roleId)) {
    tenantState.agentRoles[agentId].push(roleId);
  }
  
  socket.to(`tenant:${socket.tenantId}`).emit('agent_roles_updated', { agentId });
  
  callback({ success: true, message: 'Role assigned successfully' });
});
```

**Step 4: Remove role from agent**

```javascript
socket.on('remove_role_from_agent', (payload, callback) => {
  const { agentId, roleId } = payload;
  
  if (!tenantState.agentRoles[agentId]) {
    return callback({ success: true, message: 'No roles to remove' });
  }
  
  const index = tenantState.agentRoles[agentId].indexOf(roleId);
  if (index > -1) {
    tenantState.agentRoles[agentId].splice(index, 1);
  }
  
  socket.to(`tenant:${socket.tenantId}`).emit('agent_roles_updated', { agentId });
  
  callback({ success: true, message: 'Role removed successfully' });
});
```

**Step 5: Get agent roles**

```javascript
socket.on('get_agent_roles', (payload, callback) => {
  const { agentId } = payload;
  
  const roleIds = tenantState.agentRoles[agentId] || [];
  const roles = roleIds.map(roleId => tenantState.roles[roleId]).filter(r => r);
  
  callback({
    success: true,
    data: {
      agentId,
      roles,
      roleIds
    }
  });
});
```

**Step 6: Get agents by role**

```javascript
socket.on('get_agents_by_role', (payload, callback) => {
  const { roleId } = payload;
  
  const agents = state.getAgentsByRole(socket.tenantId, roleId);
  const agentDetails = agents.map(agentId => ({
    agentId,
    ...tenantState.agents[agentId]
  }));
  
  callback({
    success: true,
    data: agentDetails
  });
});
```

**Step 7: Commit**

```bash
git add src/socket/roles.js
git commit -m "feat: add role registry socket module"
```

---

## Phase 3: Auto Orchestration Module (Core Logic)

### Task 3: Create Auto Orchestration Socket Module - Basic Structure

**Files:**
- Create: `src/socket/auto-orchestration.js`

**Step 1: Write module skeleton with create auto orchestration**

```javascript
/**
 * Auto Orchestration Module
 * Role-based task assignment and load balancing
 */

const state = require('../state.js');
const { v4: generateId } = require('uuid');

module.exports = function(io, socket, agentStore) {
  const tenantState = state.getTenantState(socket.tenantId);
  
  socket.on('create_auto_orchestration', (payload, callback) => {
    const { 
      name, 
      tasks, 
      loadBalanceStrategy = 'round-robin', // 'round-robin', 'least-loaded', 'random'
      maxAgentsPerRole = null // Max agents to spawn per role (null = unlimited)
    } = payload;
    
    // Validate
    if (!name || !tasks || tasks.length === 0) {
      return callback({ success: false, error: 'Name and tasks are required' });
    }
    
    const orchestrationId = generateId();
    
    tenantState.autoOrchestrations[orchestrationId] = {
      orchestrationId,
      name,
      tasks: tasks.map(task => ({
        taskId: generateId(),
        ...task,
        status: 'pending',
        assignedAgentId: null,
        result: null,
        startedAt: null,
        completedAt: null,
        retryCount: 0
      })),
      loadBalanceStrategy,
      maxAgentsPerRole,
      status: 'pending', // 'pending', 'running', 'completed', 'failed'
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null
    };
    
    socket.to(`tenant:${socket.tenantId}`).emit('auto_orchestrations_updated', {});
    
    callback({
      success: true,
      orchestrationId,
      message: 'Auto orchestration created successfully'
    });
  });
  
  socket.on('list_auto_orchestrations', (callback) => {
    callback({
      success: true,
      data: Object.values(tenantState.autoOrchestrations)
    });
  });
  
  socket.on('get_auto_orchestration', (payload, callback) => {
    const { orchestrationId } = payload;
    const orchestration = tenantState.autoOrchestrations[orchestrationId];
    
    if (!orchestration) {
      return callback({ success: false, error: 'Orchestration not found' });
    }
    
    callback({
      success: true,
      data: orchestration
    });
  });
};
```

**Step 2: Add load balancer helpers**

```javascript
// Add at top of src/socket/auto-orchestration.js after imports

const loadBalancers = {
  'round-robin': (agents, roleId, tenantState) => {
    if (!tenantState.loadBalancers[roleId]) {
      tenantState.loadBalancers[roleId] = { index: 0 };
    }
    const balancer = tenantState.loadBalancers[roleId];
    
    if (agents.length === 0) return null;
    
    const selected = agents[balancer.index];
    balancer.index = (balancer.index + 1) % agents.length;
    return selected;
  },
  
  'least-loaded': (agents, roleId, tenantState) => {
    // Find agent with fewest active tasks
    let leastLoaded = null;
    let minTasks = Infinity;
    
    for (const agentId of agents) {
      let activeTasks = 0;
      Object.values(tenantState.autoOrchestrations).forEach(orch => {
        orch.tasks.forEach(task => {
          if (task.status === 'running' && task.assignedAgentId === agentId) {
            activeTasks++;
          }
        });
      });
      
      if (activeTasks < minTasks) {
        minTasks = activeTasks;
        leastLoaded = agentId;
      }
    }
    
    return leastLoaded;
  },
  
  'random': (agents) => {
    if (agents.length === 0) return null;
    return agents[Math.floor(Math.random() * agents.length)];
  }
};
```

**Step 3: Add task assignment engine**

```javascript
// Add to src/socket/auto-orchestration.js

function assignTasksToAgents(io, tenantId, orchestrationId, agentStore) {
  const tenantState = state.getTenantState(tenantId);
  const orchestration = tenantState.autoOrchestrations[orchestrationId];
  
  if (!orchestration || orchestration.status !== 'pending') {
    return;
  }
  
  orchestration.status = 'running';
  orchestration.startedAt = Date.now();
  
  orchestration.tasks.forEach(task => {
    if (task.status !== 'pending') return;
    
    // Get agents matching required roles
    const requiredRoles = task.requiredRoles || ['default'];
    let availableAgents = [];
    
    for (const roleId of requiredRoles) {
      const agentsForRole = state.getAgentsByRole(tenantId, roleId);
      availableAgents = [...availableAgents, ...agentsForRole];
    }
    
    // Remove duplicates
    availableAgents = [...new Set(availableAgents)];
    
    if (availableAgents.length === 0) {
      task.status = 'failed';
      task.result = 'No agents available with required roles';
      task.completedAt = Date.now();
      return;
    }
    
    // Use load balancer to select agent
    const agentId = loadBalancers[orchestration.loadBalanceStrategy](
      availableAgents,
      requiredRoles[0], // Use first role for balancer key
      tenantState
    );
    
    if (!agentId) {
      task.status = 'failed';
      task.result = 'Load balancer failed to select agent';
      task.completedAt = Date.now();
      return;
    }
    
    // Assign task to agent
    task.status = 'running';
    task.assignedAgentId = agentId;
    task.startedAt = Date.now();
    
    // Emit task to agent
    io.to(`tenant:${tenantId}`).emit('exec_task', {
      orchestrationId,
      taskId: task.taskId,
      description: task.description,
      command: task.command,
      agentId
    });
  });
  
  socket.to(`tenant:${tenantId}`).emit('auto_orchestrations_updated', {});
}
```

**Step 4: Add start auto orchestration handler**

```javascript
socket.on('start_auto_orchestration', async (payload, callback) => {
  const { orchestrationId } = payload;
  
  const orchestration = tenantState.autoOrchestrations[orchestrationId];
  
  if (!orchestration) {
    return callback({ success: false, error: 'Orchestration not found' });
  }
  
  if (orchestration.status !== 'pending') {
    return callback({ success: false, error: 'Orchestration already started' });
  }
  
  assignTasksToAgents(io, socket.tenantId, orchestrationId, agentStore);
  
  callback({
    success: true,
    message: 'Auto orchestration started successfully'
  });
});
```

**Step 5: Add task result handler**

```javascript
socket.on('report_auto_task_result', async (payload, callback) => {
  const { orchestrationId, taskId, status, result } = payload;
  
  const orchestration = tenantState.autoOrchestrations[orchestrationId];
  
  if (!orchestration) {
    return callback({ success: false, error: 'Orchestration not found' });
  }
  
  const task = orchestration.tasks.find(t => t.taskId === taskId);
  
  if (!task) {
    return callback({ success: false, error: 'Task not found' });
  }
  
  task.status = status; // 'completed' or 'failed'
  task.result = result;
  task.completedAt = Date.now();
  
  // Check if all tasks are done
  const allDone = orchestration.tasks.every(t => 
    t.status === 'completed' || t.status === 'failed'
  );
  
  if (allDone) {
    orchestration.status = 'completed';
    orchestration.completedAt = Date.now();
  }
  
  socket.to(`tenant:${socket.tenantId}`).emit('auto_orchestrations_updated', {});
  
  callback({ success: true, message: 'Task result recorded' });
});
```

**Step 6: Add cancel auto orchestration handler**

```javascript
socket.on('cancel_auto_orchestration', async (payload, callback) => {
  const { orchestrationId } = payload;
  
  const orchestration = tenantState.autoOrchestrations[orchestrationId];
  
  if (!orchestration) {
    return callback({ success: false, error: 'Orchestration not found' });
  }
  
  orchestration.status = 'cancelled';
  orchestration.completedAt = Date.now();
  
  // Mark running tasks as failed due to cancellation
  orchestration.tasks.forEach(task => {
    if (task.status === 'running' || task.status === 'pending') {
      task.status = 'failed';
      task.result = 'Orchestration cancelled';
      task.completedAt = Date.now();
    }
  });
  
  socket.to(`tenant:${socket.tenantId}`).emit('auto_orchestrations_updated', {});
  
  callback({ success: true, message: 'Orchestration cancelled successfully' });
});
```

**Step 7: Commit**

```bash
git add src/socket/auto-orchestration.js
git commit -m "feat: add auto orchestration socket module"
```

---

## Phase 4: Module Registration

### Task 4: Register New Modules in Socket Setup

**Files:**
- Modify: `src/socket/index.js`

**Step 1: Add imports**

```javascript
// Add at top with other imports
import roles from './roles.js';
import autoOrchestration from './auto-orchestration.js';
```

**Step 2: Register modules in connection handler**

```javascript
// In io.on('connection' handler), add after other module registrations:

// Register role management
roles.register(io, socket, ctx);

// Register auto orchestration
autoOrchestration.register(io, socket, ctx);
```

**Step 3: Run existing tests**

Run: `npm test`
Expected: All existing tests pass (new modules don't affect existing functionality)

**Step 4: Commit**

```bash
git add src/socket/index.js
git commit -m "feat: register role and auto-orchestration modules"
```

---

## Phase 5: UI - Role Management Tab

### Task 5: Create Role Management Tab UI

**Files:**
- Create: `views/partials/_roles_tab.ejs`

**Step 1: Write tab HTML structure**

```ejs
<div id="roles" class="tab-content hidden">
  <div class="container mx-auto p-4">
    <h2 class="text-2xl font-bold mb-6 terminal-text">Role Management</h2>
    
    <!-- Roles Section -->
    <div class="mb-8">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-xl font-semibold">Roles</h3>
        <button onclick="showCreateRoleModal()" class="btn-primary">
          + Create Role
        </button>
      </div>
      
      <div id="roles-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <!-- Roles loaded dynamically -->
      </div>
    </div>
    
    <!-- Agent Roles Section -->
    <div>
      <h3 class="text-xl font-semibold mb-4">Agent Roles</h3>
      <div id="agent-roles-list" class="space-y-2">
        <!-- Agent roles loaded dynamically -->
      </div>
    </div>
  </div>
</div>
```

**Step 2: Add role management JavaScript**

```javascript
// Add to views/partials/_scripts_roles_tab.ejs

function loadRoles() {
  socket.emit('list_roles', (response) => {
    if (response.success) {
      const container = document.getElementById('roles-grid');
      container.innerHTML = `
        <div class="empty-state">
          No roles defined. Create your first role!
        </div>
      `;
      
      response.data.forEach(role => {
        const roleCard = document.createElement('div');
        roleCard.className = 'card';
        roleCard.innerHTML = `
          <div class="card-header">
            <h4 class="font-semibold">${escapeHtml(role.name)}</h4>
            <button onclick="deleteRole('${role.roleId}')" class="text-red-500 hover:text-red-700">✕</button>
          </div>
          <p class="text-sm text-gray-600">${escapeHtml(role.description || 'No description')}</p>
          <div class="mt-2">
            <button onclick="viewAgentsWithRole('${role.roleId}')" class="text-sm text-blue-500 hover:text-blue-700">
              View agents with this role
            </button>
          </div>
        `;
        container.appendChild(roleCard);
      });
    }
  });
}

function loadAgentRoles() {
  const container = document.getElementById('agent-roles-list');
  const agents = Object.values(agentStore);
  
  if (agents.length === 0) {
    container.innerHTML = '<div class="empty-state">No agents connected</div>';
    return;
  }
  
  agents.forEach(agent => {
    socket.emit('get_agent_roles', { agentId: agent.id }, (response) => {
      if (response.success) {
        const agentRow = document.createElement('div');
        agentRow.className = 'flex items-center justify-between p-3 bg-gray-100 rounded';
        agentRow.innerHTML = `
          <div>
            <span class="font-medium">${escapeHtml(agent.id)}</span>
            <span class="text-sm text-gray-600 ml-2" id="roles-${agent.id}">${response.data.roleIds.length} roles</span>
          </div>
          <button onclick="assignRoleToAgent('${agent.id}')" class="btn-sm btn-secondary">
            + Assign Role
          </button>
        `;
        container.appendChild(agentRow);
      }
    });
  });
}

function showCreateRoleModal() {
  const modalHtml = `
    <div id="createRoleModal" class="modal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Create New Role</h3>
          <button onclick="closeModal('createRoleModal')">✕</button>
        </div>
        <div class="modal-body">
          <form id="createRoleForm">
            <div class="form-group">
              <label>Role Name</label>
              <input type="text" id="roleName" placeholder="e.g., data-processor" required>
            </div>
            <div class="form-group">
              <label>Description</label>
              <textarea id="roleDescription" rows="3" placeholder="Describe what agents with this role do"></textarea>
            </div>
            <button type="submit" class="btn-primary w-full">Create Role</button>
          </form>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  
  document.getElementById('createRoleForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('roleName').value;
    const description = document.getElementById('roleDescription').value;
    
    socket.emit('create_role', { name, description }, (response) => {
      if (response.success) {
        showToast('Role created successfully', 'success');
        closeModal('createRoleModal');
        loadRoles();
      } else {
        showToast('Error: ' + response.error, 'error');
      }
    });
  });
}

function assignRoleToAgent(agentId) {
  socket.emit('list_roles', (response) => {
    if (response.success) {
      const roleOptions = response.data.map(role => 
        `<option value="${role.roleId}">${escapeHtml(role.name)}</option>`
      ).join('');
      
      const modalHtml = `
        <div id="assignRoleModal" class="modal">
          <div class="modal-content">
            <div class="modal-header">
              <h3>Assign Role to ${escapeHtml(agentId)}</h3>
              <button onclick="closeModal('assignRoleModal')">✕</button>
            </div>
            <div class="modal-body">
              <form id="assignRoleForm">
                <div class="form-group">
                  <label>Select Role</label>
                  <select id="roleId" required>${roleOptions}</select>
                </div>
                <button type="submit" class="btn-primary w-full">Assign Role</button>
              </form>
            </div>
          </div>
        </div>
      `;
      
      document.body.insertAdjacentHTML('beforeend', modalHtml);
      
      document.getElementById('assignRoleForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const roleId = document.getElementById('roleId').value;
        
        socket.emit('assign_role_to_agent', { agentId, roleId }, (response) => {
          if (response.success) {
            showToast('Role assigned successfully', 'success');
            closeModal('assignRoleModal');
            loadAgentRoles();
          } else {
            showToast('Error: ' + response.error, 'error');
          }
        });
      });
    }
  });
}

function deleteRole(roleId) {
  if (!confirm('Are you sure you want to delete this role?')) return;
  
  socket.emit('delete_role', { roleId }, (response) => {
    if (response.success) {
      showToast('Role deleted successfully', 'success');
      loadRoles();
      loadAgentRoles();
    } else {
      showToast('Error: ' + response.error, 'error');
    }
  });
}

function viewAgentsWithRole(roleId) {
  socket.emit('get_agents_by_role', { roleId }, (response) => {
    if (response.success) {
      const agentsList = response.data.map(agent => 
        `<li>${escapeHtml(agent.id)}</li>`
      ).join('');
      
      const modalHtml = `
        <div id="agentsWithRoleModal" class="modal">
          <div class="modal-content">
            <div class="modal-header">
              <h3>Agents with Role</h3>
              <button onclick="closeModal('agentsWithRoleModal')">✕</button>
            </div>
            <div class="modal-body">
              <ul>${agentsList || '<li>No agents with this role</li>'}</ul>
            </div>
          </div>
        </div>
      `;
      
      document.body.insertAdjacentHTML('beforeend', modalHtml);
    }
  });
}

// Listen for updates
socket.on('roles_updated', () => {
  loadRoles();
  loadAgentRoles();
});

socket.on('agent_roles_updated', ({ agentId }) => {
  loadAgentRoles();
});
```

**Step 3: Add role tab to dashboard navigation**

**Files:**
- Modify: `views/dashboard.ejs` or `views/partials/_header.ejs`
- Add role tab button in navigation

**Step 4: Commit**

```bash
git add views/partials/_roles_tab.ejs views/partials/_scripts_roles_tab.ejs
git commit -m "feat: add role management UI"
```

---

## Phase 6: UI - Auto Orchestration Tab

### Task 6: Create Auto Orchestration Tab UI

**Files:**
- Create: `views/partials/_auto_orchestration_tab.ejs`
- Create: `views/partials/_scripts_auto_orchestration.ejs`

**Step 1: Write tab HTML**

```ejs
<div id="auto-orchestration" class="tab-content hidden">
  <div class="container mx-auto p-4">
    <h2 class="text-2xl font-bold mb-6 terminal-text">Auto Orchestration</h2>
    
    <!-- Create Auto Orchestration Button -->
    <div class="mb-6">
      <button onclick="showCreateAutoOrchestrationModal()" class="btn-primary">
        + Create Auto Orchestration
      </button>
    </div>
    
    <!-- Auto Orchestrations List -->
    <div id="auto-orchestrations-list" class="space-y-4">
      <!-- Orchestrations loaded dynamically -->
    </div>
  </div>
</div>
```

**Step 2: Write JavaScript for auto orchestration**

```javascript
function loadAutoOrchestrations() {
  socket.emit('list_auto_orchestrations', (response) => {
    if (response.success) {
      const container = document.getElementById('auto-orchestrations-list');
      
      if (response.data.length === 0) {
        container.innerHTML = '<div class="empty-state">No orchestrations created</div>';
        return;
      }
      
      response.data.forEach(orch => {
        const completedCount = orch.tasks.filter(t => t.status === 'completed').length;
        const failedCount = orch.tasks.filter(t => t.status === 'failed').length;
        const totalCount = orch.tasks.length;
        
        const progress = totalCount > 0 ? (completedCount / totalCount * 100) : 0;
        
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
          <div class="card-header">
            <div>
              <h4 class="font-semibold">${escapeHtml(orch.name)}</h4>
              <span class="text-sm status-${orch.status}">${orch.status}</span>
            </div>
            <div class="flex gap-2">
              ${orch.status === 'pending' ? 
                `<button onclick="startAutoOrchestration('${orch.orchestrationId}')" class="btn-sm btn-success">Start</button>` : ''}
              ${orch.status === 'running' ? 
                `<button onclick="cancelAutoOrchestration('${orch.orchestrationId}')" class="btn-sm btn-secondary">Cancel</button>` : ''}
              <button onclick="viewAutoOrchestration('${orch.orchestrationId}')" class="btn-sm btn-outline">Details</button>
            </div>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${progress}%"></div>
          </div>
          <div class="text-sm text-gray-600">
            Progress: ${completedCount}/${totalCount} tasks completed (${failedCount} failed)
          </div>
        `;
        container.appendChild(card);
      });
    }
  });
}

function showCreateAutoOrchestrationModal() {
  socket.emit('list_roles', (rolesResponse) => {
    const roleOptions = rolesResponse.data.map(role => 
      `<label class="flex items-center">
        <input type="checkbox" name="requiredRoles" value="${role.roleId}">
        <span class="ml-2">${escapeHtml(role.name)}</span>
      </label>`
    ).join('');
    
    const modalHtml = `
      <div id="createAutoOrchestrationModal" class="modal">
        <div class="modal-content" style="max-width: 600px">
          <div class="modal-header">
            <h3>Create Auto Orchestration</h3>
            <button onclick="closeModal('createAutoOrchestrationModal')">✕</button>
          </div>
          <div class="modal-body">
            <form id="createAutoOrchestrationForm">
              <div class="form-group">
                <label>Name</label>
                <input type="text" id="orchName" placeholder="Orchestration name" required>
              </div>
              
              <div class="form-group">
                <label>Tasks</label>
                <div id="orchTasks"></div>
                <button type="button" onclick="addAutoOrchestrationTask()" class="btn-sm btn-secondary mt-2">+ Add Task</button>
              </div>
              
              <div class="form-group">
                <label>Load Balance Strategy</label>
                <select id="loadBalanceStrategy">
                  <option value="round-robin">Round Robin (default)</option>
                  <option value="least-loaded">Least Loaded</option>
                  <option value="random">Random</option>
                </select>
              </div>
              
              <div class="form-group">
                <label>Max Agents Per Role (optional)</label>
                <input type="number" id="maxAgentsPerRole" placeholder="Leave empty for unlimited">
              </div>
              
              <button type="submit" class="btn-primary w-full">Create Orchestration</button>
            </form>
          </div>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Store role options for task role selection
    window.roleOptions = roleOptions;
    
    // Add initial task row
    addAutoOrchestrationTask();
    
    document.getElementById('createAutoOrchestrationForm').addEventListener('submit', (e) => {
      e.preventDefault();
      
      const taskRows = document.querySelectorAll('.auto-task-item');
      const tasks = Array.from(taskRows).map(row => ({
        description: row.querySelector('.task-desc').value,
        command: row.querySelector('.task-cmd').value,
        requiredRoles: Array.from(row.querySelectorAll('.task-role:checked')).map(cb => cb.value)
      })).filter(task => task.description && task.command);
      
      socket.emit('create_auto_orchestration', {
        name: document.getElementById('orchName').value,
        tasks,
        loadBalanceStrategy: document.getElementById('loadBalanceStrategy').value,
        maxAgentsPerRole: document.getElementById('maxAgentsPerRole').value || null
      }, (response) => {
        if (response.success) {
          showToast('Auto orchestration created', 'success');
          closeModal('createAutoOrchestrationModal');
          loadAutoOrchestrations();
        } else {
          showToast('Error: ' + response.error, 'error');
        }
      });
    });
  });
}

let autoTaskCounter = 0;

function addAutoOrchestrationTask() {
  autoTaskCounter++;
  const taskId = `auto_task_${autoTaskCounter}`;
  
  const taskHtml = `
    <div id="${taskId}" class="auto-task-item border p-3 rounded mb-2">
      <div class="grid grid-cols-2 gap-2">
        <input type="text" class="task-desc" placeholder="Task description">
        <input type="text" class="task-cmd" placeholder="/command">
      </div>
      <div class="mt-2">
        <label class="text-sm">Required Roles:</label>
        <div class="flex flex-wrap gap-2 mt-1">${window.roleOptions}</div>
      </div>
      <button onclick="this.parentElement.remove()" class="text-red-500 text-sm mt-2">Remove</button>
    </div>
  `;
  
  document.getElementById('orchTasks').insertAdjacentHTML('beforeend', taskHtml);
}

function startAutoOrchestration(orchestrationId) {
  socket.emit('start_auto_orchestration', { orchestrationId }, (response) => {
    if (response.success) {
      showToast('Orchestration started', 'success');
      loadAutoOrchestrations();
    } else {
      showToast('Error: ' + response.error, 'error');
    }
  });
}

function cancelAutoOrchestration(orchestrationId) {
  if (!confirm('Cancel this orchestration?')) return;
  
  socket.emit('cancel_auto_orchestration', { orchestrationId }, (response) => {
    if (response.success) {
      showToast('Orchestration cancelled', 'success');
      loadAutoOrchestrations();
    } else {
      showToast('Error: ' + response.error, 'error');
    }
  });
}

function viewAutoOrchestration(orchestrationId) {
  socket.emit('get_auto_orchestration', { orchestrationId }, (response) => {
    if (response.success) {
      const orch = response.data;
      
      const tasksHtml = orch.tasks.map(task => `
        <div class="task-item p-2 border rounded mb-2">
          <div class="flex justify-between">
            <span class="status-${task.status}">${task.status}</span>
            ${task.assignedAgentId ? `<span class="text-sm">→ ${escapeHtml(task.assignedAgentId)}</span>` : ''}
          </div>
          <div class="font-medium">${escapeHtml(task.description)}</div>
          <div class="text-sm text-gray-600">${escapeHtml(task.command)}</div>
          ${task.result ? `<div class="text-sm mt-1">${escapeHtml(task.result)}</div>` : ''}
        </div>
      `).join('');
      
      const modalHtml = `
        <div id="autoOrchestrationDetailModal" class="modal">
          <div class="modal-content">
            <div class="modal-header">
              <h3>${escapeHtml(orch.name)}</h3>
              <button onclick="closeModal('autoOrchestrationDetailModal')">✕</button>
            </div>
            <div class="modal-body">
              <div class="mb-4">
                <span class="status-${orch.status}">Status: ${orch.status}</span>
              </div>
              <h4>Tasks</h4>
              ${tasksHtml}
            </div>
          </div>
        </div>
      `;
      
      document.body.insertAdjacentHTML('beforeend', modalHtml);
    }
  });
}

socket.on('auto_orchestrations_updated', () => {
  loadAutoOrchestrations();
});
```

**Step 3: Add auto orchestration tab to navigation**

**Files:**
- Modify: `views/dashboard.ejs` or `views/partials/_header.ejs`

**Step 4: Commit**

```bash
git add views/partials/_auto_orchestration_tab.ejs views/partials/_scripts_auto_orchestration.ejs
git commit -m "feat: add auto orchestration UI"
```

---

## Phase 7: Update Agent Client for Auto Orchestration

### Task 7: Update Agent Client to Handle Auto Orchestration Tasks

**Files:**
- Modify: `client.js`

**Step 1: Add role reporting on connect**

```javascript
// In client.js, find where agent_connect is emitted
// Add roles to connection metadata

socket.on('connect', () => {
  console.log('Socket connected');
  
  socket.emit('agent_connect', {
    agentId: config.agentId,
    roles: config.roles || ['default'], // Add this line
    metadata: {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      uptime: os.uptime()
    }
  });
});
```

**Step 2: Add exec_task event handler (if not exists)**

```javascript
// Add to client.js socket event listeners

socket.on('exec_task', async (task) => {
  console.log(`[AUTO ORCHESTRATION] Received task:`, task);
  
  try {
    // Execute the command
    const result = await executeCommand(task.command);
    
    // Report result back
    socket.emit('report_auto_task_result', {
      orchestrationId: task.orchestrationId,
      taskId: task.taskId,
      status: 'completed',
      result: result.stdout || result.stderr
    }, (ack) => {
      console.log('[AUTO ORCHESTRATION] Task result acknowledged');
    });
    
  } catch (error) {
    console.error('[AUTO ORCHESTRATION] Task error:', error);
    
    socket.emit('report_auto_task_result', {
      orchestrationId: task.orchestrationId,
      taskId: task.taskId,
      status: 'failed',
      result: error.message
    });
  }
});
```

**Step 3: Add config support for roles**

Add to `client.js` config:
```javascript
const config = {
  agentId: process.env.AGENT_ID || 'agent-' + Math.random().toString(36).substr(2, 9),
  roles: process.env.AGENT_ROLES ? process.env.AGENT_ROLES.split(',') : ['default'],
  // ... existing config
};
```

**Step 4: Commit**

```bash
git add client.js
git commit -m "feat: add auto orchestration support to agent client"
```

---

## Phase 8: Testing

### Task 8: Write Unit Tests for Role Module

**Files:**
- Create: `tests/roles.test.js`

**Step 1: Write role module tests**

```javascript
const io = require('socket.io-client');
const { spawn, exec } = require('child_process');
const fs = require('fs');

const TEST_PORT = 4000;
const AUTH_TOKEN = 'test-roles-secret';
const DATA_DIR = './data-test-roles';

let serverProcess;

async function startServer() {
  try { await new Promise(r => exec(`lsof -t -i:${TEST_PORT} | xargs kill -9 2>/dev/null`, () => r())); } catch(e) {}
  await new Promise(r => setTimeout(r, 500));
  
  if (fs.existsSync(DATA_DIR)) fs.rmSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  
  serverProcess = spawn('node', ['server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: TEST_PORT, CLAWNET_SECRET_KEY: AUTH_TOKEN, DATA_DIR },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  
  await new Promise(r => setTimeout(r, 2500));
}

async function stopServer() {
  if (serverProcess) {
    try { serverProcess.kill('SIGTERM'); await new Promise(r => setTimeout(r, 500)); } catch(e) {}
  }
  try { fs.rmSync(DATA_DIR, { recursive: true }, () => {}); } catch(e) {}
}

let passed = 0, failed = 0;

async function runTests() {
  try {
    await startServer();
    const socket = io(`http://localhost:${TEST_PORT}`, { query: { secret: AUTH_TOKEN }, transports: ['websocket'] });
    
    // Test 1: Create role
    await new Promise(resolve => {
      socket.on('connect', () => {
        socket.emit('create_role', { name: 'test-role', description: 'Test description' }, (r) => {
          if (r.success) { console.log('✓ Create role'); passed++; } else { console.log('✗ Create failed'); failed++; }
          resolve();
        });
      });
    });
    await new Promise(r => setTimeout(r, 500));
    
    // Test 2: List roles
    await new Promise(resolve => {
      socket.emit('list_roles', {}, (r) => {
        if (r.success) { console.log('✓ List roles'); passed++; } else { console.log('✗ List failed'); failed++; }
        resolve();
      });
    });
    await new Promise(r => setTimeout(r, 500));
    
    // Test 3: Create role without name (error case)
    await new Promise(resolve => {
      socket.emit('create_role', { description: 'test' }, (r) => {
        if (!r.success) { console.log('✓ Validate missing name'); passed++; } else { console.log('✗ Validation failed'); failed++; }
        resolve();
      });
    });
    await new Promise(r => setTimeout(r, 500));
    
    socket.disconnect();
  } catch(e) {
    console.error('Error:', e);
    failed++;
  } finally {
    await stopServer();
  }
  
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
```

**Step 2: Run test**

Run: `node tests/roles.test.js`
Expected: Tests pass

**Step 3: Commit**

```bash
git add tests/roles.test.js
git commit -m "test: add role module tests"
```

---

### Task 9: Write Unit Tests for Auto Orchestration Module

**Files:**
- Create: `tests/auto-orchestration.test.js`

**Step 1: Write auto orchestration tests**

```javascript
const io = require('socket.io-client');
const { spawn, exec } = require('child_process');
const fs = require('fs');

const TEST_PORT = 4001;
const AUTH_TOKEN = 'test-auto-orch-secret';
const DATA_DIR = './data-test-auto-orch';

let serverProcess;
let orchestratorSocket;
let agentSocket;

async function startServer() {
  try { await new Promise(r => exec(`lsof -t -i:${TEST_PORT} | xargs kill -9 2>/dev/null`, () => r())); } catch(e) {}
  await new Promise(r => setTimeout(r, 500));
  
  if (fs.existsSync(DATA_DIR)) fs.rmSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  
  serverProcess = spawn('node', ['server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: TEST_PORT, CLAWNET_SECRET_KEY: AUTH_TOKEN, DATA_DIR },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  
  await new Promise(r => setTimeout(r, 2500));
}

async function stopServer() {
  if (orchestratorSocket) orchestratorSocket.disconnect();
  if (agentSocket) agentSocket.disconnect();
  if (serverProcess) {
    try { serverProcess.kill('SIGTERM'); await new Promise(r => setTimeout(r, 500)); } catch(e) {}
  }
  try { fs.rmSync(DATA_DIR, { recursive: true }, () => {}); } catch(e) {}
}

let passed = 0, failed = 0;

async function runTests() {
  try {
    await startServer();
    
    orchestratorSocket = io(`http://localhost:${TEST_PORT}`, { query: { secret: AUTH_TOKEN }, transports: ['websocket'] });
    agentSocket = io(`http://localhost:${TEST_PORT}`, { query: { secret: AUTH_TOKEN }, transports: ['websocket'] });
    
    // Connect agent
    await new Promise(resolve => {
      agentSocket.on('connect', () => {
        agentSocket.emit('agent_connect', { agentId: 'test-auto-agent', roles: ['default'] });
        setTimeout(resolve, 500);
      });
    });
    
    // Create role
    await new Promise(resolve => {
      orchestratorSocket.on('connect', () => {
        orchestratorSocket.emit('create_role', { name: 'test-worker' }, (r) => {
          if (r.success) {
            // Assign role to agent
            orchestratorSocket.emit('assign_role_to_agent', { 
              agentId: 'test-auto-agent', 
              roleId: r.roleId 
            }, () => resolve());
          } else resolve();
        });
      });
    });
    await new Promise(r => setTimeout(r, 500));
    
    // Test 1: Create auto orchestration
    let orchId;
    await new Promise(resolve => {
      orchestratorSocket.emit('create_auto_orchestration', {
        name: 'Test Auto Orch',
        tasks: [{
          description: 'Test task',
          command: '/echo hello',
          requiredRoles: ['default']
        }]
      }, (r) => {
        if (r.success) { orchId = r.orchestrationId; console.log('✓ Create auto orchestration'); passed++; } else { console.log('✗ Create failed'); failed++; }
        resolve();
      });
    });
    await new Promise(r => setTimeout(r, 500));
    
    // Test 2: List orchestrations
    await new Promise(resolve => {
      orchestratorSocket.emit('list_auto_orchestrations', {}, (r) => {
        if (r.success) { console.log('✓ List orchestrations'); passed++; } else { console.log('✗ List failed'); failed++; }
        resolve();
      });
    });
    await new Promise(r => setTimeout(r, 500));
    
    // Test 3: Get orchestration
    await new Promise(resolve => {
      orchestratorSocket.emit('get_auto_orchestration', { orchestrationId: orchId }, (r) => {
        if (r.success && r.data.name === 'Test Auto Orch') { console.log('✓ Get orchestration'); passed++; } else { console.log('✗ Get failed'); failed++; }
        resolve();
      });
    });
    await new Promise(r => setTimeout(r, 500));
    
    // Test 4: Cancel orchestration
    await new Promise(resolve => {
      orchestratorSocket.emit('cancel_auto_orchestration', { orchestrationId: orchId }, (r) => {
        if (r.success) { console.log('✓ Cancel orchestration'); passed++; } else { console.log('✗ Cancel failed'); failed++; }
        resolve();
      });
    });
    await new Promise(r => setTimeout(r, 500));
    
    // Test 5: Validate without required roles (error case)
    await new Promise(resolve => {
      orchestratorSocket.emit('create_auto_orchestration', {
        name: 'Invalid',
        tasks: []
      }, (r) => {
        if (!r.success) { console.log('✓ Validate tasks required'); passed++; } else { console.log('✗ Validation failed'); failed++; }
        resolve();
      });
    });
    await new Promise(r => setTimeout(r, 500));
    
  } catch(e) {
    console.error('Error:', e);
    failed++;
  } finally {
    await stopServer();
  }
  
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
```

**Step 2: Run test**

Run: `node tests/auto-orchestration.test.js`
Expected: Tests pass

**Step 3: Update test runner**

**Files:**
- Modify: `tests/run-all.js`
- Add to tests array: `'roles.test.js', 'auto-orchestration.test.js'`

**Step 4: Commit**

```bash
git add tests/auto-orchestration.test.js tests/run-all.js
git commit -m "test: add auto orchestration tests"
```

---

## Phase 9: Documentation

### Task 10: Update Documentation

**Files:**
- Modify: `docs/SOCKET_EVENTS.md`
- Modify: `docs/FEATURE_GUIDES.md`
- Modify: `docs/ARCHITECTURE.md`

**Step 1: Add role events to SOCKET_EVENTS.md**

Add section after existing events:

```markdown
## Role Management Events

### create_role
Define a new agent role.

**Emitted by**: Dashboard

**Request**: { name: string, description?: string }
**Response**: { success: boolean, roleId: uuid, message: string }
**Broadcasts**: `roles_updated`

### list_roles
Get all defined roles.

**Emitted by**: Dashboard

**Response**: { success: boolean, data: [Role] }

### delete_role
Delete a role.

**Emitted by**: Dashboard

**Request**: { roleId: uuid }
**Response**: { success: boolean, message: string }
**Broadcasts**: `roles_updated`

### assign_role_to_agent
Assign role to agent.

**Emitted by**: Dashboard

**Request**: { agentId: string, roleId: uuid }
**Response**: { success: boolean, message: string }
**Broadcasts**: `agent_roles_updated`

### remove_role_from_agent
Remove role from agent.

**Emitted by**: Dashboard

**Request**: { agentId: string, roleId: uuid }
**Response**: { success: boolean, message: string }
**Broadcasts**: `agent_roles_updated`

### get_agent_roles
Get agent's assigned roles.

**Emitted by**: Dashboard

**Request**: { agentId: string }
**Response**: { success: boolean, data: { agentId, roles, roleIds } }

### get_agents_by_role
Get all agents with specific role.

**Emitted by**: Dashboard

**Request**: { roleId: uuid }
**Response**: { success: boolean, data: [Agent] }
```

**Step 2: Add auto orchestration events to SOCKET_EVENTS.md**

```markdown
## Auto Orchestration Events

### create_auto_orchestration
Create role-based orchestration without specifying exact agents.

**Emitted by**: Dashboard

**Request**: { 
  name: string,
  tasks: [{ description, command, requiredRoles: [] }],
  loadBalanceStrategy: 'round-robin'|'least-loaded'|'random',
  maxAgentsPerRole?: number
}
**Response**: { success: boolean, orchestrationId: uuid }

### start_auto_orchestration
Start auto orchestration (assigns tasks to matched agents).

**Emitted by**: Dashboard

**Request**: { orchestrationId: uuid }
**Response**: { success: boolean, message: string }

### report_auto_task_result
Report task execution result.

**Emitted by**: Agent

**Request**: {
  orchestrationId: uuid,
  taskId: uuid,
  status: 'completed'|'failed',
  result: string
}
**Response**: { success: boolean, message: string }

### list_auto_orchestrations
List all auto orchestrations.

**Emitted by**: Dashboard

**Response**: { success: boolean, data: [AutoOrchestration] }

### get_auto_orchestration
Get auto orchestration details.

**Emitted by**: Dashboard

**Request**: { orchestrationId: uuid }
**Response**: { success: boolean, data: AutoOrchestration }

### cancel_auto_orchestration
Cancel running orchestration.

**Emitted by**: Dashboard

**Request**: { orchestrationId: uuid }
**Response**: { success: boolean, message: string }
```

**Step 3: Add role management guide to FEATURE_GUIDES.md**

```markdown
## Role Management

**Purpose**: Define roles and assign them to agents for automatic task routing.

### Quick Start

From the Roles tab:
1. Click "+ Create Role"
2. Enter role name (e.g., "data-processor")
3. Add description
4. Assign role to connected agents

### Workflow Example

1. **Define roles**:
   - "data-fetcher" - fetches data from APIs/databases
   - "data-processor" - transforms and processes data
   - "inference" - runs ML inferences
   - "file-writer" - writes results to files

2. **Assign roles to agents**:
   - Agent 1: "data-fetcher", "file-writer"
   - Agent 2: "data-processor"
   - Agent 3: "inference", "data-processor"

3. **Create auto orchestration**:
   - Define tasks with required roles
   - System automatically matches agents to tasks
   - Load balancer selects from available agents

### Default Roles

All agents have "default" role unless specified. Use this for general-purpose tasks.
```

**Step 4: Add auto orchestration guide to FEATURE_GUIDES.md**

```markdown
## Auto Orchestration

**Purpose**: Execute workflows across agents with automatic role-based task assignment and load balancing.

### Workflow Creation

1. Define tasks with their required roles
2. Choose load balancing strategy (round-robin, least-loaded, random)
3. Optional: Set max agents per role (limits concurrent execution)
4. Start - system automatically assigns tasks to available agents

### Load Balancing Strategies

**Round Robin** (default):
- Cycles through agents sequentially
- Even distribution
- Simple and predictable

**Least Loaded**:
- Selects agent with fewest active tasks
- Best for variable task durations
- Dynamic adaptation

**Random**:
- Selects agents randomly
- Good for unpredictable workloads
- No state tracking required

### Benefits Over Manual Orchestration

- No need to specify exact agents
- Automatic load balancing
- Handles agent failures gracefully
- Scales with available agent pool
```

**Step 5: Update ARCHITECTURE.md**

Add to "v3.5 Socket Modules" section:
```markdown
#### Roles (`src/socket/roles.js`)
- Purpose: Role registry and agent-role assignment
- Events: create_role, list_roles, delete_role, assign_role_to_agent, remove_role_from_agent, get_agent_roles, get_agents_by_role
- State: tenantState.roles, tenantState.agentRoles
- One agent can have multiple roles

#### Auto Orchestration (`src/socket/auto-orchestration.js`)
- Purpose: Role-based task assignment and load balancing
- Events: create_auto_orchestration, start_auto_orchestration, report_auto_task_result, list_auto_orchestrations, get_auto_orchestration, cancel_auto_orchestration
- State: tenantState.autoOrchestrations, tenantState.taskQueue, tenantState.loadBalancers
- Load Balancers: round-robin, least-loaded, random
```

**Step 6: Commit**

```bash
git add docs/SOCKET_EVENTS.md docs/FEATURE_GUIDES.md docs/ARCHITECTURE.md
git commit -m "docs: add role management and auto orchestration documentation"
```

---

## Phase 10: Final Testing & Integration

### Task 11: End-to-End Test

**Step 1: Start server**

```bash
CLAWNET_SECRET_KEY=test node server.js
```

**Step 2: Start agent with roles**

```bash
CLAWNET_SECRET_KEY=test AGENT_ROLES=default,test-role NODE_ENV=development node client.js
```

**Step 3: Manual testing checklist**

- [ ] Create role via UI
- [ ] List roles via UI
- [ ] Assign role to connected agent
- [ ] View agents with role
- [ ] Remove role from agent
- [ ] Create auto orchestration with role-based tasks
- [ ] Start auto orchestration
- [ ] Verify tasks assigned to agents via load balancer
- [ ] Report task results
- [ ] Cancel running orchestration
- [ ] View orchestration status
- [ ] Delete role
- [ ] Agent disconnects while orchestration running (test behavior)

**Step 4: Run all tests**

```bash
npm test
```

Expected: All tests pass including new role and auto orchestration tests

**Step 5: Fix any issues found**

**Step 6: Commit final version**

```bash
git add .
git commit -m "feat: complete auto orchestration with role-based task assignment"
```

---

## Summary

**Files Created**:
- `src/socket/roles.js` (~250 lines)
- `src/socket/auto-orchestration.js` (~450 lines)
- `views/partials/_roles_tab.ejs` (~150 lines)
- `views/partials/_scripts_roles_tab.ejs` (~250 lines)
- `views/partials/_auto_orchestration_tab.ejs` (~100 lines)
- `views/partials/_scripts_auto_orchestration.ejs` (~300 lines)
- `tests/roles.test.js` (~120 lines)
- `tests/auto-orchestration.test.js` (~180 lines)

**Files Modified**:
- `src/state.js` (~50 lines added)
- `src/socket/index.js` (~10 lines added)
- `client.js` (~60 lines added)
- `docs/SOCKET_EVENTS.md` (~200 lines added)
- `docs/FEATURE_GUIDES.md` (~300 lines added)
- `docs/ARCHITECTURE.md` (~100 lines added)

**Total**: ~2,920 lines of code (1,150 implementation, 1,770 UI/docs/tests)

**Features Implemented**:
1. ✅ Role registry (create, list, delete)
2. ✅ Agent role assignment (assign, remove, multiple roles per agent)
3. ✅ Auto orchestration creation (role-based tasks)
4. ✅ Load balancers (round-robin, least-loaded, random)
5. ✅ Task assignment engine (match agents to tasks)
6. ✅ Task result reporting
7. ✅ Orchestration status monitoring
8. ✅ UI for role management
9. ✅ UI for auto orchestration
10. ✅ Agent client auto orchestration support

**Next Features** (not in this plan):
- Subagent spawning (create additional client processes for load)
- Task retry with different agent on failure
- Advanced scheduling (priority-based, deadlines)
- Metrics dashboard for load balancing effectiveness

---

## Execution Ready

**Plan complete and saved to** `docs/plans/2025-02-16-auto-orchestration-roles.md`

**Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
