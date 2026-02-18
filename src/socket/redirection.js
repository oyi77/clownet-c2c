const state = require('../state');
const persistence = require('../persistence');

function mastersRoom(tenantId) {
    return `tenant:${tenantId}:masters`;
}

function makeLocalId(prefix) {
    return `${prefix}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

function isExecCommand(cmd) {
    const raw = typeof cmd === 'string' ? cmd.trim() : '';
    if (raw === '/exec') return true;
    return raw.startsWith('/exec ');
}

function persistChatMessage(tenantId, msg) {
    const s = state.getTenantState(tenantId);
    s.messages.push(msg);
    s.metrics.messages_total++;
    persistence.saveState(tenantId);
}

function register(io, socket, ctx) {
    const { agent_id, role, tenantId } = ctx;
    const room = mastersRoom(tenantId);

    if (role === 'master') {
        socket.join(room);
    }

    socket.on('dispatch', (payload) => {
        if (role !== 'master') return;
        if (!payload || typeof payload !== 'object') return;

        const cmd = payload.cmd;
        if (isExecCommand(cmd)) return;

        const msg = {
            from: agent_id || 'master-ui',
            to: '#ops',
            msg: `CMD: to=${payload.to} ${cmd}`,
            ts: new Date().toISOString(),
            localId: makeLocalId('cmd'),
        };

        persistChatMessage(tenantId, msg);
        io.to(room).emit('chat_update', msg);
    });

    socket.on('task_result', (payload) => {
        if (!payload || !payload.id) return;

        const s = state.getTenantState(tenantId);
        const task = s.tasks.find((t) => t.id === payload.id);
        if (!task) return;
        if (isExecCommand(task.cmd)) return;

        const status = (payload.status || 'UNKNOWN').toUpperCase();
        const output = payload.output || '';

        const msg = {
            from: task.agent_id,
            to: '#ops',
            msg: `RESULT: agent=${task.agent_id} status=${status}\n\n\`\`\`\n${output}\n\`\`\``,
            ts: new Date().toISOString(),
            localId: makeLocalId('result'),
        };

        persistChatMessage(tenantId, msg);
        io.to(room).emit('chat_update', msg);
    });
}

module.exports = { register };
