const io = require('socket.io-client');
const axios = require('axios');
const { spawn, exec } = require('child_process');
const path = require('path');

const PORT = 3353;
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

        const master = await connect('master-ui', 'master');

        let exitCode = null;
        serverProcess.once('exit', (code) => {
            exitCode = code;
        });

        master.emit('start_auto_orchestration', { orchestrationId: 'does-not-exist' });

        await new Promise((resolve) => setTimeout(resolve, 500));
        assert(exitCode === null, 'Expected server to stay alive after handler error');

        const health = await axios.get(`${BASE_URL}/`, { validateStatus: () => true });
        assert(health.status === 200, 'Expected health endpoint to respond');

        master.disconnect();
        console.log('✓ socket handler errors do not crash server');
    } finally {
        await stopServer();
    }
}

run().catch((err) => {
    console.error(`✗ socket error boundary test failed: ${err && err.message ? err.message : String(err)}`);
    process.exit(1);
});
