// Sequential test runner for ClawNet C2C
// Each test file manages its own server lifecycle.
const { spawn } = require('child_process');
const path = require('path');

const tests = [
    'persistence.test.js',
    'dashboard-ui.test.js',
    'broadcast.test.js',
    'rooms.test.js',
    'warden.test.js',
    'delivery.test.js',
    'safety.test.js',
    'audit-metrics.test.js',
    'tenant.test.js',
    // v3.5 feature tests (combined)
    'v3.5-feature-tests.js',
];

// Tests that need an external server running first
const NEEDS_EXTERNAL_SERVER = ['broadcast.test.js', 'warden.test.js'];

let passed = 0;
let failed = 0;

async function runTest(name) {
    const filePath = path.join(__dirname, name);
    const needsServer = NEEDS_EXTERNAL_SERVER.includes(name);

    let serverProc = null;

    if (needsServer) {
        // Start server on the port the test expects
        const portMap = {
            'broadcast.test.js': 3337,
            'warden.test.js': 3336,
        };
        const port = portMap[name];
        serverProc = spawn('node', [path.join(__dirname, '..', 'server.js')], {
            env: {
                ...process.env,
                PORT: port,
                CLAWNET_SECRET_KEY: 'very-secret-key-123',
            },
            stdio: 'pipe',
        });
        // Wait for server to be ready
        await new Promise((resolve) => {
            serverProc.stdout.on('data', (d) => {
                if (d.toString().includes('listening')) resolve();
            });
            setTimeout(resolve, 3000);
        });
    }

    return new Promise((resolve) => {
        console.log(`\n${'─'.repeat(60)}\n▶ Running: ${name}`);
        const proc = spawn('node', [filePath], {
            env: process.env,
            stdio: 'inherit',
        });

        const timer = setTimeout(() => {
            console.log(`⏰ ${name} timed out`);
            proc.kill();
            if (serverProc) serverProc.kill();
            failed++;
            resolve();
        }, 30000);

        proc.on('exit', (code) => {
            clearTimeout(timer);
            if (serverProc) serverProc.kill();
            if (code === 0) {
                passed++;
                console.log(`✅ ${name} PASSED`);
            } else {
                failed++;
                console.log(`❌ ${name} FAILED (exit code: ${code})`);
            }
            resolve();
        });
    });
}

async function main() {
    console.log(`🧪 ClawNet C2C Test Suite — ${tests.length} tests\n`);
    for (const t of tests) {
        await runTest(t);
    }
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`🏁 Results: ${passed} passed, ${failed} failed, ${tests.length} total`);
    process.exit(failed > 0 ? 1 : 0);
}

main();
