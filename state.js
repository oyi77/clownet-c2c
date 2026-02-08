const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SETTINGS_FILE = process.env.DATABASE_PATH ? path.join(path.dirname(process.env.DATABASE_PATH), 'settings.json') : path.join(__dirname, 'settings.json');
const ENCRYPTION_KEY = process.env.CLAWNET_SECRET_KEY || 'very-secret-key-123';
const ALGORITHM = 'aes-256-ctr';

function encrypt(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.padEnd(32).substring(0, 32)), iv);
    const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(hash) {
    const parts = hash.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encryptedText = Buffer.from(parts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.padEnd(32).substring(0, 32)), iv);
    const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
    return decrypted.toString();
}

// In-memory state as primary
let state = {
    agents: {},
    tasks: [],
    messages: [],
    settings: {
        SUPABASE_URL: '',
        SUPABASE_KEY: ''
    }
};

// Load settings from disk
if (fs.existsSync(SETTINGS_FILE)) {
    try {
        const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE));
        if (raw.SUPABASE_URL) state.settings.SUPABASE_URL = decrypt(raw.SUPABASE_URL);
        if (raw.SUPABASE_KEY) state.settings.SUPABASE_KEY = decrypt(raw.SUPABASE_KEY);
    } catch (e) {
        console.error("Failed to load/decrypt settings:", e);
    }
}

let supabase = null;
function initSupabase() {
    if (state.settings.SUPABASE_URL && state.settings.SUPABASE_KEY) {
        supabase = createClient(state.settings.SUPABASE_URL, state.settings.SUPABASE_KEY);
        console.log("Supabase integrated as Data Warden backend.");
    } else {
        supabase = null;
    }
}
initSupabase();

async function persistToSupabase(table, data) {
    if (!supabase) return;
    try {
        const { error } = await supabase.from(table).upsert(data, { onConflict: 'id' });
        if (error) console.error(`Supabase persistence error [${table}]:`, error);
    } catch (e) {
        // console.error(`Supabase exception [${table}]:`, e);
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
        return msg;
    },

    saveTask: async (task) => {
        const t = {
            id: task.id || crypto.randomUUID(),
            created_at: task.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...task
        };
        
        const idx = state.tasks.findIndex(x => x.id === t.id);
        if (idx !== -1) state.tasks[idx] = t;
        else state.tasks.push(t);
        
        await persistToSupabase('tasks', t);
        return t;
    },

    getTasks: () => state.tasks,
    getMessages: () => state.messages,
    getSettings: () => state.settings,

    updateSettings: (newSettings) => {
        state.settings = { ...state.settings, ...newSettings };
        const encrypted = {
            SUPABASE_URL: encrypt(state.settings.SUPABASE_URL || ''),
            SUPABASE_KEY: encrypt(state.settings.SUPABASE_KEY || '')
        };
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(encrypted, null, 2));
        initSupabase();
    },

    reassignRole: async (agentId, newRole) => {
        if (state.agents[agentId]) {
            state.agents[agentId].role = newRole;
            await persistToSupabase('agents', { id: agentId, role: newRole });
        }
    }
};
