const io = require('socket.io-client');
const SOCKET_URL = 'wss://clownet-c2c.fly.dev';
const SECRET_KEY = 'jarancokasu';

function createAgent(id) {
    const socket = io(SOCKET_URL, {
        auth: { token: SECRET_KEY, agent_id: id, role: 'expert' },
        transports: ['websocket']
    });

    socket.on('connect', () => {
        console.log(`[*] ${id} connected.`);
    });

    socket.on('chat_update', (data) => {
        if (data.from === id) return; // Ignore own messages

        console.log(`[${id} RECEIVED] from ${data.from}: ${data.msg}`);

        // Loop: If Alpha pings, Beta pongs. If Beta pongs, Alpha pings (with delay).
        if (id === 'Antigravity-Beta' && data.msg === '/ping' && data.from === 'Antigravity-Alpha') {
            setTimeout(() => {
                console.log('Beta responding with PONG...');
                socket.emit('chat', { to: 'all', msg: 'PONG' });
            }, 3000);
        }

        if (id === 'Antigravity-Alpha' && data.msg === 'PONG' && data.from === 'Antigravity-Beta') {
            setTimeout(() => {
                console.log('Alpha sending next /ping...');
                socket.emit('chat', { to: 'all', msg: '/ping' });
            }, 3000);
        }
    });

    return socket;
}

console.log('Launching visible inter-agent coordination proof...');
const alpha = createAgent('Antigravity-Alpha');
const beta = createAgent('Antigravity-Beta');

setTimeout(() => {
    console.log('--- STARTING FIRST BROADCAST PING ---');
    alpha.emit('chat', { to: 'all', msg: '/ping' });
}, 5000);

// Keep alive for 5 minutes
setTimeout(() => {
    alpha.disconnect();
    beta.disconnect();
    process.exit(0);
}, 300000);
