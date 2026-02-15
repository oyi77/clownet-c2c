const socketio = require('socket.io');
const { resolveTenant } = require('../auth');
const state = require('../state');
const fleet = require('./fleet');
const dispatch = require('./dispatch');
const chat = require('./chat');
const rooms = require('./rooms');
const sharedMemory = require('./shared-memory');
const credentials = require('./credentials');
const fileSharing = require('./file-sharing');
const skills = require('./skills');

function setup(server) {
    const io = new socketio.Server(server, {
        cors: { origin: '*' },
        transports: ['websocket', 'polling'],
    });

    // Auth middleware
    io.use((socket, next) => {
        const token = socket.handshake.auth.token;
        const tenantId = resolveTenant(token);

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

        // Register all handlers
        fleet.register(io, socket, ctx);
        dispatch.register(io, socket, ctx);
        chat.register(io, socket, ctx);
        rooms.register(io, socket, ctx);
        sharedMemory.register(io, socket, ctx);
        credentials.register(io, socket, ctx);
        fileSharing.register(io, socket, ctx);
        skills.register(io, socket, ctx);

        socket.on('disconnect', () => {
             s.connectionEvents.push({ type: 'disconnect', agentId: agent_id, timestamp: new Date() });
             if (s.connectionEvents.length > 100) s.connectionEvents.shift();
             io.to(`tenant:${tenantId}`).emit('connection_events_update', s.connectionEvents);
        });
    });

    return io;
}

module.exports = { setup };
