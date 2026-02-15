const state = require('../state');
const persistence = require('../persistence');
const { logEvent } = require('../utils/logger');
const { recordTraffic } = require('../utils/audit');
const { emitTraffic } = require('./warden');
const { emitToTenant } = require('./fleet');

function register(io, socket, ctx) {
    const { agent_id, tenantId } = ctx;
    const s = state.getTenantState(tenantId);

    socket.on('chat', (payload) => {
        if (!payload || typeof payload !== 'object') return;

        const msg = {
            from: agent_id || 'master-ui',
            to: payload.to || 'all',
            msg: payload.msg || payload.message,
            ts: new Date().toISOString(),
            localId: payload.localId || null,
        };

        s.messages.push(msg);
        s.metrics.messages_total++;
        persistence.saveState(tenantId);

        if (msg.to && msg.to.startsWith('#')) {
            // Room-scoped chat: only emit to sockets in that Socket.io room
            io.to(msg.to).emit('chat_update', msg);
        } else if (msg.to === 'all') {
            // Global broadcast to tenant
            emitToTenant(io, tenantId, 'chat_update', msg);
        } else {
            // DM: emit to specific agent + back to sender
            const target = s.agents[msg.to];
            if (target && target.sid) {
                io.to(target.sid).emit('chat_update', msg);
            }
            // Also send back to sender so they see their own DM
            socket.emit('chat_update', msg);
        }

        logEvent(`Chat: ${msg.from} -> ${msg.to}: ${msg.msg}`);
        recordTraffic({ type: 'chat', from: msg.from, to: msg.to, tenant_id: tenantId });
        emitTraffic(io, tenantId, { type: 'chat', from: msg.from, to: msg.to, msg: msg.msg });
    });
}

module.exports = { register };
