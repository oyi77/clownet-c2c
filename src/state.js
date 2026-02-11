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
    commandTemplates: [] // { id: string, name: string, command: string }
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
        commandTemplates: []
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

module.exports = {
    getTenantState,
    setTenantState,
    getSettings,
    setSettings,
    tenantStates,
};
