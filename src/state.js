// In-memory state management.
// Multi-tenant: each tenant gets its own isolated state via getTenantState().

const defaultState = {
    agents: {},
    tasks: [],
    messages: [],
    rooms: {},       // { roomName: Set<agent_id> }
    handles: {},     // { agent_id: handle }
    metrics: { tasks_total: 0, tasks_success: 0, tasks_failed: 0, messages_total: 0 },
    connectionEvents: [], // { type: 'connect'|'disconnect', agentId: string, timestamp: Date }
    pendingClients: [], // { agentId: string, timestamp: Date }
    commandTemplates: [], // { id: string, name: string, command: string }
    sharedMemory: {}, // { key: { value: any, owner: agent_id, timestamp: Date, ttl: number } }
    credentials: {}, // { service: { credentials: encrypted_data, owner: agent_id, sharedWith: [agent_ids] } }
    files: {}, // { fileId: { name: string, data: buffer, owner: agent_id, sharedWith: [agent_ids], timestamp: Date } }
    skills: {}, // { skillId: { name: string, data: any, owner: agent_id, sharedWith: [agent_ids], experience: number } }
    orchestrations: {}, // { orchId: { name: string, agents: [agent_ids], tasks: [task_templates], status: string } }
    configs: {}, // { configId: { name: string, data: any, owner: agent_id, version: number, history: [versions] } }
    // Auto orchestration state (NEW)
    roles: {}, // { roleId: { name, description, createdAt } }
    agentRoles: {}, // { agentId: [roleId, roleId, ...] }
    autoOrchestrations: {}, // { orchestrationId: { name, tasks, loadBalanceStrategy, status } }
    taskQueue: [], // [{ id, name, requirements: { roles: [] }, priority, createdAt }]
    loadBalancers: {} // { roleId: { strategy, index: 0, lastUsed: timestamp } }
};

// Per-tenant state storage
const tenantStates = {};

function createState() {
    return {
        agents: {},
        tasks: [],
        messages: [],
        rooms: {},
        handles: {},
        metrics: { tasks_total: 0, tasks_success: 0, tasks_failed: 0, messages_total: 0 },
        connectionEvents: [],
        pendingClients: [],
        commandTemplates: [],
        sharedMemory: {},
        credentials: {},
        files: {},
        skills: {},
        orchestrations: {},
        configs: {},
        roles: {},
        agentRoles: {},
        autoOrchestrations: {},
        taskQueue: [],
        loadBalancers: {}
    };
}

function getTenantState(tenantId) {
    const tid = tenantId || 'default';
    if (!tenantStates[tid]) {
        tenantStates[tid] = createState();
    }
    return tenantStates[tid];
}

// Populate a tenant state with loaded data
function setTenantState(tenantId, data) {
    const tid = tenantId || 'default';
    const s = getTenantState(tid);
    if (data.tasks) s.tasks = data.tasks;
    if (data.messages) s.messages = data.messages;
}

// Settings (global, not per-tenant)
let settings = {
    supabase_url: '',
    supabase_key: '',
    clientApprovalMode: 'auto', // 'auto' | 'manual'
    whitelistedClients: [], // List of allowed client IDs
    blacklistedClients: [], // List of blocked client IDs
    tokenRotationEnabled: false
};

function getSettings() { return settings; }
function setSettings(s) { settings = s; }

function getAgentsByRole(tenantId, roleId) {
    const tid = tenantId || 'default';
    const tenantState = tenantStates[tid];
    if (!tenantState || !tenantState.agentRoles) return [];

    const agentsWithRole = [];
    for (const [agentId, roleIds] of Object.entries(tenantState.agentRoles)) {
        if (roleIds.includes(roleId) && tenantState.agents[agentId]) {
            agentsWithRole.push(agentId);
        }
    }
    return agentsWithRole;
}

module.exports = {
    getTenantState,
    setTenantState,
    getSettings,
    setSettings,
    tenantStates,
    getAgentsByRole,
};
