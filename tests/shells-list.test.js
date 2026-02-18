const io = require('socket.io-client');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 3353;
const BASE_URL = `http://localhost:${PORT}`;
const TENANTS_PATH = path.join(__dirname, 'tenants.shells-list.test.json');

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

function writeTenantsFile() {
    fs.writeFileSync(TENANTS_PATH, JSON.stringify({
        alpha: 'alpha-secret',
        beta: 'beta-secret'
    }));
}

function cleanupTenantsFile() {
    if (fs.existsSync(TENANTS_PATH)) fs.unlinkSync(TENANTS_PATH);
}

async function startServer() {
    await clearPort(PORT);

    return new Promise((resolve, reject) => {
        serverProcess = spawn('node', ['server.js'], {
            cwd: path.join(__dirname, '..'),
            env: {
                ...process.env,
                PORT,
                CLAWNET_TENANTS_PATH: TENANTS_PATH,
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

async function connect(token, agentId, role) {
    const socket = io(BASE_URL, {
        auth: { token, agent_id: agentId, role, specs: {} },
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

function waitForChat(socket, predicate, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            cleanup();
            reject(new Error('chat_update not received'));
        }, timeoutMs);

        function onChat(payload) {
            if (!predicate(payload)) return;
            cleanup();
            resolve(payload);
        }

        function cleanup() {
            clearTimeout(timer);
            socket.off('chat_update', onChat);
        }

        socket.on('chat_update', onChat);
    });
}

function waitForNoChat(socket, predicate, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            cleanup();
            resolve();
        }, timeoutMs);

        function onChat(payload) {
            if (!predicate(payload)) return;
            cleanup();
            reject(new Error('Unexpected chat_update received'));
        }

        function cleanup() {
            clearTimeout(timer);
            socket.off('chat_update', onChat);
        }

        socket.on('chat_update', onChat);
    });
}

async function startShellSession(master, worker, targetAgentId) {
    const workerStartPromise = new Promise((resolve) => {
        worker.once('shell_start', (payload, ack) => {
            if (typeof ack === 'function') ack({ ok: true });
            resolve(payload);
        });
    });

    const masterAckPromise = new Promise((resolve, reject) => {
        master.timeout(1500).emit('shell_start', { agent_id: targetAgentId, cols: 80, rows: 24 }, (err, res) => {
            if (err) return reject(err);
            if (!res || res.ok !== true) {
                const details = res ? JSON.stringify(res) : 'null';
                return reject(new Error(`shell_start not ok: ${details}`));
            }
            resolve(res);
        });
    });

    const [workerStart, masterAck] = await Promise.all([workerStartPromise, masterAckPromise]);
    assert(workerStart && workerStart.session_id, 'Expected session_id at worker');
    assert(masterAck && masterAck.session_id, 'Expected session_id at master');
    assert(workerStart.session_id === masterAck.session_id, 'Expected matching session_id');
    return masterAck.session_id;
}

async function run() {
    writeTenantsFile();
    try {
        await startServer();

        const alphaMaster = await connect('alpha:alpha-secret', 'alpha-master', 'master');
        const alphaMasterTwo = await connect('alpha:alpha-secret', 'alpha-master-2', 'master');
        const alphaWorker = await connect('alpha:alpha-secret', 'alpha-worker', 'worker');
        const betaMaster = await connect('beta:beta-secret', 'beta-master', 'master');

        const sessionId = await startShellSession(alphaMaster, alphaWorker, 'alpha-worker');

        const alphaListPromise = waitForChat(alphaMaster, (m) => (
            m && typeof m.msg === 'string' && m.msg.startsWith('SHELL SESSIONS')
        ), 2000);
        const alphaPeerNoDmPromise = waitForNoChat(alphaMasterTwo, (m) => (
            m && typeof m.msg === 'string' && m.msg.startsWith('SHELL SESSIONS')
        ), 700);

        alphaMaster.emit('chat', { to: '#ops', msg: '/shells' });

        const listMsg = await alphaListPromise;
        await alphaPeerNoDmPromise;
        assert(listMsg.msg.includes(sessionId), 'Expected /shells list to include session_id');
        assert(listMsg.msg.includes('alpha-worker'), 'Expected /shells list to include agent id');

        const filteredMsgPromise = waitForChat(alphaMaster, (m) => (
            m && typeof m.msg === 'string' && m.msg.includes('SHELL SESSIONS') && m.msg.includes('/shells alpha-worker')
        ), 2000);
        alphaMaster.emit('chat', { to: '#ops', msg: '/shells alpha-worker' });
        const filteredMsg = await filteredMsgPromise;
        assert(filteredMsg.msg.includes(sessionId), 'Expected filtered /shells list to include the active session');

        const betaListPromise = waitForChat(betaMaster, (m) => (
            m && typeof m.msg === 'string' && m.msg.startsWith('SHELL SESSIONS')
        ), 2000);
        betaMaster.emit('chat', { to: '#ops', msg: '/shells' });
        const betaMsg = await betaListPromise;
        assert(!betaMsg.msg.includes(sessionId), 'Expected tenant isolation for /shells listing');
        assert(betaMsg.msg.includes('none'), 'Expected empty tenant list to report none');

        alphaMaster.emit('chat', null);
        alphaMaster.emit('chat', { to: '#ops', msg: { bad: true } });

        const pingAck = await new Promise((resolve, reject) => {
            alphaMaster.timeout(1500).emit('latency_ping', {}, (err, res) => {
                if (err) return reject(err);
                resolve(res);
            });
        });
        assert(pingAck && pingAck.ok === true, 'Expected server to stay healthy on bad /shells payloads');

        alphaMaster.disconnect();
        alphaMasterTwo.disconnect();
        alphaWorker.disconnect();
        betaMaster.disconnect();
        console.log('✓ /shells lists tenant shell sessions via DM chat_update');
    } finally {
        await stopServer();
        cleanupTenantsFile();
    }
}

run().catch((err) => {
    console.error(`✗ shells list test failed: ${err && err.message ? err.message : String(err)}`);
    process.exit(1);
});
