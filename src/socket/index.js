const socketio = require('socket.io');
const { resolveTenant } = require('../auth');
const fleet = require('./fleet');
const dispatch = require('./dispatch');
const chat = require('./chat');
const rooms = require('./rooms');

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
        const tenantId = socket.tenantId;

        // Join tenant room for scoped broadcasts
        socket.join(`tenant:${tenantId}`);

        const ctx = { agent_id, role, specs, tenantId };

        // Register all handlers
        fleet.register(io, socket, ctx);
        dispatch.register(io, socket, ctx);
        chat.register(io, socket, ctx);
        rooms.register(io, socket, ctx);
    });

    return io;
}

module.exports = { setup };
