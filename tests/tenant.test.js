const io = require('socket.io-client');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 3342;
const BASE_URL = `http://localhost:${PORT}`;

const TENANTS_PATH = path.join(__dirname, 'tenants.test.json');

let serverProcess = null;

function writeTenantsFile() {
    fs.writeFileSync(TENANTS_PATH, JSON.stringify({
        alpha: 'alpha-secret',
        beta: 'beta-secret'
    }));
}

function cleanupTenantsFile() {
    if (fs.existsSync(TENANTS_PATH)) fs.unlinkSync(TENANTS_PATH);
}

function startServer() {
    return new Promise((resolve, reject) => {
        serverProcess = spawn('node', ['server.js'], {
            cwd: __dirname + '/..',
            env: {
                ...process.env,
                PORT: PORT,
                CLAWNET_TENANTS_PATH: TENANTS_PATH
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
    console.log('🏢 Running Multi-Tenant Isolation Test...');
    writeTenantsFile();
    await startServer();

    const alpha = io(BASE_URL, {
        auth: { token: 'alpha:alpha-secret', agent_id: 'alpha-1', role: 'worker' },
        transports: ['websocket']
    });
    const beta = io(BASE_URL, {
        auth: { token: 'beta:beta-secret', agent_id: 'beta-1', role: 'worker' },
        transports: ['websocket']
    });

    let alphaFleet = [];
    let betaFleet = [];

    alpha.on('fleet_update', (fleet) => { alphaFleet = fleet; });
    beta.on('fleet_update', (fleet) => { betaFleet = fleet; });

    await new Promise((resolve) => {
        let connected = 0;
        const done = () => {
            connected += 1;
            if (connected === 2) resolve();
        };
        alpha.on('connect', done);
        beta.on('connect', done);
    });

    await new Promise((resolve) => setTimeout(resolve, 800));

    if (alphaFleet.length !== 1 || alphaFleet[0].id !== 'alpha-1') {
        throw new Error('Alpha tenant saw unexpected agents');
    }
    if (betaFleet.length !== 1 || betaFleet[0].id !== 'beta-1') {
        throw new Error('Beta tenant saw unexpected agents');
    }

    console.log('✅ Tenant isolation verified');
    alpha.disconnect();
    beta.disconnect();
    await stopServer();
    cleanupTenantsFile();
    console.log('🏁 Tenant test passed.');
}

run().catch(async (err) => {
    console.error('❌ Tenant test failed:', err);
    await stopServer();
    cleanupTenantsFile();
    process.exit(1);
});
