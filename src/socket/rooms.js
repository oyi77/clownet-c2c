const state = require('../state');
const { logEvent } = require('../utils/logger');

function register(io, socket, ctx) {
    const { agent_id, tenantId } = ctx;
    const s = state.getTenantState(tenantId);

    socket.on('join_room', (payload) => {
        if (!payload || !payload.room) return;
        const room = payload.room;

        // Track in state
        if (!s.rooms[room]) s.rooms[room] = new Set();
        s.rooms[room].add(agent_id);

        // Join Socket.io room
        socket.join(room);

        // Notify room members
        io.to(room).emit('room_update', {
            action: 'join',
            agent_id: agent_id,
            room: room,
            members: Array.from(s.rooms[room]),
        });

        logEvent(`Room join: ${agent_id} -> ${room}`);
    });

    socket.on('leave_room', (payload) => {
        if (!payload || !payload.room) return;
        const room = payload.room;

        // Remove from state
        if (s.rooms[room]) {
            s.rooms[room].delete(agent_id);
            if (s.rooms[room].size === 0) delete s.rooms[room];
        }

        // Leave Socket.io room
        socket.leave(room);

        // Notify remaining room members
        io.to(room).emit('room_update', {
            action: 'leave',
            agent_id: agent_id,
            room: room,
            members: s.rooms[room] ? Array.from(s.rooms[room]) : [],
        });

        logEvent(`Room leave: ${agent_id} <- ${room}`);
    });
}

module.exports = { register };
