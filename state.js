const { createClient } = require('@supabase/supabase-js');

// In-memory state as primary (Stateless Relay requirement)
let state = {
    agents: {},
    tasks: [],
    messages: [],
    cron_history: []
};

// Optional Supabase integration
let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    console.log("Supabase integrated as Data Warden backend.");
}

async function persistToSupabase(table, data) {
    if (!supabase) return;
    try {
        const { error } = await supabase.from(table).upsert(data, { onConflict: 'id' });
        if (error) console.error(`Supabase persistence error [${table}]:`, error);
    } catch (e) {
        console.error(`Supabase exception [${table}]:`, e);
    }
}

module.exports = {
    getAgents: () => Object.values(state.agents),
    
    updateAgent: async (id, payload) => {
        const agent = {
            id,
            ...payload,
            last_seen: new Date().toISOString()
        };
        state.agents[id] = { ...(state.agents[id] || {}), ...agent };
        
        // Persist to Supabase if warden-like sync is needed
        await persistToSupabase('agents', agent);
    },

    saveMessage: async (message) => {
        const msg = {
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            ...message
        };
        state.messages.push(msg);
        if (state.messages.length > 1000) state.messages.shift();
        
        await persistToSupabase('messages', msg);
    },

    saveTask: async (task) => {
        const t = {
            id: task.id || crypto.randomUUID(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...task
        };
        
        // Update in-memory
        const idx = state.tasks.findIndex(x => x.id === t.id);
        if (idx !== -1) state.tasks[idx] = t;
        else state.tasks.push(t);
        
        await persistToSupabase('tasks', t);
    },

    getTasks: () => state.tasks,
    getMessages: () => state.messages,

    reassignRole: async (agentId, newRole) => {
        if (state.agents[agentId]) {
            state.agents[agentId].role = newRole;
            await persistToSupabase('agents', { id: agentId, role: newRole });
        }
    }
};
