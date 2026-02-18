const io = require('socket.io-client');
const { spawn, exec } = require('child_process');
const path = require('path');

const PORT = 3352;
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

function waitForChat(master, predicate, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            cleanup();
            reject(new Error('chat_update not received'));
        }, timeoutMs);

        function onChat(payload) {
            if (!payload || typeof payload.msg !== 'string') return;
            if (!predicate(payload)) return;
            cleanup();
            resolve(payload);
        }

        function cleanup() {
            clearTimeout(timer);
            master.off('chat_update', onChat);
        }

        master.on('chat_update', onChat);
    });
}

async function run() {
    try {
        await startServer();

        const worker = await connect('worker-redir', 'worker');
        const master = await connect('master-ui', 'master');

        worker.once('command', (cmd) => {
            worker.emit('task_result', {
                id: cmd.id,
                status: 'SUCCESS',
                output: 'ok',
            });
        });

        master.emit('dispatch', { to: 'worker-redir', cmd: 'echo hello' });

        const cmdMsg = await waitForChat(master, (m) => m.msg.includes('CMD:'), 1500);
        assert(cmdMsg.msg.includes('echo hello'), 'Expected command text in chat');

        const resMsg = await waitForChat(master, (m) => m.msg.includes('RESULT:'), 1500);
        assert(resMsg.msg.includes('ok'), 'Expected result output in chat');

        let sawExecChat = false;
        master.on('chat_update', (m) => {
            if (m && typeof m.msg === 'string' && m.msg.includes('/exec')) sawExecChat = true;
        });
        master.emit('dispatch', { to: 'worker-redir', cmd: '/exec echo bypass' });
        await new Promise((resolve) => setTimeout(resolve, 500));
        assert(sawExecChat === false, 'Expected /exec dispatch not to be redirected into chat');

        master.disconnect();
        worker.disconnect();
        console.log('✓ dispatch + task_result redirect into chat (non-/exec)');
    } finally {
        await stopServer();
    }
}

run().catch((err) => {
    console.error(`✗ redirection test failed: ${err && err.message ? err.message : String(err)}`);
    process.exit(1);
});
