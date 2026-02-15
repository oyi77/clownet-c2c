const state = require('../state');
const { logEvent } = require('../utils/logger');

function register(io, socket, ctx) {
    const { agent_id, tenantId } = ctx;
    const s = state.getTenantState(tenantId);

    socket.on('register_skill', (payload) => {
        if (!payload || !payload.name || !payload.data) return;
        
        const skillId = `${agent_id}-${Date.now()}-${payload.name.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        
        const entry = {
            id: skillId,
            name: payload.name,
            data: payload.data,
            owner: agent_id,
            sharedWith: payload.shareWith || [],
            experience: payload.experience || 0,
            timestamp: new Date().toISOString(),
            version: 1
        };
        
        s.skills[skillId] = entry;
        logEvent(`Skill registered: ${payload.name} by ${agent_id}`);
        
        const recipients = [...entry.sharedWith, agent_id];
        recipients.forEach(recipientId => {
            const agent = s.agents[recipientId];
            if (agent && agent.sid) {
                io.to(agent.sid).emit('skill_registered', {
                    skillId: skillId,
                    name: payload.name,
                    owner: agent_id,
                    experience: entry.experience,
                    timestamp: entry.timestamp
                });
            }
        });
    });

    socket.on('get_skill', (payload, callback) => {
        if (!payload || !payload.skillId) {
            if (callback) callback({ error: 'Skill ID required' });
            return;
        }
        
        const entry = s.skills[payload.skillId];
        if (!entry) {
            if (callback) callback({ error: 'Skill not found' });
            return;
        }
        
        if (entry.owner !== agent_id && !entry.sharedWith.includes(agent_id) && agent_id !== 'master-ui') {
            if (callback) callback({ error: 'Access denied' });
            return;
        }
        
        if (callback) {
            callback({
                skillId: payload.skillId,
                name: entry.name,
                data: entry.data,
                owner: entry.owner,
                experience: entry.experience,
                timestamp: entry.timestamp,
                version: entry.version
            });
        }
    });

    socket.on('share_skill', (payload) => {
        if (!payload || !payload.skillId || !payload.agents) return;
        
        const entry = s.skills[payload.skillId];
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
                io.to(agent.sid).emit('skill_shared', {
                    skillId: payload.skillId,
                    name: entry.name,
                    sharedBy: agent_id,
                    timestamp: new Date().toISOString()
                });
            }
        });
        
        logEvent(`Skill shared: ${entry.name} by ${agent_id} with ${agentsToAdd.join(', ')}`);
    });

    socket.on('list_skills', (payload, callback) => {
        const available = Object.keys(s.skills)
            .filter(skillId => {
                const entry = s.skills[skillId];
                return entry.owner === agent_id || 
                       entry.sharedWith.includes(agent_id) || 
                       agent_id === 'master-ui';
            })
            .map(skillId => {
                const entry = s.skills[skillId];
                return {
                    skillId: skillId,
                    name: entry.name,
                    owner: entry.owner,
                    experience: entry.experience,
                    sharedWith: entry.sharedWith,
                    timestamp: entry.timestamp
                };
            });
        
        if (callback) {
            callback({ skills: available });
        }
    });

    socket.on('update_skill_experience', (payload) => {
        if (!payload || !payload.skillId || payload.experience === undefined) return;
        
        const entry = s.skills[payload.skillId];
        if (!entry) return;
        
        if (entry.owner !== agent_id && !entry.sharedWith.includes(agent_id) && agent_id !== 'master-ui') return;
        
        entry.experience = Math.max(0, entry.experience + payload.experience);
        entry.timestamp = new Date().toISOString();
        
        logEvent(`Skill experience updated: ${entry.name} by ${agent_id} to ${entry.experience}`);
    });

    socket.on('revoke_skill_access', (payload) => {
        if (!payload || !payload.skillId || !payload.agents) return;
        
        const entry = s.skills[payload.skillId];
        if (!entry) return;
        
        if (entry.owner !== agent_id && agent_id !== 'master-ui') return;
        
        const agentsToRemove = Array.isArray(payload.agents) ? payload.agents : [payload.agents];
        entry.sharedWith = entry.sharedWith.filter(agent => !agentsToRemove.includes(agent));
        
        agentsToRemove.forEach(agentId => {
            const agent = s.agents[agentId];
            if (agent && agent.sid) {
                io.to(agent.sid).emit('skill_access_revoked', {
                    skillId: payload.skillId,
                    name: entry.name,
                    revokedBy: agent_id,
                    timestamp: new Date().toISOString()
                });
            }
        });
        
        logEvent(`Skill access revoked: ${entry.name} by ${agent_id} from ${agentsToRemove.join(', ')}`);
    });

    socket.on('delete_skill', (payload) => {
        if (!payload || !payload.skillId) return;
        
        const entry = s.skills[payload.skillId];
        if (!entry) return;
        
        if (entry.owner !== agent_id && agent_id !== 'master-ui') return;
        
        delete s.skills[payload.skillId];
        logEvent(`Skill deleted: ${entry.name} by ${agent_id}`);
        
        const recipients = [...entry.sharedWith, entry.owner];
        recipients.forEach(recipientId => {
            const agent = s.agents[recipientId];
            if (agent && agent.sid) {
                io.to(agent.sid).emit('skill_deleted', {
                    skillId: payload.skillId,
                    name: entry.name,
                    deletedBy: agent_id,
                    timestamp: new Date().toISOString()
                });
            }
        });
    });
}

module.exports = { register };