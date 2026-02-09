const io = require('socket.io-client');
const { spawn } = require('child_process');

const PORT = 3340;
const BASE_URL = `http://localhost:${PORT}`;
const SECRET = 'very-secret-key-123';

let serverProcess = null;

function startServer() {
    return new Promise((resolve, reject) => {
        serverProcess = spawn('node', ['server.js'], {
            cwd: __dirname + '/..',
            env: {
                ...process.env,
                PORT: PORT,
                CLAWNET_SECRET_KEY: SECRET,
                CLAWNET_COMMAND_DENYLIST: 'rm -rf',
                CLAWNET_COMMAND_RISKYLIST: 'shutdown',
                CLAWNET_ACK_TIMEOUT_MS: '2000'
            },
            stdio: 'pipe'
        });

        let ready = false;
        serverProcess.stdout.on('data', (data) => {
            if (data.toString().includes('listening') && !ready) {
                ready = true;
                setTimeout(resolve, 300);
            }
        });

        serverProcess.on('error', reject);
        setTimeout(() => reject(new Error('Server startup timeout')), 10000);
    });
}

function stopServer() {
    return new Promise((resolve) => {
        if (!serverProcess) return resolve();
        serverProcess.kill();
        serverProcess.on('exit', resolve);
        setTimeout(resolve, 1000);
    });
}

function waitForTask(socket, matcher, timeoutMs = 5000) {
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

function waitForCommand(socket, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Command wait timeout')), timeoutMs);
        socket.on('command', (cmd) => {
            clearTimeout(timeout);
            resolve(cmd);
        });
    });
}

async function run() {
    console.log('🛡️ Running Safety Controls Test...');
    await startServer();

    const master = io(BASE_URL, {
        auth: { token: SECRET, agent_id: 'master-1', role: 'master' },
        transports: ['websocket']
    });
    const worker = io(BASE_URL, {
        auth: { token: SECRET, agent_id: 'worker-1', role: 'worker' },
        transports: ['websocket']
    });

    await new Promise((resolve) => {
        let connected = 0;
        const done = () => {
            connected += 1;
            if (connected === 2) resolve();
        };
        master.on('connect', done);
        worker.on('connect', done);
    });

    master.emit('dispatch', { to: 'worker-1', cmd: 'rm -rf /' });
    const rejected = await waitForTask(master, (task) => task.cmd === 'rm -rf /' && task.status === 'REJECTED');
    if (!rejected) throw new Error('Expected rejected task');
    console.log('✅ Denylist rejection verified');

    master.emit('dispatch', { to: 'worker-1', cmd: 'shutdown now' });
    const pendingApproval = await waitForTask(master, (task) => task.cmd === 'shutdown now' && task.status === 'AWAITING_APPROVAL');
    if (!pendingApproval) throw new Error('Expected approval-required task');
    console.log('✅ Approval gating verified');

    const commandPromise = waitForCommand(worker, 5000);
    master.emit('approve_task', { id: pendingApproval.id });
    const command = await commandPromise;
    if (!command || command.cmd !== 'shutdown now') throw new Error('Expected approved command to be dispatched');
    console.log('✅ Approval dispatch verified');

    master.disconnect();
    worker.disconnect();
    await stopServer();
    console.log('🏁 Safety test passed.');
}

run().catch(async (err) => {
    console.error('❌ Safety test failed:', err);
    await stopServer();
    process.exit(1);
});
