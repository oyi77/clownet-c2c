const state = require('../state');
const { logEvent } = require('../utils/logger');

function register(io, socket, ctx) {
    const { agent_id, tenantId } = ctx;
    const s = state.getTenantState(tenantId);

    socket.on('save_agent_config', (payload) => {
        if (!payload || !payload.name || !payload.data) return;
        
        const configId = `${agent_id}-${Date.now()}-${payload.name.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        
        const entry = {
            id: configId,
            name: payload.name,
            data: payload.data,
            owner: agent_id,
            version: 1,
            timestamp: new Date().toISOString(),
            history: [{
                version: 1,
                data: payload.data,
                timestamp: new Date().toISOString(),
                author: agent_id
            }]
        };
        
        s.configs[configId] = entry;
        logEvent(`Agent config saved: ${payload.name} by ${agent_id}`);
        
        const agent = s.agents[agent_id];
        if (agent && agent.sid) {
            io.to(agent.sid).emit('config_saved', {
                configId: configId,
                name: payload.name,
                version: entry.version,
                timestamp: entry.timestamp
            });
        }
    });

    socket.on('get_agent_config', (payload, callback) => {
        if (!payload || !payload.configId) {
            if (callback) callback({ error: 'Config ID required' });
            return;
        }
        
        const entry = s.configs[payload.configId];
        if (!entry) {
            if (callback) callback({ error: 'Config not found' });
            return;
        }
        
        if (entry.owner !== agent_id && agent_id !== 'master-ui') {
            if (callback) callback({ error: 'Access denied' });
            return;
        }
        
        if (callback) {
            callback({
                configId: payload.configId,
                name: entry.name,
                data: entry.data,
                owner: entry.owner,
                version: entry.version,
                timestamp: entry.timestamp,
                history: entry.history
            });
        }
    });

    socket.on('update_agent_config', (payload) => {
        if (!payload || !payload.configId || !payload.data) return;
        
        const entry = s.configs[payload.configId];
        if (!entry) return;
        
        if (entry.owner !== agent_id && agent_id !== 'master-ui') return;
        
        const newVersion = entry.version + 1;
        entry.version = newVersion;
        entry.data = payload.data;
        entry.timestamp = new Date().toISOString();
        
        entry.history.push({
            version: newVersion,
            data: payload.data,
            timestamp: entry.timestamp,
            author: agent_id
        });
        
        if (entry.history.length > 10) {
            entry.history.shift();
        }
        
        logEvent(`Agent config updated: ${entry.name} to version ${newVersion} by ${agent_id}`);
        
        const agent = s.agents[agent_id];
        if (agent && agent.sid) {
            io.to(agent.sid).emit('config_updated', {
                configId: payload.configId,
                name: entry.name,
                version: entry.version,
                timestamp: entry.timestamp
            });
        }
    });

    socket.on('list_agent_configs', (payload, callback) => {
        const configs = Object.keys(s.configs)
            .filter(configId => {
                const entry = s.configs[configId];
                return entry.owner === agent_id || agent_id === 'master-ui';
            })
            .map(configId => {
                const entry = s.configs[configId];
                return {
                    configId: configId,
                    name: entry.name,
                    owner: entry.owner,
                    version: entry.version,
                    timestamp: entry.timestamp
                };
            });
        
        if (callback) {
            callback({ configs: configs });
        }
    });

    socket.on('clone_agent_config', (payload, callback) => {
        if (!payload || !payload.configId || !payload.newName) return;
        
        const sourceEntry = s.configs[payload.configId];
        if (!sourceEntry) {
            if (callback) callback({ error: 'Source config not found' });
            return;
        }
        
        if (sourceEntry.owner !== agent_id && agent_id !== 'master-ui') {
            if (callback) callback({ error: 'Access denied to source config' });
            return;
        }
        
        const newConfigId = `${agent_id}-${Date.now()}-${payload.newName.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        
        const newEntry = {
            id: newConfigId,
            name: payload.newName,
            data: JSON.parse(JSON.stringify(sourceEntry.data)),
            owner: agent_id,
            version: 1,
            timestamp: new Date().toISOString(),
            history: [{
                version: 1,
                data: JSON.parse(JSON.stringify(sourceEntry.data)),
                timestamp: new Date().toISOString(),
                author: agent_id
            }],
            clonedFrom: payload.configId
        };
        
        s.configs[newConfigId] = newEntry;
        logEvent(`Agent config cloned: ${payload.newName} from ${sourceEntry.name} by ${agent_id}`);
        
        if (callback) {
            callback({
                configId: newConfigId,
                name: payload.newName,
                version: newEntry.version,
                timestamp: newEntry.timestamp
            });
        }
    });

    socket.on('revert_agent_config', (payload, callback) => {
        if (!payload || !payload.configId || !payload.version) return;
        
        const entry = s.configs[payload.configId];
        if (!entry) {
            if (callback) callback({ error: 'Config not found' });
            return;
        }
        
        if (entry.owner !== agent_id && agent_id !== 'master-ui') {
            if (callback) callback({ error: 'Access denied' });
            return;
        }
        
        const versionEntry = entry.history.find(v => v.version === payload.version);
        if (!versionEntry) {
            if (callback) callback({ error: `Version ${payload.version} not found` });
            return;
        }
        
        const newVersion = entry.version + 1;
        entry.version = newVersion;
        entry.data = JSON.parse(JSON.stringify(versionEntry.data));
        entry.timestamp = new Date().toISOString();
        
        entry.history.push({
            version: newVersion,
            data: JSON.parse(JSON.stringify(versionEntry.data)),
            timestamp: entry.timestamp,
            author: agent_id,
            revertedFrom: versionEntry.version
        });
        
        if (entry.history.length > 10) {
            entry.history.shift();
        }
        
        logEvent(`Agent config reverted: ${entry.name} to version ${payload.version} (now version ${newVersion}) by ${agent_id}`);
        
        if (callback) {
            callback({
                configId: payload.configId,
                name: entry.name,
                version: entry.version,
                timestamp: entry.timestamp
            });
        }
    });

    socket.on('delete_agent_config', (payload) => {
        if (!payload || !payload.configId) return;
        
        const entry = s.configs[payload.configId];
        if (!entry) return;
        
        if (entry.owner !== agent_id && agent_id !== 'master-ui') return;
        
        delete s.configs[payload.configId];
        logEvent(`Agent config deleted: ${entry.name} by ${agent_id}`);
        
        const agent = s.agents[agent_id];
        if (agent && agent.sid) {
            io.to(agent.sid).emit('config_deleted', {
                configId: payload.configId,
                name: entry.name,
                deletedBy: agent_id,
                timestamp: new Date().toISOString()
            });
        }
    });
}

module.exports = { register };