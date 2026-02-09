const io = require('socket.io-client');
const axios = require('axios');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 3343;
const BASE_URL = `http://localhost:${PORT}`;
const SECRET = 'very-secret-key-123';
const DATA_DIR = path.join(__dirname, '..', 'data');
const TRAFFIC_LOG = path.join(DATA_DIR, 'traffic.log');

let serverProcess = null;

function startServer() {
    return new Promise((resolve, reject) => {
        if (fs.existsSync(TRAFFIC_LOG)) fs.unlinkSync(TRAFFIC_LOG);
        serverProcess = spawn('node', ['server.js'], {
            cwd: __dirname + '/..',
            env: {
                ...process.env,
                PORT: PORT,
                CLAWNET_SECRET_KEY: SECRET
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

async function run() {
    console.log('📜 Running Audit + Metrics Test...');
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

    master.emit('chat', { to: 'all', msg: 'Audit hello' });
    master.emit('dispatch', { to: 'worker-1', cmd: 'echo audit' });

    await new Promise((resolve) => setTimeout(resolve, 800));

    const metrics = await axios.get(`${BASE_URL}/api/metrics`, {
        headers: { Authorization: `Bearer ${SECRET}` }
    });
    if (metrics.data.tasks_total < 1 || metrics.data.tasks_success < 1) {
        throw new Error('Metrics did not capture task results');
    }
    console.log('✅ Metrics endpoint verified');

    const traffic = await axios.get(`${BASE_URL}/api/traffic?limit=50`, {
        headers: { Authorization: `Bearer ${SECRET}` }
    });
    if (!traffic.data.entries || traffic.data.entries.length === 0) {
        throw new Error('Traffic API returned no entries');
    }
    console.log('✅ Traffic API verified');

    if (!fs.existsSync(TRAFFIC_LOG)) {
        throw new Error('Traffic log file missing');
    }
    const lines = fs.readFileSync(TRAFFIC_LOG, 'utf8').trim().split(/\r?\n/);
    const lastEntry = JSON.parse(lines[lines.length - 1]);
    if (!lastEntry.hash || lastEntry.hash.length !== 64) {
        throw new Error('Traffic log missing hash');
    }
    if (lastEntry.prev_hash !== null && lastEntry.prev_hash.length !== 64) {
        throw new Error('Traffic log prev_hash invalid');
    }
    if (lastEntry.tenant_id !== 'default') {
        throw new Error('Traffic log tenant_id missing');
    }
    console.log('✅ Audit log hash chain verified');

    master.disconnect();
    worker.disconnect();
    await stopServer();
    console.log('🏁 Audit + metrics test passed.');
}

run().catch(async (err) => {
    console.error('❌ Audit + metrics test failed:', err);
    await stopServer();
    process.exit(1);
});
