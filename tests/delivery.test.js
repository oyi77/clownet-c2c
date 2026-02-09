const io = require('socket.io-client');
const { spawn } = require('child_process');

const PORT = 3341;
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
                CLAWNET_ACK_TIMEOUT_MS: '500',
                CLAWNET_ACK_MAX_RETRIES: '2'
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

async function run() {
    console.log('📦 Running Delivery Guarantees Test...');
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

    worker.on('command', (cmd) => {
        worker.emit('command_ack', { id: cmd.id, trace_id: cmd.trace_id });
        worker.emit('task_result', { id: cmd.id, status: 'SUCCESS', output: 'ok' });
    });

    master.emit('dispatch', { to: 'worker-1', cmd: 'echo delivery' });
    const delivered = await waitForTask(master, (task) => task.cmd === 'echo delivery' && task.status === 'SUCCESS');
    if (!delivered || delivered.delivery_status !== 'ACKED') {
        throw new Error('Expected ACKED delivery status');
    }
    console.log('✅ ACK + success verified');

    master.emit('dispatch', { to: 'worker-offline', cmd: 'echo queued' });
    const queued = await waitForTask(master, (task) => task.cmd === 'echo queued' && task.status === 'QUEUED');
    if (!queued) throw new Error('Expected queued task');
    console.log('✅ Offline queue verified');

    const offlineWorker = io(BASE_URL, {
        auth: { token: SECRET, agent_id: 'worker-offline', role: 'worker' },
        transports: ['websocket']
    });

    await new Promise((resolve) => offlineWorker.on('connect', resolve));

    const queuedHandled = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Queued command not delivered')), 5000);
        offlineWorker.on('command', (cmd) => {
            offlineWorker.emit('command_ack', { id: cmd.id, trace_id: cmd.trace_id });
            offlineWorker.emit('task_result', { id: cmd.id, status: 'SUCCESS', output: 'ok' });
            clearTimeout(timeout);
            resolve(cmd);
        });
    });

    if (!queuedHandled) throw new Error('Expected queued command to be delivered');
    const queuedSuccess = await waitForTask(master, (task) => task.id === queuedHandled.id && task.status === 'SUCCESS');
    if (!queuedSuccess) throw new Error('Queued task did not complete');
    console.log('✅ Queue flush verified');

    master.disconnect();
    worker.disconnect();
    offlineWorker.disconnect();
    await stopServer();
    console.log('🏁 Delivery test passed.');
}

run().catch(async (err) => {
    console.error('❌ Delivery test failed:', err);
    await stopServer();
    process.exit(1);
});
