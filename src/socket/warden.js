const state = require('../state');

// Emit traffic events only to warden-role agents in the same tenant.
function emitTraffic(io, tenantId, data) {
    const s = state.getTenantState(tenantId);
    const record = { ...data, ts: new Date().toISOString() };

    for (const agent of Object.values(s.agents)) {
        if (agent.role === 'warden' && agent.status === 'online') {
            io.to(agent.sid).emit('traffic', record);
        }
    }
}

module.exports = { emitTraffic };
