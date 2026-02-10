const state = require('../state');
const { logEvent } = require('../utils/logger');
const { emitTraffic } = require('./warden');

function register(io, socket, ctx) {
    const { agent_id, role, specs, tenantId } = ctx;
    const s = state.getTenantState(tenantId);
    const sid = socket.id;

    if (agent_id) {
        s.agents[agent_id] = {
            id: agent_id,
            role: role || 'worker',
            status: 'online',
            specs: specs || {},
            last_seen: new Date().toISOString(),
            sid: sid,
            cron: [],
            sessions: [],
        };

        // Broadcast fleet update to same-tenant sockets
        emitToTenant(io, tenantId, 'fleet_update', getFleetList(s));
        logEvent(`Agent connected: ${agent_id} (tenant: ${tenantId})`);
        emitTraffic(io, tenantId, { type: 'connect', agent_id, role });
    }

    socket.on('report', (data) => {
        if (!data || typeof data !== 'object') return;
        if (s.agents[agent_id]) {
            s.agents[agent_id].last_seen = new Date().toISOString();
            s.agents[agent_id].specs = data.specs || s.agents[agent_id].specs;
            s.agents[agent_id].cron = data.cron || [];
            s.agents[agent_id].sessions = data.sessions || [];
            emitToTenant(io, tenantId, 'fleet_update', getFleetList(s));
        }
    });

    socket.on('disconnect', () => {
        if (agent_id && s.agents[agent_id]) {
            s.agents[agent_id].status = 'offline';
            emitToTenant(io, tenantId, 'fleet_update', getFleetList(s));
            logEvent(`Agent disconnected: ${agent_id}`);
            emitTraffic(io, tenantId, { type: 'disconnect', agent_id });
        }
    });
}

function getFleetList(s) {
    return Object.values(s.agents);
}

// Emit to all sockets belonging to a specific tenant
function emitToTenant(io, tenantId, event, data) {
    const room = `tenant:${tenantId}`;
    io.to(room).emit(event, data);
}

module.exports = { register, emitToTenant, getFleetList };
