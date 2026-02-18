const state = require('../state');
const { logEvent } = require('../utils/logger');

function register(io, socket, ctx) {
    const { agent_id, tenantId } = ctx;
    const s = state.getTenantState(tenantId);

    socket.on('set_shared_memory', (payload, callback) => {
        if (!payload || !payload.key || payload.value === undefined) {
            if (callback) callback({ success: false, error: 'Key and value required' });
            return;
        }
        
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

        if (callback) {
            callback({
                success: true,
                data: {
                    key: payload.key,
                    value: entry.value,
                    owner: entry.owner,
                    timestamp: entry.timestamp
                }
            });
        }
    });

    socket.on('get_shared_memory', (payload, callback) => {
        if (!payload || !payload.key) {
            if (callback) callback({ success: false, error: 'Key required' });
            return;
        }
        
        const entry = s.sharedMemory[payload.key];
        if (!entry) {
            if (callback) callback({ success: false, error: 'Key not found' });
            return;
        }
        
        if (entry.ttl) {
            const now = new Date();
            const created = new Date(entry.timestamp);
            if (now - created > entry.ttl * 1000) {
                delete s.sharedMemory[payload.key];
                if (callback) callback({ success: false, error: 'Key expired' });
                return;
            }
        }
        
        if (callback) {
            callback({
                success: true,
                data: {
                    key: payload.key,
                    value: entry.value,
                    owner: entry.owner,
                    timestamp: entry.timestamp
                }
            });
        }
    });

    socket.on('list_shared_memory', (payload, callback) => {
        const keys = Object.keys(s.sharedMemory);
        
        if (callback) {
            callback({ success: true, data: { keys } });
        }
    });

    socket.on('delete_shared_memory', (payload, callback) => {
        if (!payload || !payload.key) {
            if (callback) callback({ success: false, error: 'Key required' });
            return;
        }
        
        const entry = s.sharedMemory[payload.key];
        if (!entry) {
            if (callback) callback({ success: false, error: 'Key not found' });
            return;
        }

        if (entry.owner !== agent_id && agent_id !== 'master-ui') {
            if (callback) callback({ success: false, error: 'Permission denied' });
            return;
        }

        delete s.sharedMemory[payload.key];
        logEvent(`Shared memory deleted: ${payload.key} by ${agent_id}`);
        
        socket.broadcast.emit('shared_memory_deleted', {
            key: payload.key,
            deletedBy: agent_id
        });

        if (callback) {
            callback({
                success: true,
                data: {
                    key: payload.key,
                    deletedBy: agent_id
                }
            });
        }
    });
}

module.exports = { register };
