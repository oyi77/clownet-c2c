const io = require('socket.io-client');
const SOCKET_URL = 'wss://clownet-c2c.fly.dev';
const SECRET_KEY = 'jarancokasu';

function createAgent(id, color) {
    const socket = io(SOCKET_URL, {
        auth: { token: SECRET_KEY, agent_id: id, role: 'expert' },
        transports: ['websocket']
    });

    socket.on('connect', () => {
        console.log(`[*] ${id} connected.`);
    });

    socket.on('chat_update', (data) => {
        if (data.from === id) return;

        console.log(`[${id} RECEIVED] from ${data.from} to ${data.to}: ${msgShort(data.msg)}`);

        // --- 1. DM Handling & "Proof Reporting" ---
        // If an agent receives a DM, they report it to 'all' so the user can see it happened.
        if (data.to === id && !data.to.startsWith('#')) {
            setTimeout(() => {
                socket.emit('chat', {
                    to: 'all',
                    msg: `[DM_PROOF] ${id} received private msg from ${data.from}: "${data.msg}"`
                });
            }, 2000);
        }

        // --- 2. Group Chat Coordination ---
        if (data.to === '#mission-control') {
            if (id === 'Antigravity-Beta' && data.msg.includes('JOIN_MISSION_01')) {
                setTimeout(() => socket.emit('chat', { to: '#mission-control', msg: 'Beta: Ready for Mission 01.' }), 1000);
            }
            if (id === 'Antigravity-Gamma' && data.msg.includes('JOIN_MISSION_01')) {
                setTimeout(() => socket.emit('chat', { to: '#mission-control', msg: 'Gamma: Ready for Mission 01.' }), 2000);
            }
            if (id === 'Antigravity-Alpha' && data.msg === 'Gamma: Ready for Mission 01.') {
                setTimeout(() => socket.emit('chat', { to: '#mission-control', msg: 'Alpha: Both agents ready. Mission 01 INITIATED.' }), 1000);
            }
        }
    });

    return socket;
}

function msgShort(m) { return m.length > 50 ? m.substring(0, 47) + '...' : m; }

console.log('--- Multi-Mode Agent Communication Proof ---');
const alpha = createAgent('Antigravity-Alpha');
const beta = createAgent('Antigravity-Beta');
const gamma = createAgent('Antigravity-Gamma');

setTimeout(() => {
    // Stage 1: Broadcast
    console.log('>> Stage 1: Global Broadcast');
    alpha.emit('chat', { to: 'all', msg: '--- STARTING MULTI-MODE TEST ---' });
}, 5000);

setTimeout(() => {
    // Stage 2: Direct DM (Alpha -> Beta)
    console.log('>> Stage 2: Private DM (Alpha to Beta)');
    alpha.emit('chat', { to: 'Antigravity-Beta', msg: 'SECRET_CODE_123' });
}, 8000);

setTimeout(() => {
    // Stage 3: Group Chat (#mission-control)
    console.log('>> Stage 3: #mission-control Room Setup');
    alpha.emit('join_room', { room: '#mission-control' });
    beta.emit('join_room', { room: '#mission-control' });
    gamma.emit('join_room', { room: '#mission-control' });
}, 12000);

setTimeout(() => {
    console.log('>> Stage 4: Group Chat Coordination');
    alpha.emit('chat', { to: '#mission-control', msg: 'Alpha: All agents JOIN_MISSION_01' });
}, 15000);

// Keep alive for 10 mins
setTimeout(() => {
    alpha.disconnect(); beta.disconnect(); gamma.disconnect();
    process.exit(0);
}, 600000);
