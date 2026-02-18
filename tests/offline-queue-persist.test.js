const io = require('socket.io-client');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const PORT = 3345;
const BASE_URL = `http://localhost:${PORT}`;
const SECRET = 'very-secret-key-123';
const DATA_DIR = path.join(__dirname, '..', 'data-test-offline-queue-persist');

let serverProcess = null;

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function clearPort(port) {
    await new Promise((resolve) => {
        exec(`lsof -t -i:${port} | xargs kill -9 2>/dev/null`, () => resolve());
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
}

function startServer() {
    return new Promise((resolve, reject) => {
        serverProcess = spawn('node', ['server.js'], {
            cwd: path.join(__dirname, '..'),
            env: {
                ...process.env,
                PORT,
                CLAWNET_SECRET_KEY: SECRET,
                DATA_DIR,
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
        setTimeout(() => reject(new Error('Server startup timeout')), 10000);
    });
}

async function stopServer() {
    await new Promise((resolve) => {
        if (!serverProcess) return resolve();
        serverProcess.kill('SIGTERM');
        serverProcess.on('exit', resolve);
        setTimeout(resolve, 1000);
    });
    serverProcess = null;
}

function waitForTask(socket, matcher, timeoutMs = 6000) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Task wait timeout')), timeoutMs);
        socket.on('task_update', (tasks) => {
            const found = tasks.find(matcher);
            if (found) {
                clearTimeout(timeout);
                resolve(found);
            }
        });
    });
}

async function connect(agentId, role) {
    const socket = io(BASE_URL, {
        auth: { token: SECRET, agent_id: agentId, role },
        transports: ['websocket'],
    });
    await new Promise((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', (err) => reject(err || new Error('connect_error')));
        setTimeout(() => reject(new Error('connect timeout')), 5000);
    });
    return socket;
}

async function run() {
    await clearPort(PORT);
    if (fs.existsSync(DATA_DIR)) fs.rmSync(DATA_DIR, { recursive: true });
    fs.mkdirSync(DATA_DIR, { recursive: true });

    try {
        await startServer();

        const master = await connect('master-1', 'master');
        master.emit('dispatch', { to: 'worker-offline', cmd: 'echo queued-persist' });

        const queued = await waitForTask(master, (t) => t.cmd === 'echo queued-persist' && t.status === 'QUEUED');
        assert(queued && queued.delivery_status === 'QUEUED', 'Expected delivery_status QUEUED');

        master.disconnect();
        await stopServer();

        await startServer();

        const worker = await connect('worker-offline', 'worker');
        const delivered = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Queued task not delivered after server restart')), 6000);
            worker.on('command', (cmd) => {
                clearTimeout(timeout);
                resolve(cmd);
            });
        });

        assert(delivered && delivered.cmd === 'echo queued-persist', `Expected queued cmd, got ${delivered ? delivered.cmd : 'none'}`);
        worker.disconnect();

        console.log('✓ queued tasks survive server restart and flush on agent connect');
    } finally {
        await stopServer();
        await clearPort(PORT);
        if (fs.existsSync(DATA_DIR)) fs.rmSync(DATA_DIR, { recursive: true });
    }
}

run().catch((err) => {
    console.error(`✗ offline queue persistence failed: ${err && err.message ? err.message : String(err)}`);
    process.exit(1);
});
