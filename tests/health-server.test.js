const http = require('http');
const { createHealthServer } = require('../src/client/health-server');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function request(url) {
    return await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
            let body = '';
            res.on('data', (d) => { body += d.toString(); });
            res.on('end', () => resolve({ status: res.statusCode, body }));
        });
        req.on('error', reject);
    });
}

async function run() {
    const server = createHealthServer({
        port: 0,
        getSnapshot: () => ({ ok: true, version: 'x' }),
    });

    await server.start();
    const { port } = server.address();

    const res = await request(`http://localhost:${port}/health`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const parsed = JSON.parse(res.body);
    assert(parsed.ok === true, 'Expected ok true');
    assert(parsed.version === 'x', 'Expected version x');

    await server.stop();
    console.log('✓ health server responds');
}

run().catch((err) => {
    console.error(`✗ health server test failed: ${err && err.message ? err.message : String(err)}`);
    process.exit(1);
});
