const state = require('../state');
const { logEvent } = require('../utils/logger');

function register(io, socket, ctx) {
    const { agent_id, tenantId } = ctx;
    const s = state.getTenantState(tenantId);

    socket.on('set_shared_memory', (payload) => {
        if (!payload || !payload.key || payload.value === undefined) return;
        
        const entry = {
            value: payload.value,
            owner: agent_id,
            timestamp: new Date().toISOString(),
            ttl: payload.ttl || null
        };
        
        s.sharedMemory[payload.key] = entry;
        logEvent(`Shared memory set: ${payload.key} by ${agent_id}`);
        
        socket.broadcast.emit('shared_memory_update', {
            key: payload.key,
            value: payload.value,
            owner: agent_id,
            timestamp: entry.timestamp
        });
    });

    socket.on('get_shared_memory', (payload, callback) => {
        if (!payload || !payload.key) {
            if (callback) callback({ error: 'Key required' });
            return;
        }
        
        const entry = s.sharedMemory[payload.key];
        if (!entry) {
            if (callback) callback({ error: 'Key not found' });
            return;
        }
        
        if (entry.ttl) {
            const now = new Date();
            const created = new Date(entry.timestamp);
            if (now - created > entry.ttl * 1000) {
                delete s.sharedMemory[payload.key];
                if (callback) callback({ error: 'Key expired' });
                return;
            }
        }
        
        if (callback) {
            callback({
                key: payload.key,
                value: entry.value,
                owner: entry.owner,
                timestamp: entry.timestamp
            });
        }
    });

    socket.on('list_shared_memory', (payload, callback) => {
        const keys = Object.keys(s.sharedMemory).map(key => ({
            key: key,
            owner: s.sharedMemory[key].owner,
            timestamp: s.sharedMemory[key].timestamp
        }));
        
        if (callback) {
            callback({ keys: keys });
        }
    });

    socket.on('delete_shared_memory', (payload) => {
        if (!payload || !payload.key) return;
        
        const entry = s.sharedMemory[payload.key];
        if (entry && (entry.owner === agent_id || agent_id === 'master-ui')) {
            delete s.sharedMemory[payload.key];
            logEvent(`Shared memory deleted: ${payload.key} by ${agent_id}`);
            
            socket.broadcast.emit('shared_memory_deleted', {
                key: payload.key,
                deletedBy: agent_id
            });
        }
    });
}

module.exports = { register };