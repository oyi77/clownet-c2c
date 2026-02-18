const io = require('socket.io-client');
const { spawn, exec } = require('child_process');
const path = require('path');

const TEST_PORT = 3344;
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
            auth: { token: SECRET, agent_id: 'latency-tester', role: 'master', specs: {} },
            transports: ['websocket'],
            timeout: 2000,
        });

        await new Promise((resolve, reject) => {
            socket.once('connect', resolve);
            socket.once('connect_error', (err) => reject(err || new Error('connect_error')));
            setTimeout(() => reject(new Error('Socket connect timeout')), 3000);
        });

        const start = Date.now();
        const response = await new Promise((resolve, reject) => {
            socket.timeout(1000).emit('latency_ping', {}, (err, payload) => {
                if (err) return reject(err);
                resolve(payload);
            });
        });
        const rtt = Date.now() - start;

        assert(response && response.ok === true, 'Expected ok:true latency_ping response');
        assert(typeof response.server_ts === 'string', 'Expected server_ts string');
        assert(rtt >= 0, 'Expected non-negative rtt');

        socket.disconnect();
        console.log('✓ latency_ping ack works');
    } finally {
        await stopServer();
    }
}

run().catch((err) => {
    console.error(`✗ latency_ping failed: ${err && err.message ? err.message : String(err)}`);
    process.exit(1);
});
