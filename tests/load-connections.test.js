const io = require('socket.io-client');
const { spawn, exec } = require('child_process');
const path = require('path');

const PORT = 3361;
const BASE_URL = `http://localhost:${PORT}`;
const SECRET = 'very-secret-key-123';

const CONCURRENCY = 50;

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

async function connect(agentId) {
    const socket = io(BASE_URL, {
        auth: { token: SECRET, agent_id: agentId, role: 'worker', specs: {} },
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

        const sockets = await Promise.all(
            Array.from({ length: CONCURRENCY }, (_v, i) => connect(`load-worker-${i}`))
        );

        assert(sockets.length === CONCURRENCY, 'Expected all sockets to connect');
        sockets.forEach((s) => s.disconnect());

        console.log(`✓ load test: ${CONCURRENCY} concurrent connections`);
    } finally {
        await stopServer();
    }
}

run().catch((err) => {
    console.error(`✗ load connections test failed: ${err && err.message ? err.message : String(err)}`);
    process.exit(1);
});
