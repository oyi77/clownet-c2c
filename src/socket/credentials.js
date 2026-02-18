const state = require('../state');
const { logEvent } = require('../utils/logger');
const crypto = require('crypto');

const IV_LENGTH = 16;

function deriveEncryptionKey() {
    const secret = process.env.CLAWNET_SECRET_KEY;
    if (!secret || typeof secret !== 'string') {
        return null;
    }

    return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

function encrypt(text) {
    const key = deriveEncryptionKey();
    if (!key) {
        throw new Error('Encryption unavailable: CLAWNET_SECRET_KEY is not configured');
    }

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
    const key = deriveEncryptionKey();
    if (!key) {
        throw new Error('Decryption unavailable: CLAWNET_SECRET_KEY is not configured');
    }

    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

function toAgentList(value) {
    const list = Array.isArray(value) ? value : [value];
    return [...new Set(list.filter((agent) => typeof agent === 'string' && agent.trim().length > 0))];
}

function canReadEntry(entry, requesterId) {
    return entry.owner === requesterId || entry.sharedWith.includes(requesterId) || requesterId === 'master-ui';
}

function canManageEntry(entry, requesterId) {
    return entry.owner === requesterId || requesterId === 'master-ui';
}

function reply(callback, payload) {
    if (typeof callback === 'function') {
        callback(payload);
    }
}

function metadataFromEntry(service, entry) {
    return {
        service,
        owner: entry.owner,
        sharedWith: [...entry.sharedWith],
        timestamp: entry.timestamp
    };
}

function register(io, socket, ctx) {
    const { agent_id, tenantId } = ctx;
    const s = state.getTenantState(tenantId);

    socket.on('store_credentials', (payload, callback) => {
        if (!payload || !payload.service || payload.credentials === undefined) {
            reply(callback, { success: false, error: 'Service and credentials required' });
            return;
        }

        try {
            const sharedWith = toAgentList(payload.shareWith).filter((candidate) => candidate !== agent_id);
            const encryptedCredentials = encrypt(JSON.stringify(payload.credentials));

            const entry = {
                service: payload.service,
                credentials: encryptedCredentials,
                owner: agent_id,
                sharedWith,
                timestamp: new Date().toISOString()
            };

            s.credentials[payload.service] = entry;
            logEvent(`Credentials stored: ${payload.service} by ${agent_id}`);

            const recipients = [...entry.sharedWith, agent_id];
            recipients.forEach((recipientId) => {
                const agent = s.agents[recipientId];
                if (agent && agent.sid) {
                    io.to(agent.sid).emit('credentials_updated', {
                        service: payload.service,
                        owner: agent_id,
                        timestamp: entry.timestamp
                    });
                }
            });

            reply(callback, {
                success: true,
                data: metadataFromEntry(payload.service, entry)
            });
        } catch (error) {
            logEvent(`Failed to store credentials: ${error.message}`);
            reply(callback, { success: false, error: 'Failed to store credentials' });
        }
    });

    socket.on('get_credentials', (payload, callback) => {
        if (!payload || !payload.service) {
            reply(callback, { success: false, error: 'Service required' });
            return;
        }

        const entry = s.credentials[payload.service];
        if (!entry) {
            reply(callback, { success: false, error: 'Credentials not found' });
            return;
        }

        if (!canReadEntry(entry, agent_id)) {
            reply(callback, { success: false, error: 'Access denied' });
            return;
        }

        try {
            const decryptedCredentials = JSON.parse(decrypt(entry.credentials));
            const responseData = {
                service: payload.service,
                credentials: decryptedCredentials,
                owner: entry.owner,
                timestamp: entry.timestamp
            };

            reply(callback, {
                success: true,
                data: responseData,
                service: responseData.service,
                credentials: responseData.credentials,
                owner: responseData.owner,
                timestamp: responseData.timestamp
            });
        } catch (error) {
            reply(callback, { success: false, error: 'Failed to decrypt credentials' });
        }
    });

    socket.on('share_credentials', (payload, callback) => {
        if (!payload || !payload.service || !payload.agents) {
            reply(callback, { success: false, error: 'Service and agents required' });
            return;
        }

        const entry = s.credentials[payload.service];
        if (!entry) {
            reply(callback, { success: false, error: 'Credentials not found' });
            return;
        }

        if (!canManageEntry(entry, agent_id)) {
            reply(callback, { success: false, error: 'Access denied' });
            return;
        }

        const agentsToAdd = toAgentList(payload.agents).filter((candidate) => candidate !== entry.owner);
        if (agentsToAdd.length === 0) {
            reply(callback, { success: false, error: 'No valid agents provided' });
            return;
        }

        const addedAgents = [];
        agentsToAdd.forEach((targetAgent) => {
            if (!entry.sharedWith.includes(targetAgent)) {
                entry.sharedWith.push(targetAgent);
                addedAgents.push(targetAgent);
            }
        });

        agentsToAdd.forEach((agentId) => {
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

        reply(callback, {
            success: true,
            data: {
                service: payload.service,
                addedAgents,
                sharedWith: [...entry.sharedWith]
            }
        });
    });

    socket.on('list_credentials', (_payload, callback) => {
        void _payload;
        const available = Object.keys(s.credentials)
            .filter((service) => {
                const entry = s.credentials[service];
                return canReadEntry(entry, agent_id);
            })
            .map((service) => metadataFromEntry(service, s.credentials[service]));

        reply(callback, { success: true, data: available, credentials: available });
    });

    socket.on('revoke_credentials_access', (payload, callback) => {
        if (!payload || !payload.service || !payload.agents) {
            reply(callback, { success: false, error: 'Service and agents required' });
            return;
        }

        const entry = s.credentials[payload.service];
        if (!entry) {
            reply(callback, { success: false, error: 'Credentials not found' });
            return;
        }

        if (!canManageEntry(entry, agent_id)) {
            reply(callback, { success: false, error: 'Access denied' });
            return;
        }

        const agentsToRemove = toAgentList(payload.agents);
        if (agentsToRemove.length === 0) {
            reply(callback, { success: false, error: 'No valid agents provided' });
            return;
        }

        const removedAgents = entry.sharedWith.filter((candidate) => agentsToRemove.includes(candidate));
        entry.sharedWith = entry.sharedWith.filter((candidate) => !agentsToRemove.includes(candidate));

        agentsToRemove.forEach((agentId) => {
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

        reply(callback, {
            success: true,
            data: {
                service: payload.service,
                removedAgents,
                sharedWith: [...entry.sharedWith]
            }
        });
    });
}

module.exports = { register, encrypt, decrypt, deriveEncryptionKey };
