const io = require('socket.io-client');
const { spawn, exec } = require('child_process');
const path = require('path');

const PORT = 3349;
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

        const worker = await connect('worker-pty', 'worker');
        const master = await connect('master-ui', 'master');

        const workerStartPromise = new Promise((resolve) => {
            worker.once('shell_start', (payload, ack) => {
                if (typeof ack !== 'function') {
                    throw new Error('Expected shell_start ack function on agent');
                }
                ack({ ok: true });
                resolve(payload);
            });
        });

        const masterAckPromise = new Promise((resolve, reject) => {
            master.timeout(1500).emit('shell_start', { agent_id: 'worker-pty', cols: 80, rows: 24 }, (err, res) => {
                if (err) return reject(err);
                if (!res || res.ok !== true) {
                    const details = res ? JSON.stringify(res) : 'null';
                    return reject(new Error(`shell_start not ok: ${details}`));
                }
                resolve(res);
            });
        });

        const [workerStart, masterAck] = await Promise.all([workerStartPromise, masterAckPromise]);
        assert(typeof workerStart.session_id === 'string', 'Expected session_id from worker');
        assert(typeof masterAck.session_id === 'string', 'Expected session_id from master ack');
        assert(workerStart.session_id === masterAck.session_id, 'Expected matching session_id');

        const sessionId = masterAck.session_id;

        const receivedInput = await new Promise((resolve, reject) => {
            worker.once('shell_input', (payload) => resolve(payload));
            master.emit('shell_input', { session_id: sessionId, data: 'ls\n', encoding: 'utf8' });
            setTimeout(() => reject(new Error('shell_input not received')), 1500);
        });
        assert(receivedInput && receivedInput.data === 'ls\n', 'Expected forwarded input');

        const receivedOutput = await new Promise((resolve, reject) => {
            master.once('shell_output', (payload) => resolve(payload));
            worker.emit('shell_output', { session_id: sessionId, data: 'file1\n', encoding: 'utf8', stream: 'stdout' });
            setTimeout(() => reject(new Error('shell_output not received')), 1500);
        });
        assert(receivedOutput && receivedOutput.data === 'file1\n', 'Expected forwarded output');

        const stopReceived = await new Promise((resolve, reject) => {
            worker.once('shell_stop', (payload) => resolve(payload));
            master.emit('shell_stop', { session_id: sessionId });
            setTimeout(() => reject(new Error('shell_stop not received')), 1500);
        });
        assert(stopReceived && stopReceived.session_id === sessionId, 'Expected stop forwarded');

        master.disconnect();
        worker.disconnect();
        console.log('✓ shell routing start/input/output/stop');
    } finally {
        await stopServer();
    }
}

run().catch((err) => {
    console.error(`✗ shell routing failed: ${err && err.message ? err.message : String(err)}`);
    process.exit(1);
});
