const io = require('socket.io-client');
const { spawn, exec } = require('child_process');
const path = require('path');

const PORT = 3351;
const BASE_URL = `http://localhost:${PORT}`;
const SECRET = 'very-secret-key-123';

let serverProcess = null;

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function clearPort(port) {
    await new Promise((resolve) => {
        exec(`lsof -t -i:${port} | xargs kill -9 2>/dev/null`, () => resolve());
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
}

async function startServer() {
    await clearPort(PORT);

    return new Promise((resolve, reject) => {
        serverProcess = spawn('node', ['server.js'], {
            cwd: path.join(__dirname, '..'),
            env: {
                ...process.env,
                PORT,
                CLAWNET_SECRET_KEY: SECRET,
                CLAWNET_SHELL_ENABLED: '1',
            },
            stdio: 'pipe',
        });

        let ready = false;
        serverProcess.stdout.on('data', (data) => {
            if (data.toString().includes('listening') && !ready) {
                ready = true;
                setTimeout(resolve, 250);
            }
        });

        serverProcess.on('error', reject);
        setTimeout(() => {
            if (!ready) reject(new Error('Server startup timeout'));
        }, 10000);
    });
}

async function stopServer() {
    await new Promise((resolve) => {
        if (!serverProcess) return resolve();
        serverProcess.kill('SIGTERM');
        serverProcess.on('exit', resolve);
        setTimeout(resolve, 1000);
    });
    await clearPort(PORT);
}

async function connect(agentId, role) {
    const socket = io(BASE_URL, {
        auth: { token: SECRET, agent_id: agentId, role, specs: {} },
        transports: ['websocket'],
        timeout: 2000,
    });
    await new Promise((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', (err) => reject(err || new Error('connect_error')));
        setTimeout(() => reject(new Error('connect timeout')), 3000);
    });
    return socket;
}

async function run() {
    try {
        await startServer();

        const worker = await connect('worker-flush', 'worker');
        const master = await connect('master-ui', 'master');

        worker.once('shell_start', (_payload, ack) => {
            if (typeof ack === 'function') ack({ ok: true });
        });

        const startAck = await new Promise((resolve, reject) => {
            master.timeout(1500).emit('shell_start', { agent_id: 'worker-flush', cols: 80, rows: 24 }, (err, res) => {
                if (err) return reject(err);
                if (!res || res.ok !== true) return reject(new Error('shell_start not ok'));
                resolve(res);
            });
        });

        const chatUpdatePromise = new Promise((resolve, reject) => {
            master.once('chat_update', (payload) => resolve(payload));
            setTimeout(() => reject(new Error('chat_update not received')), 1500);
        });

        worker.emit('shell_output', { session_id: startAck.session_id, data: 'hello\n', encoding: 'utf8', stream: 'stdout' });
        master.emit('shell_stop', { session_id: startAck.session_id, reason: 'test' });

        const msg = await chatUpdatePromise;
        assert(msg && typeof msg.msg === 'string', 'Expected chat message');
        assert(msg.msg.includes('SHELL OUTPUT'), 'Expected shell output prefix');

        master.disconnect();
        worker.disconnect();
        console.log('✓ shell buffer flushes to chat on stop');
    } finally {
        await stopServer();
    }
}

run().catch((err) => {
    console.error(`✗ shell buffer flush test failed: ${err && err.message ? err.message : String(err)}`);
    process.exit(1);
});
