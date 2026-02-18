const state = require('../state');
const { logEvent } = require('../utils/logger');

function register(io, socket, ctx) {
    const { agent_id, tenantId } = ctx;
    const s = state.getTenantState(tenantId);

    socket.on('upload_file', (payload, callback) => {
        if (!payload || !payload.filename || !payload.data) {
            if (callback) callback({ success: false, error: 'Filename and data required' });
            return;
        }
        
        const buffer = Buffer.from(payload.data, 'base64');
        
        const fileId = `${agent_id}-${Date.now()}-${payload.filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        
        const entry = {
            id: fileId,
            name: payload.filename,
            data: buffer,
            owner: agent_id,
            sharedWith: payload.shareWith || [],
            timestamp: new Date().toISOString(),
            size: buffer.length
        };
        
        s.files[fileId] = entry;
        logEvent(`File uploaded: ${payload.filename} by ${agent_id}`);
        
        const recipients = [...entry.sharedWith, agent_id];
        recipients.forEach(recipientId => {
            const agent = s.agents[recipientId];
            if (agent && agent.sid) {
                io.to(agent.sid).emit('file_uploaded', {
                    fileId: fileId,
                    filename: payload.filename,
                    owner: agent_id,
                    size: buffer.length,
                    timestamp: entry.timestamp
                });
            }
        });

        if (callback) {
            callback({
                success: true,
                fileId,
                filename: payload.filename,
                size: buffer.length,
                timestamp: entry.timestamp
            });
        }
    });

    socket.on('download_file', (payload, callback) => {
        if (!payload || !payload.fileId) {
            if (callback) callback({ success: false, error: 'File ID required' });
            return;
        }
        
        const entry = s.files[payload.fileId];
        if (!entry) {
            if (callback) callback({ success: false, error: 'File not found' });
            return;
        }
        
        if (entry.owner !== agent_id && !entry.sharedWith.includes(agent_id) && agent_id !== 'master-ui') {
            if (callback) callback({ success: false, error: 'Access denied' });
            return;
        }
        
        const base64Data = entry.data.toString('base64');
        
        if (callback) {
            callback({
                success: true,
                fileId: payload.fileId,
                filename: entry.name,
                data: base64Data,
                owner: entry.owner,
                size: entry.size,
                timestamp: entry.timestamp
            });
        }
    });

    socket.on('share_file', (payload) => {
        if (!payload || !payload.fileId || !payload.agents) return;
        
        const entry = s.files[payload.fileId];
        if (!entry) return;
        
        if (entry.owner !== agent_id && agent_id !== 'master-ui') return;
        
        const agentsToAdd = Array.isArray(payload.agents) ? payload.agents : [payload.agents];
        agentsToAdd.forEach(agent => {
            if (!entry.sharedWith.includes(agent)) {
                entry.sharedWith.push(agent);
            }
        });
        
        agentsToAdd.forEach(agentId => {
            const agent = s.agents[agentId];
            if (agent && agent.sid) {
                io.to(agent.sid).emit('file_shared', {
                    fileId: payload.fileId,
                    filename: entry.name,
                    sharedBy: agent_id,
                    timestamp: new Date().toISOString()
                });
            }
        });
        
        logEvent(`File shared: ${entry.name} by ${agent_id} with ${agentsToAdd.join(', ')}`);
    });

    socket.on('list_files', (payload, callback) => {
        const available = Object.keys(s.files)
            .filter(fileId => {
                const entry = s.files[fileId];
                return entry.owner === agent_id || 
                       entry.sharedWith.includes(agent_id) || 
                       agent_id === 'master-ui';
            })
            .map(fileId => {
                const entry = s.files[fileId];
                return {
                    fileId: fileId,
                    filename: entry.name,
                    owner: entry.owner,
                    size: entry.size,
                    sharedWith: entry.sharedWith,
                    timestamp: entry.timestamp
                };
            });
        
        if (callback) {
            callback({ success: true, files: available });
        }
    });

    socket.on('revoke_file_access', (payload) => {
        if (!payload || !payload.fileId || !payload.agents) return;
        
        const entry = s.files[payload.fileId];
        if (!entry) return;
        
        if (entry.owner !== agent_id && agent_id !== 'master-ui') return;
        
        const agentsToRemove = Array.isArray(payload.agents) ? payload.agents : [payload.agents];
        entry.sharedWith = entry.sharedWith.filter(agent => !agentsToRemove.includes(agent));
        
        agentsToRemove.forEach(agentId => {
            const agent = s.agents[agentId];
            if (agent && agent.sid) {
                io.to(agent.sid).emit('file_access_revoked', {
                    fileId: payload.fileId,
                    filename: entry.name,
                    revokedBy: agent_id,
                    timestamp: new Date().toISOString()
                });
            }
        });
        
        logEvent(`File access revoked: ${entry.name} by ${agent_id} from ${agentsToRemove.join(', ')}`);
    });

    socket.on('delete_file', (payload, callback) => {
        if (!payload || !payload.fileId) {
            if (callback) callback({ success: false, error: 'File ID required' });
            return;
        }
        
        const entry = s.files[payload.fileId];
        if (!entry) {
            if (callback) callback({ success: false, error: 'File not found' });
            return;
        }
        
        if (entry.owner !== agent_id && agent_id !== 'master-ui') {
            if (callback) callback({ success: false, error: 'Access denied' });
            return;
        }
        
        delete s.files[payload.fileId];
        logEvent(`File deleted: ${entry.name} by ${agent_id}`);
        
        const recipients = [...entry.sharedWith, entry.owner];
        recipients.forEach(recipientId => {
            const agent = s.agents[recipientId];
            if (agent && agent.sid) {
                io.to(agent.sid).emit('file_deleted', {
                    fileId: payload.fileId,
                    filename: entry.name,
                    deletedBy: agent_id,
                    timestamp: new Date().toISOString()
                });
            }
        });

        if (callback) {
            callback({ success: true });
        }
    });
}

module.exports = { register };
