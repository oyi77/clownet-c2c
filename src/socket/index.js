const socketio = require('socket.io');
const { resolveTenant } = require('../auth');
const { verifyToken } = require('../middleware/auth');
const state = require('../state');
const persistence = require('../persistence');
const { logEvent } = require('../utils/logger');
const fleet = require('./fleet');
const redirection = require('./redirection');
const dispatch = require('./dispatch');
const chat = require('./chat');
const rooms = require('./rooms');
const sharedMemory = require('./shared-memory');
const credentials = require('./credentials');
const fileSharing = require('./file-sharing');
const skills = require('./skills');
const orchestration = require('./orchestration');
const config = require('./config');
const roles = require('./roles');
const autoOrchestration = require('./auto-orchestration');
const shell = require('./shell');

function mastersRoom(tenantId) {
    return `tenant:${tenantId}:masters`;
}

function recordServerError(io, ctx, eventName, err) {
    const tenantId = ctx.tenantId;
    const message = err && err.message ? err.message : String(err || 'Unknown error');
    const msg = {
        from: 'server',
        to: '#ops',
        msg: `ERROR: event=${eventName} agent=${ctx.agent_id || 'unknown'} ${message}`,
        ts: new Date().toISOString(),
        localId: `server_error:${Date.now()}:${Math.random().toString(16).slice(2)}`
    };

    try {
        const s = state.getTenantState(tenantId);
        s.messages.push(msg);
        s.metrics.messages_total++;
        persistence.saveState(tenantId);
    } catch (_e) {}

    try {
        io.to(mastersRoom(tenantId)).emit('chat_update', msg);
    } catch (_e) {}

    try {
        logEvent(`Socket handler error: tenant=${tenantId} event=${eventName} agent=${ctx.agent_id || 'unknown'} err=${message}`);
    } catch (_e) {}
}

function wrapSocketHandlers(io, socket, ctx) {
    const originalOn = socket.on.bind(socket);

    socket.on = (eventName, handler) => {
        return originalOn(eventName, (...args) => {
            try {
                const res = handler(...args);
                if (res && typeof res.then === 'function') {
                    res.catch((err) => {
                        const maybeAck = args[args.length - 1];
                        if (typeof maybeAck === 'function') {
                            try { maybeAck({ ok: false, error: 'INTERNAL_ERROR' }); } catch (_e) {}
                        }
                        recordServerError(io, ctx, eventName, err);
                    });
                }
            } catch (err) {
                const maybeAck = args[args.length - 1];
                if (typeof maybeAck === 'function') {
                    try { maybeAck({ ok: false, error: 'INTERNAL_ERROR' }); } catch (_e) {}
                }
                recordServerError(io, ctx, eventName, err);
            }
        });
    };

    return socket;
}

function setup(server) {
    const io = new socketio.Server(server, {
        cors: { origin: '*' },
        transports: ['websocket', 'polling'],
    });

    // Auth middleware
    io.use((socket, next) => {
        const token = socket.handshake.auth.token;
        let tenantId = resolveTenant(token);

        if (!tenantId) {
            const decoded = verifyToken(token);
            if (decoded) {
                tenantId = decoded.tenantId || 'default';
            }
        }

        if (!tenantId) {
            console.log(`Auth Failed. Got: ${token ? token.substring(0, 3) + '...' : 'null'}`);
            return next(new Error('Unauthorized'));
        }

        // Attach tenant info to socket
        socket.tenantId = tenantId;
        next();
    });

    io.on('connection', (socket) => {
        const { agent_id, role, specs } = socket.handshake.auth;
        const ip = socket.handshake.address;
        const tenantId = socket.tenantId;

        const s = state.getTenantState(tenantId);
        const settings = state.getSettings();

        // Client approval workflow
        if (settings.clientApprovalMode === 'manual') {
            if (settings.blacklistedClients.includes(agent_id)) {
                return socket.disconnect();
            }

            if (!settings.whitelistedClients.includes(agent_id)) {
                // Check if already pending
                if (!s.pendingClients.find(c => c.agentId === agent_id)) {
                    s.pendingClients.push({ agentId: agent_id, timestamp: new Date() });
                    // Notify dashboard of pending client
                    io.to(`tenant:${tenantId}`).emit('pending_clients_update', s.pendingClients);
                }
                return socket.disconnect();
            }
        }

        // Log connection event
        s.connectionEvents.push({ type: 'connect', agentId: agent_id, timestamp: new Date() });
        if (s.connectionEvents.length > 100) s.connectionEvents.shift(); // Keep last 100
        io.to(`tenant:${tenantId}`).emit('connection_events_update', s.connectionEvents);

        // Join tenant room for scoped broadcasts
        socket.join(`tenant:${tenantId}`);

        const ctx = { agent_id, role, specs, tenantId, ip };

        wrapSocketHandlers(io, socket, ctx);

        if (role === 'master') {
            socket.join(mastersRoom(tenantId));
        }

        socket.on('latency_ping', (_payload, ack) => {
            if (typeof ack === 'function') {
                ack({ ok: true, server_ts: new Date().toISOString() });
            }
        });

        // Register all handlers
        fleet.register(io, socket, ctx);
        redirection.register(io, socket, ctx);
        dispatch.register(io, socket, ctx);
        chat.register(io, socket, ctx);
        rooms.register(io, socket, ctx);
        sharedMemory.register(io, socket, ctx);
        credentials.register(io, socket, ctx);
        fileSharing.register(io, socket, ctx);
        skills.register(io, socket, ctx);
        orchestration.register(io, socket, ctx);
        config.register(io, socket, ctx);
        roles.register(io, socket, ctx);
        autoOrchestration.register(io, socket, ctx);
        shell.register(io, socket, ctx);

        socket.on('disconnect', () => {
             s.connectionEvents.push({ type: 'disconnect', agentId: agent_id, timestamp: new Date() });
             if (s.connectionEvents.length > 100) s.connectionEvents.shift();
             io.to(`tenant:${tenantId}`).emit('connection_events_update', s.connectionEvents);
        });
    });

    return io;
}

module.exports = { setup };
