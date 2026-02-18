const io = require('socket.io-client');
const { spawn, exec } = require('child_process');
const path = require('path');

const TEST_PORT = 3346;
const BASE_URL = `http://localhost:${TEST_PORT}`;
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
    await clearPort(TEST_PORT);

    return new Promise((resolve, reject) => {
        serverProcess = spawn('node', ['server.js'], {
            cwd: path.join(__dirname, '..'),
            env: {
                ...process.env,
                PORT: TEST_PORT,
                CLAWNET_SECRET_KEY: SECRET,
            },
            stdio: 'pipe',
        });

        let ready = false;
        serverProcess.stdout.on('data', (data) => {
            if (data.toString().includes('listening') && !ready) {
                ready = true;
                setTimeout(resolve, 200);
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
    await clearPort(TEST_PORT);
}

async function run() {
    try {
        await startServer();

        const socket = io(BASE_URL, {
            auth: { token: SECRET, agent_id: 'chat-ack-tester', role: 'worker', specs: {} },
            transports: ['websocket'],
            timeout: 2000,
        });

        await new Promise((resolve, reject) => {
            socket.once('connect', resolve);
            socket.once('connect_error', (err) => reject(err || new Error('connect_error')));
            setTimeout(() => reject(new Error('Socket connect timeout')), 3000);
        });

        const res = await new Promise((resolve, reject) => {
            socket.timeout(1000).emit('chat', { to: 'all', msg: 'ack test', localId: 'ack-1' }, (err, payload) => {
                if (err) return reject(err);
                resolve(payload);
            });
        });

        assert(res && res.ok === true, 'Expected ok:true from chat ack');
        socket.disconnect();
        console.log('✓ chat ack works');
    } finally {
        await stopServer();
    }
}

run().catch((err) => {
    console.error(`✗ chat ack failed: ${err && err.message ? err.message : String(err)}`);
    process.exit(1);
});
