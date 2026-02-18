const axios = require('axios');
const io = require('socket.io-client');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const TEST_PORT = 3343;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const AUTH_SECRET = 'very-secret-key-123';
const DATA_DIR = path.join(__dirname, '..', 'data-test-auth');

let serverProcess = null;

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

async function clearPort(port) {
    await new Promise((resolve) => {
        exec(`lsof -t -i:${port} | xargs kill -9 2>/dev/null`, () => resolve());
    });
    await new Promise((resolve) => setTimeout(resolve, 250));
}

async function startServer() {
    await clearPort(TEST_PORT);

    if (fs.existsSync(DATA_DIR)) {
        fs.rmSync(DATA_DIR, { recursive: true });
    }
    fs.mkdirSync(DATA_DIR, { recursive: true });

    return new Promise((resolve, reject) => {
        serverProcess = spawn('node', ['server.js'], {
            cwd: path.join(__dirname, '..'),
            env: {
                ...process.env,
                PORT: TEST_PORT,
                CLAWNET_SECRET_KEY: AUTH_SECRET,
                DATA_DIR,
            },
            stdio: 'pipe',
        });

        let startupComplete = false;

        serverProcess.stdout.on('data', (data) => {
            if (data.toString().includes('listening') && !startupComplete) {
                startupComplete = true;
                setTimeout(resolve, 300);
            }
        });

        serverProcess.stderr.on('data', () => {});

        serverProcess.on('error', reject);

        setTimeout(() => {
            if (!startupComplete) {
                reject(new Error('Server startup timeout'));
            }
        }, 10000);
    });
}

async function stopServer() {
    await new Promise((resolve) => {
        if (!serverProcess) {
            resolve();
            return;
        }

        serverProcess.kill('SIGTERM');
        serverProcess.on('exit', resolve);
        setTimeout(resolve, 1000);
    });

    if (fs.existsSync(DATA_DIR)) {
        fs.rmSync(DATA_DIR, { recursive: true });
    }

    await clearPort(TEST_PORT);
}

async function getToken(secret) {
    const response = await axios.post(
        `${BASE_URL}/api/auth/token`,
        { secret },
        { validateStatus: () => true }
    );
    return response;
}

async function runTests() {
    let passed = 0;
    let failed = 0;

    console.log('Auth API Tests');
    console.log('='.repeat(40));

    try {
        await startServer();

        console.log('Test 1: Rejects invalid secret with generic error');
        try {
            const invalid = await getToken('wrong-secret');
            assert(invalid.status === 401, `Expected 401, got ${invalid.status}`);
            assert(invalid.data && typeof invalid.data.error === 'string', 'Missing generic error payload');
            passed++;
            console.log('  ✓ Passed');
        } catch (err) {
            failed++;
            console.log(`  ✗ Failed: ${err.message}`);
        }

        console.log('Test 2: Issues token for valid secret');
        let token;
        try {
            const valid = await getToken(AUTH_SECRET);
            assert(valid.status === 200, `Expected 200, got ${valid.status}`);
            assert(typeof valid.data.token === 'string' && valid.data.token.length > 20, 'Missing token');
            assert(typeof valid.data.expiresAt === 'string', 'Missing expiresAt');
            assert(valid.data.tokenType === 'Bearer', `Unexpected tokenType: ${valid.data.tokenType}`);
            token = valid.data.token;
            passed++;
            console.log('  ✓ Passed');
        } catch (err) {
            failed++;
            console.log(`  ✗ Failed: ${err.message}`);
        }

        console.log('Test 3: Validates token via POST /api/auth/verify');
        try {
            const verifyOk = await axios.post(
                `${BASE_URL}/api/auth/verify`,
                {},
                {
                    headers: { Authorization: `Bearer ${token}` },
                    validateStatus: () => true,
                }
            );
            assert(verifyOk.status === 200, `Expected 200, got ${verifyOk.status}`);
            assert(verifyOk.data && verifyOk.data.valid === true, 'Expected valid: true');
            passed++;
            console.log('  ✓ Passed');
        } catch (err) {
            failed++;
            console.log(`  ✗ Failed: ${err.message}`);
        }

        console.log('Test 4: Accepts dashboard JWT for Socket.IO handshake');
        try {
            const socket = io(BASE_URL, {
                auth: {
                    token,
                    agent_id: 'master-ui',
                    role: 'master',
                },
                transports: ['websocket'],
                timeout: 2000,
            });

            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    socket.disconnect();
                    reject(new Error('Socket connection timeout'));
                }, 3000);

                socket.once('connect', () => {
                    clearTimeout(timer);
                    socket.disconnect();
                    resolve();
                });

                socket.once('connect_error', (err) => {
                    clearTimeout(timer);
                    socket.disconnect();
                    reject(err || new Error('Socket connect_error'));
                });
            });

            passed++;
            console.log('  ✓ Passed');
        } catch (err) {
            failed++;
            console.log(`  ✗ Failed: ${err.message}`);
        }

        console.log('Test 5: Revokes token and verify returns invalid');
        try {
            const revoke = await axios.post(
                `${BASE_URL}/api/auth/revoke`,
                {},
                {
                    headers: { Authorization: `Bearer ${token}` },
                    validateStatus: () => true,
                }
            );
            assert(revoke.status === 200, `Expected 200, got ${revoke.status}`);

            const verifyAfterRevoke = await axios.post(
                `${BASE_URL}/api/auth/verify`,
                {},
                {
                    headers: { Authorization: `Bearer ${token}` },
                    validateStatus: () => true,
                }
            );
            assert(verifyAfterRevoke.status === 401, `Expected 401, got ${verifyAfterRevoke.status}`);
            assert(verifyAfterRevoke.data && verifyAfterRevoke.data.valid === false, 'Expected valid: false');
            passed++;
            console.log('  ✓ Passed');
        } catch (err) {
            failed++;
            console.log(`  ✗ Failed: ${err.message}`);
        }

        console.log('Test 6: Keeps /api/auth/logout alias behavior');
        try {
            const nextTokenResponse = await getToken(AUTH_SECRET);
            const secondToken = nextTokenResponse.data.token;

            const logout = await axios.post(
                `${BASE_URL}/api/auth/logout`,
                {},
                {
                    headers: { Authorization: `Bearer ${secondToken}` },
                    validateStatus: () => true,
                }
            );
            assert(logout.status === 200, `Expected 200, got ${logout.status}`);

            const verifyAfterLogout = await axios.post(
                `${BASE_URL}/api/auth/verify`,
                {},
                {
                    headers: { Authorization: `Bearer ${secondToken}` },
                    validateStatus: () => true,
                }
            );
            assert(verifyAfterLogout.status === 401, `Expected 401, got ${verifyAfterLogout.status}`);
            assert(verifyAfterLogout.data && verifyAfterLogout.data.valid === false, 'Expected valid: false');
            passed++;
            console.log('  ✓ Passed');
        } catch (err) {
            failed++;
            console.log(`  ✗ Failed: ${err.message}`);
        }

        console.log('Test 7: Rate limits /api/auth/token per IP');
        try {
            let lastResponse = null;
            for (let i = 0; i < 11; i++) {
                lastResponse = await getToken('still-wrong');
            }
            assert(lastResponse && lastResponse.status === 429, `Expected 429, got ${lastResponse ? lastResponse.status : 'none'}`);
            assert(lastResponse.data && typeof lastResponse.data.error === 'string', 'Missing generic rate-limit error');
            passed++;
            console.log('  ✓ Passed');
        } catch (err) {
            failed++;
            console.log(`  ✗ Failed: ${err.message}`);
        }

    } finally {
        await stopServer();
    }

    console.log('='.repeat(40));
    console.log(`Results: ${passed} passed, ${failed} failed`);

    process.exit(failed > 0 ? 1 : 0);
}

runTests();
