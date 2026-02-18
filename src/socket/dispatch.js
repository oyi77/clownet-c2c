const { v4: uuidv4 } = require('uuid');
const state = require('../state');
const persistence = require('../persistence');
const { logEvent } = require('../utils/logger');
const { recordTraffic } = require('../utils/audit');
const { emitTraffic } = require('./warden');
const { emitToTenant } = require('./fleet');
const { checkCommand } = require('./safety');

function isQueuedForAgent(task, agentId) {
    return !!task && task.agent_id === agentId && task.delivery_status === 'QUEUED';
}

function register(io, socket, ctx) {
    const { agent_id, tenantId } = ctx;
    const s = state.getTenantState(tenantId);

    // Flush queued tasks when an agent connects
    if (agent_id) {
        const queued = s.tasks.filter((t) => isQueuedForAgent(t, agent_id));
        if (queued.length > 0) {
            for (const task of queued) {
                task.status = 'PENDING';
                task.delivery_status = 'SENT';
                socket.emit('command', { id: task.id, cmd: task.cmd, trace_id: task.trace_id });
            }
            persistence.saveState(tenantId);
            emitToTenant(io, tenantId, 'task_update', s.tasks.slice(-20));
        }
    }

    socket.on('dispatch', (payload) => {
        if (!payload || typeof payload !== 'object') return;

        const traceId = uuidv4();
        const task = {
            id: uuidv4(),
            agent_id: payload.to,
            cmd: payload.cmd,
            status: 'PENDING',
            delivery_status: 'PENDING',
            trace_id: traceId,
            ts: new Date().toISOString(),
            result: '',
        };

        // Safety check
        const safety = checkCommand(payload.cmd);
        if (safety.rejected) {
            task.status = 'REJECTED';
            task.delivery_status = 'REJECTED';
            task.result = safety.reason;
            s.tasks.push(task);
            s.metrics.tasks_total++;
            s.metrics.tasks_failed++;
            persistence.saveState(tenantId);
            emitToTenant(io, tenantId, 'task_update', s.tasks.slice(-20));
            logEvent(`Dispatch REJECTED: cmd="${payload.cmd}" reason="${safety.reason}"`);
            return;
        }

        if (safety.needsApproval) {
            task.status = 'AWAITING_APPROVAL';
            task.delivery_status = 'AWAITING_APPROVAL';
            task.result = safety.reason;
            s.tasks.push(task);
            s.metrics.tasks_total++;
            persistence.saveState(tenantId);
            emitToTenant(io, tenantId, 'task_update', s.tasks.slice(-20));
            logEvent(`Dispatch AWAITING_APPROVAL: cmd="${payload.cmd}"`);
            return;
        }

        s.tasks.push(task);
        s.metrics.tasks_total++;
        persistence.saveState(tenantId);
        emitToTenant(io, tenantId, 'task_update', s.tasks.slice(-20));
        logEvent(`Dispatch: task=${task.id} to=${task.agent_id} cmd=${payload.cmd}`);

        recordTraffic({ type: 'dispatch', agent_id: payload.to, cmd: payload.cmd, task_id: task.id, tenant_id: tenantId });
        emitTraffic(io, tenantId, { type: 'dispatch', agent_id: payload.to, cmd: payload.cmd, task_id: task.id });

        deliverTask(io, socket, s, task, tenantId);
    });

    socket.on('approve_task', (payload) => {
        if (!payload || !payload.id) return;
        const task = s.tasks.find(t => t.id === payload.id);
        if (task && task.status === 'AWAITING_APPROVAL') {
            task.status = 'PENDING';
            task.delivery_status = 'PENDING';
            task.result = '';
            persistence.saveState(tenantId);
            emitToTenant(io, tenantId, 'task_update', s.tasks.slice(-20));
            logEvent(`Task approved: ${task.id}`);
            deliverTask(io, socket, s, task, tenantId);
        }
    });

    socket.on('command_ack', (payload) => {
        if (!payload || !payload.id) return;
        const task = s.tasks.find(t => t.id === payload.id);
        if (task) {
            task.delivery_status = 'ACKED';
            persistence.saveState(tenantId);
            emitToTenant(io, tenantId, 'task_update', s.tasks.slice(-20));
        }
    });

    socket.on('task_result', (payload, ack) => {
        if (!payload || !payload.id) return;
        const task = s.tasks.find(t => t.id === payload.id);
        if (task) {
            task.status = (payload.status || 'UNKNOWN').toUpperCase();
            task.result = payload.output || '';
            if (task.delivery_status !== 'ACKED') {
                task.delivery_status = 'ACKED';
            }

            if (task.status === 'SUCCESS') s.metrics.tasks_success++;
            else if (task.status === 'FAIL' || task.status === 'FAILED') s.metrics.tasks_failed++;

            persistence.saveState(tenantId);
            emitToTenant(io, tenantId, 'task_update', s.tasks.slice(-20));
            emitToTenant(io, tenantId, 'intel_update', { type: 'task', task });
            logEvent(`Task result: ${task.id} status=${task.status} agent=${task.agent_id}`);

            recordTraffic({ type: 'task_result', task_id: task.id, status: task.status, agent_id: task.agent_id, tenant_id: tenantId });
            emitTraffic(io, tenantId, { type: 'task_result', task_id: task.id, status: task.status, agent_id: task.agent_id });
        }

        if (typeof ack === 'function') ack({ ok: true });
    });
}

function deliverTask(io, socket, s, task, tenantId) {
    if (task.agent_id === 'all') {
        task.delivery_status = 'SENT';
        socket.broadcast.emit('command', { id: task.id, cmd: task.cmd, trace_id: task.trace_id });
    } else {
        const target = s.agents[task.agent_id];
        if (target && target.status === 'online') {
            task.delivery_status = 'SENT';
            io.to(target.sid).emit('command', { id: task.id, cmd: task.cmd, trace_id: task.trace_id });
        } else {
            // Agent offline — queue for delivery
            task.status = 'QUEUED';
            task.delivery_status = 'QUEUED';
            logEvent(`Task queued (agent offline): ${task.id} to=${task.agent_id}`);
        }
    }
    persistence.saveState(tenantId);
    emitToTenant(io, tenantId, 'task_update', s.tasks.slice(-20));
}

module.exports = { register };
