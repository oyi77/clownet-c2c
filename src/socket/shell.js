const { v4: uuidv4 } = require('uuid');
const state = require('../state');
const persistence = require('../persistence');
const { logEvent } = require('../utils/logger');

const sessionsByTenant = new Map();
const buffersBySession = new Map();
const ioByTenant = new Map();

let cleanupStarted = false;

function getTenantSessions(tenantId) {
    const tid = tenantId || 'default';
    if (!sessionsByTenant.has(tid)) sessionsByTenant.set(tid, new Map());
    return sessionsByTenant.get(tid);
}

function getIntEnv(name, defaultValue) {
    const raw = process.env[name];
    if (!raw) return defaultValue;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : defaultValue;
}

function isShellEnabled() {
    return process.env.CLAWNET_SHELL_ENABLED === '1';
}

function countAgentSessions(sessions, agentId) {
    let count = 0;
    for (const s of sessions.values()) {
        if (s.agent_id === agentId) count += 1;
    }
    return count;
}

function parseShellsCommand(rawMsg) {
    if (typeof rawMsg !== 'string') return null;
    const raw = rawMsg.trim();
    if (raw === '/shells') return { command: '/shells', agentId: null };
    if (!raw.startsWith('/shells ')) return null;
    const arg = raw.slice('/shells '.length).trim();
    if (!arg) return { command: '/shells', agentId: null };
    return { command: `/shells ${arg}`, agentId: arg };
}

function renderShellSessionsMessage(command, sessions, agentIdFilter) {
    const now = Date.now();
    const lines = [];
    for (const sess of sessions.values()) {
        if (agentIdFilter && sess.agent_id !== agentIdFilter) continue;
        const lastActivity = Number.isFinite(sess.last_activity_ms) ? sess.last_activity_ms : now;
        const ageSec = Math.max(0, Math.floor((now - lastActivity) / 1000));
        lines.push(`- session=${sess.session_id} agent=${sess.agent_id} idle_s=${ageSec}`);
    }

    if (lines.length === 0) {
        return `SHELL SESSIONS (${command}): none`;
    }
    return `SHELL SESSIONS (${command}):\n${lines.join('\n')}`;
}

function cleanupSessionsForSid(io, tenantId, sid, reason) {
    const sessions = getTenantSessions(tenantId);
    for (const [sessionId, sess] of sessions.entries()) {
        if (sess.master_sid === sid) {
            if (sess.agent_sid) io.to(sess.agent_sid).emit('shell_stop', { session_id: sessionId, reason });
            flushBuffer(io, tenantId, sessionId);
            sessions.delete(sessionId);
        } else if (sess.agent_sid === sid) {
            if (sess.master_sid) io.to(sess.master_sid).emit('shell_exit', { session_id: sessionId, reason });
            flushBuffer(io, tenantId, sessionId);
            sessions.delete(sessionId);
        }
    }
}

function flushBuffer(io, tenantId, sessionId) {
    const entry = buffersBySession.get(sessionId);
    if (!entry) return;
    try { clearTimeout(entry.timer); } catch (_e) {}
    buffersBySession.delete(sessionId);

    const sessions = getTenantSessions(tenantId);
    const sess = sessions.get(sessionId);
    if (!sess) return;

    const text = entry.buf;
    if (!text) return;

    const s = state.getTenantState(tenantId);
    const msg = {
        from: sess.agent_id,
        to: sess.master_agent_id || 'master-ui',
        msg: `SHELL OUTPUT (${sess.agent_id}):\n\`\`\`\n${text}\n\`\`\``,
        ts: new Date().toISOString(),
        localId: `shell:${sessionId}:${Date.now()}`,
    };

    s.messages.push(msg);
    s.metrics.messages_total++;
    persistence.saveState(tenantId);
    io.to(sess.master_sid).emit('chat_update', msg);
}

function bufferOutput(io, tenantId, sessionId, chunk) {
    const existing = buffersBySession.get(sessionId);
    if (existing) {
        existing.buf += chunk;
        if (existing.buf.length > 2000) {
            existing.buf = existing.buf.slice(existing.buf.length - 2000);
        }
        return;
    }

    const timer = setTimeout(() => {
        flushBuffer(io, tenantId, sessionId);
    }, 250);

    buffersBySession.set(sessionId, { buf: chunk, timer });
}

function startCleanupLoop() {
    if (cleanupStarted) return;
    cleanupStarted = true;

    const idleMs = getIntEnv('CLAWNET_SHELL_IDLE_TIMEOUT_MS', 60 * 60 * 1000);
    setInterval(() => {
        const now = Date.now();
        for (const [tid, sessions] of sessionsByTenant.entries()) {
            const ioRef = ioByTenant.get(tid);
            if (!ioRef) continue;
            for (const [sessionId, sess] of sessions.entries()) {
                const last = sess.last_activity_ms || 0;
                if (last > 0 && now - last > idleMs) {
                    flushBuffer(ioRef, tid, sessionId);
                    if (sess.agent_sid) ioRef.to(sess.agent_sid).emit('shell_stop', { session_id: sessionId, reason: 'timeout' });
                    if (sess.master_sid) ioRef.to(sess.master_sid).emit('shell_exit', { session_id: sessionId, reason: 'timeout' });
                    sessions.delete(sessionId);
                }
            }
        }
    }, 60000);
}

function register(io, socket, ctx) {
    const { agent_id, role, tenantId } = ctx;
    const s = state.getTenantState(tenantId);
    const sessions = getTenantSessions(tenantId);
    const maxPerAgent = getIntEnv('CLAWNET_SHELL_MAX_SESSIONS_PER_AGENT', 2);

    ioByTenant.set(tenantId || 'default', io);

    startCleanupLoop();

    socket.on('shell_start', (payload, ack) => {
        if (typeof ack !== 'function') return;
        if (!isShellEnabled()) return ack({ ok: false, error: 'SHELL_DISABLED' });
        if (role !== 'master') return ack({ ok: false, error: 'FORBIDDEN' });
        if (!payload || typeof payload !== 'object') return ack({ ok: false, error: 'BAD_REQUEST' });

        const targetAgentId = payload.agent_id;
        if (!targetAgentId || typeof targetAgentId !== 'string') return ack({ ok: false, error: 'BAD_REQUEST' });
        if (countAgentSessions(sessions, targetAgentId) >= maxPerAgent) return ack({ ok: false, error: 'SESSION_LIMIT' });

        const target = s.agents[targetAgentId];
        if (!target || target.status !== 'online' || !target.sid) return ack({ ok: false, error: 'AGENT_OFFLINE' });

        const sessionId = uuidv4();
        const masterSid = socket.id;
        const agentSid = target.sid;

        const startPayload = {
            session_id: sessionId,
            cols: payload.cols,
            rows: payload.rows,
        };

        sessions.set(sessionId, {
            session_id: sessionId,
            agent_id: targetAgentId,
            master_agent_id: agent_id,
            master_sid: masterSid,
            agent_sid: agentSid,
            created_at: new Date().toISOString(),
            last_activity_ms: Date.now(),
        });

        io.to(agentSid)
            .timeout(2000)
            .emit('shell_start', startPayload, (err, responses) => {
                if (err) {
                    sessions.delete(sessionId);
                    return ack({ ok: false, error: 'AGENT_ACK_TIMEOUT' });
                }

                const res = Array.isArray(responses) ? responses[0] : null;
                if (!res || res.ok !== true) {
                    sessions.delete(sessionId);
                    return ack({ ok: false, error: 'AGENT_REJECTED', agent_response: res || null });
                }

                logEvent(`Shell started: session=${sessionId} agent=${targetAgentId} tenant=${tenantId}`);
                return ack({ ok: true, session_id: sessionId });
            });
    });

    socket.on('shell_input', (payload) => {
        if (!payload || typeof payload !== 'object') return;
        const sessionId = payload.session_id;
        if (!sessionId || typeof sessionId !== 'string') return;
        const sess = sessions.get(sessionId);
        if (!sess) return;
        if (socket.id !== sess.master_sid) return;
        sess.last_activity_ms = Date.now();
        io.to(sess.agent_sid).emit('shell_input', payload);
    });

    socket.on('shell_resize', (payload) => {
        if (!payload || typeof payload !== 'object') return;
        const sessionId = payload.session_id;
        if (!sessionId || typeof sessionId !== 'string') return;
        const sess = sessions.get(sessionId);
        if (!sess) return;
        if (socket.id !== sess.master_sid) return;
        sess.last_activity_ms = Date.now();
        io.to(sess.agent_sid).emit('shell_resize', payload);
    });

    socket.on('shell_stop', (payload) => {
        if (!payload || typeof payload !== 'object') return;
        const sessionId = payload.session_id;
        if (!sessionId || typeof sessionId !== 'string') return;
        const sess = sessions.get(sessionId);
        if (!sess) return;
        if (socket.id !== sess.master_sid) return;
        io.to(sess.agent_sid).emit('shell_stop', { session_id: sessionId, reason: payload.reason || 'user' });
        flushBuffer(io, tenantId, sessionId);
        sessions.delete(sessionId);
    });

    socket.on('shell_output', (payload) => {
        if (!payload || typeof payload !== 'object') return;
        const sessionId = payload.session_id;
        if (!sessionId || typeof sessionId !== 'string') return;
        const sess = sessions.get(sessionId);
        if (!sess) return;
        if (socket.id !== sess.agent_sid) return;
        sess.last_activity_ms = Date.now();
        io.to(sess.master_sid).emit('shell_output', payload);
        if (typeof payload.data === 'string' && payload.data.length > 0) {
            bufferOutput(io, tenantId, sessionId, payload.data);
        }
    });

    socket.on('shell_exit', (payload) => {
        if (!payload || typeof payload !== 'object') return;
        const sessionId = payload.session_id;
        if (!sessionId || typeof sessionId !== 'string') return;
        const sess = sessions.get(sessionId);
        if (!sess) return;
        if (socket.id !== sess.agent_sid) return;
        io.to(sess.master_sid).emit('shell_exit', payload);
        flushBuffer(io, tenantId, sessionId);
        sessions.delete(sessionId);
    });

    socket.on('chat', (payload) => {
        if (role !== 'master') return;
        if (!payload || typeof payload !== 'object') return;

        const rawMsg = typeof payload.msg === 'string'
            ? payload.msg
            : (typeof payload.message === 'string' ? payload.message : null);
        const parsed = parseShellsCommand(rawMsg);
        if (!parsed) return;

        const msg = {
            from: 'server',
            to: agent_id || 'master-ui',
            msg: renderShellSessionsMessage(parsed.command, sessions, parsed.agentId),
            ts: new Date().toISOString(),
            localId: `shells:${Date.now()}:${Math.random().toString(16).slice(2)}`,
        };

        socket.emit('chat_update', msg);
    });

    socket.on('disconnect', () => {
        cleanupSessionsForSid(io, tenantId, socket.id, 'disconnect');
    });
}

module.exports = { register };
