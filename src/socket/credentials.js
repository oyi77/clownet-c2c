const state = require('../state');
const { logEvent } = require('../utils/logger');
const crypto = require('crypto');

// Simple encryption for demonstration - in production, use proper key management
const ENCRYPTION_KEY = process.env.SHARED_MEMORY_ENCRYPTION_KEY || 'default-clownet-key-32-characters!';
const IV_LENGTH = 16;

function encrypt(text) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

function register(io, socket, ctx) {
    const { agent_id, tenantId } = ctx;
    const s = state.getTenantState(tenantId);

    socket.on('store_credentials', (payload) => {
        if (!payload || !payload.service || !payload.credentials) return;
        
        try {
            const encryptedCredentials = encrypt(JSON.stringify(payload.credentials));
            
            const entry = {
                service: payload.service,
                credentials: encryptedCredentials,
                owner: agent_id,
                sharedWith: payload.shareWith || [],
                timestamp: new Date().toISOString()
            };
            
            s.credentials[payload.service] = entry;
            logEvent(`Credentials stored: ${payload.service} by ${agent_id}`);
            
            const recipients = [...entry.sharedWith, agent_id];
            recipients.forEach(recipientId => {
                const agent = s.agents[recipientId];
                if (agent && agent.sid) {
                    io.to(agent.sid).emit('credentials_updated', {
                        service: payload.service,
                        owner: agent_id,
                        timestamp: entry.timestamp
                    });
                }
            });
        } catch (error) {
            logEvent(`Failed to store credentials: ${error.message}`);
        }
    });

    socket.on('get_credentials', (payload, callback) => {
        if (!payload || !payload.service) {
            if (callback) callback({ error: 'Service required' });
            return;
        }
        
        const entry = s.credentials[payload.service];
        if (!entry) {
            if (callback) callback({ error: 'Credentials not found' });
            return;
        }
        
        if (entry.owner !== agent_id && !entry.sharedWith.includes(agent_id) && agent_id !== 'master-ui') {
            if (callback) callback({ error: 'Access denied' });
            return;
        }
        
        try {
            const decryptedCredentials = JSON.parse(decrypt(entry.credentials));
            
            if (callback) {
                callback({
                    service: payload.service,
                    credentials: decryptedCredentials,
                    owner: entry.owner,
                    timestamp: entry.timestamp
                });
            }
        } catch (error) {
            if (callback) callback({ error: 'Failed to decrypt credentials' });
        }
    });

    socket.on('share_credentials', (payload) => {
        if (!payload || !payload.service || !payload.agents) return;
        
        const entry = s.credentials[payload.service];
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
                io.to(agent.sid).emit('credentials_shared', {
                    service: payload.service,
                    sharedBy: agent_id,
                    timestamp: new Date().toISOString()
                });
            }
        });
        
        logEvent(`Credentials shared: ${payload.service} by ${agent_id} with ${agentsToAdd.join(', ')}`);
    });

    socket.on('list_credentials', (payload, callback) => {
        const available = Object.keys(s.credentials)
            .filter(service => {
                const entry = s.credentials[service];
                return entry.owner === agent_id || 
                       entry.sharedWith.includes(agent_id) || 
                       agent_id === 'master-ui';
            })
            .map(service => ({
                service: service,
                owner: s.credentials[service].owner,
                sharedWith: s.credentials[service].sharedWith,
                timestamp: s.credentials[service].timestamp
            }));
        
        if (callback) {
            callback({ credentials: available });
        }
    });

    socket.on('revoke_credentials_access', (payload) => {
        if (!payload || !payload.service || !payload.agents) return;
        
        const entry = s.credentials[payload.service];
        if (!entry) return;
        
        if (entry.owner !== agent_id && agent_id !== 'master-ui') return;
        
        const agentsToRemove = Array.isArray(payload.agents) ? payload.agents : [payload.agents];
        entry.sharedWith = entry.sharedWith.filter(agent => !agentsToRemove.includes(agent));
        
        agentsToRemove.forEach(agentId => {
            const agent = s.agents[agentId];
            if (agent && agent.sid) {
                io.to(agent.sid).emit('credentials_access_revoked', {
                    service: payload.service,
                    revokedBy: agent_id,
                    timestamp: new Date().toISOString()
                });
            }
        });
        
        logEvent(`Credentials access revoked: ${payload.service} by ${agent_id} from ${agentsToRemove.join(', ')}`);
    });
}

module.exports = { register, encrypt, decrypt };