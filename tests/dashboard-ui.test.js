const axios = require('axios');
const cheerio = require('cheerio');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const TEST_PORT = 3334;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const AUTH_TOKEN = 'very-secret-key-123';
const DATA_DIR = path.join(__dirname, '..', 'data-test');

let serverProcess = null;

async function clearPort(port) {
    const { exec } = require('child_process');
    await new Promise((resolve) => {
        exec(`lsof -t -i:${port} | xargs kill -9 2>/dev/null`, () => resolve());
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
}

// Helper: Start server on TEST_PORT
async function startServer() {
    await clearPort(TEST_PORT);
    return new Promise((resolve, reject) => {
        // Clean test data directory
        if (fs.existsSync(DATA_DIR)) {
            fs.rmSync(DATA_DIR, { recursive: true });
        }
        fs.mkdirSync(DATA_DIR, { recursive: true });

        serverProcess = spawn('node', ['server.js'], {
            cwd: path.join(__dirname, '..'),
            env: {
                ...process.env,
                PORT: TEST_PORT,
                CLAWNET_SECRET_KEY: AUTH_TOKEN,
                DATA_DIR: DATA_DIR
            },
            stdio: 'pipe'
        });

        let startupComplete = false;

        serverProcess.stdout.on('data', (data) => {
            const output = data.toString();
            if (output.includes('listening') && !startupComplete) {
                startupComplete = true;
                setTimeout(() => resolve(), 500); // Wait for Socket.io to be ready
            }
        });

        serverProcess.stderr.on('data', (data) => {
            console.error(`Server stderr: ${data}`);
        });

        serverProcess.on('error', reject);

        // Timeout after 10 seconds
        setTimeout(() => {
            if (!startupComplete) {
                reject(new Error('Server startup timeout'));
            }
        }, 10000);
    });
}

// Helper: Stop server
async function stopServer() {
    return new Promise((resolve) => {
        if (serverProcess) {
            serverProcess.kill();
            serverProcess.on('exit', () => {
                // Clean up test data
                if (fs.existsSync(DATA_DIR)) {
                    fs.rmSync(DATA_DIR, { recursive: true });
                }
                resolve();
            });
            setTimeout(resolve, 1000);
        } else {
            resolve();
        }
    });
}

// Test Suite
async function runTests() {
    console.log('🧪 Dashboard UI Tests (Cheerio HTML Parsing)');
    console.log('='.repeat(50));

    let passed = 0;
    let failed = 0;

    let exitCode = 0;

    try {
        // Start server
        console.log('Starting server on port', TEST_PORT);
        await startServer();
        console.log('✓ Server started\n');

        // Test 1: Dashboard HTML Structure
        console.log('Test 1: Dashboard HTML Structure');
        try {
            const sentinelKey = 'SENSITIVE_TEST_KEY_DO_NOT_LEAK';

            await axios.post(
                `${BASE_URL}/api/settings`,
                { supabase_url: 'https://example.supabase.co', supabase_key: sentinelKey },
                { maxRedirects: 0, validateStatus: () => true }
            );

            const unauthResponse = await axios.get(`${BASE_URL}/dashboard`, {
                validateStatus: () => true,
            });

            if (unauthResponse.status === 200 && !unauthResponse.data.includes(sentinelKey)) {
                console.log('  ✓ Unauthenticated dashboard does not leak sensitive settings');
                passed++;
            } else {
                console.log('  ✗ Unauthenticated dashboard leaked sensitive settings or returned bad status');
                failed++;
            }

            const response = await axios.get(`${BASE_URL}/dashboard`, {
                headers: {
                    'Authorization': `Bearer ${AUTH_TOKEN}`
                }
            });

            const $ = cheerio.load(response.data);

            // Check for title
            const title = $('title').text();
            if (title.includes('CLAWNET') || title.includes('ClawNet') || title.includes('Dashboard')) {
                console.log('  ✓ Page title found:', title);
                passed++;
            } else {
                console.log('  ✗ Page title missing or incorrect:', title);
                failed++;
            }

            // Check for tab containers
            const fleetTab = $('#fleet').length > 0;
            const opsTab = $('#ops').length > 0;
            const intelTab = $('#intel').length > 0;

            if (fleetTab) {
                console.log('  ✓ Fleet tab (#fleet) found');
                passed++;
            } else {
                console.log('  ✗ Fleet tab (#fleet) missing');
                failed++;
            }

            if (opsTab) {
                console.log('  ✓ Ops tab (#ops) found');
                passed++;
            } else {
                console.log('  ✗ Ops tab (#ops) missing');
                failed++;
            }

            if (intelTab) {
                console.log('  ✓ Intel tab (#intel) found');
                passed++;
            } else {
                console.log('  ✗ Intel tab (#intel) missing');
                failed++;
            }

            // Check for terminal glow styling (defined in CSS, may not appear if no agents)
            const terminalGlowCSS = response.data.includes('terminal-glow');
            if (terminalGlowCSS) {
                console.log('  ✓ Terminal glow styling (.terminal-glow) defined in CSS');
                passed++;
            } else {
                console.log('  ✗ Terminal glow styling (.terminal-glow) not defined');
                failed++;
            }

            const authPayloadUsesSecret = response.data.includes('JSON.stringify({ secret: code })');
            if (authPayloadUsesSecret) {
                console.log('  ✓ Auth token request uses JSON.stringify({ secret: code })');
                passed++;
            } else {
                console.log('  ✗ Auth token request does not use JSON.stringify({ secret: code })');
                failed++;
            }

            const hasHardReconnectionCap = /reconnectionAttempts\s*:\s*\d+/.test(response.data);
            if (!hasHardReconnectionCap) {
                console.log('  ✓ Socket.IO client has no hard reconnectionAttempts cap');
                passed++;
            } else {
                console.log('  ✗ Socket.IO client contains hard reconnectionAttempts cap');
                failed++;
            }

            const hasUnsafeMemberInnerHtml = /function\s+updateMemberList\s*\([\s\S]*?list\.innerHTML\s*=\s*members\.map\(m\s*=>\s*`[\s\S]*?\$\{m\.id\}[\s\S]*?\$\{m\.role\}[\s\S]*?`\)\.join\(''\)/.test(response.data);
            if (!hasUnsafeMemberInnerHtml) {
                console.log('  ✓ Member list rendering avoids unsafe innerHTML interpolation');
                passed++;
            } else {
                console.log('  ✗ Member list rendering uses unsafe innerHTML interpolation');
                failed++;
            }

            const hasUnsafeTrafficInnerHtml = /function\s+handleTraffic\s*\([\s\S]*?innerHTML\s*=\s*`[\s\S]*?\$\{entry\.agent_id\}[\s\S]*?\$\{entry\.cmd\}[\s\S]*?\$\{entry\.status\}[\s\S]*?`/.test(response.data);
            if (!hasUnsafeTrafficInnerHtml) {
                console.log('  ✓ Traffic feed rendering avoids unsafe innerHTML interpolation');
                passed++;
            } else {
                console.log('  ✗ Traffic feed rendering uses unsafe innerHTML interpolation');
                failed++;
            }

            const hasUnsafeTaskLogsInnerHtml = /taskLogsEl\.innerHTML\s*=\s*\(data\.tasks\s*\|\|\s*\[\]\)\.map\(t\s*=>\s*`[\s\S]*?\$\{t\.id\.substring\(0,\s*8\)\}[\s\S]*?\$\{t\.cmd\}[\s\S]*?\$\{typeof t\.result === 'object' \? JSON\.stringify\(t\.result\) : t\.result \|\| 'Pending'\}[\s\S]*?`\)\.join\(''\)/.test(response.data);
            if (!hasUnsafeTaskLogsInnerHtml) {
                console.log('  ✓ Task logs rendering avoids unsafe innerHTML interpolation');
                passed++;
            } else {
                console.log('  ✗ Task logs rendering uses unsafe innerHTML interpolation');
                failed++;
            }

            const hasUnsafeAgentLogsInnerHtml = /logsBox\.innerHTML\s*=\s*agentTasks\.map\(t\s*=>/.test(response.data)
                && /\$\{t\.cmd\}/.test(response.data)
                && /\$\{output\s*\?/.test(response.data);
            if (!hasUnsafeAgentLogsInnerHtml) {
                console.log('  ✓ Agent logs modal rendering avoids unsafe innerHTML interpolation');
                passed++;
            } else {
                console.log('  ✗ Agent logs modal rendering uses unsafe innerHTML interpolation');
                failed++;
            }

            const hasUnsafeOpsTableInnerHtml = /body\.innerHTML\s*=\s*tasks\.slice\(\)\.reverse\(\)\.map\(/.test(response.data)
                && /\$\{t\.agent_id\}/.test(response.data)
                && /\$\{t\.cmd\}/.test(response.data);
            if (!hasUnsafeOpsTableInnerHtml) {
                console.log('  ✓ Ops task table avoids unsafe innerHTML interpolation for task fields');
                passed++;
            } else {
                console.log('  ✗ Ops task table uses unsafe innerHTML interpolation for task fields');
                failed++;
            }

            const hasUnsafeTemplatesGridInnerHtml = /grid\.innerHTML\s*=\s*data\.templates\.map\(/.test(response.data)
                && /\$\{t\.name\}/.test(response.data)
                && /\$\{t\.command\}/.test(response.data);
            if (!hasUnsafeTemplatesGridInnerHtml) {
                console.log('  ✓ Templates grid avoids unsafe innerHTML interpolation for template fields');
                passed++;
            } else {
                console.log('  ✗ Templates grid uses unsafe innerHTML interpolation for template fields');
                failed++;
            }

            // Check for agent grid container
            const agentGrid = $('.agent-grid, [class*="grid"], [class*="agent"]').length > 0;
            if (agentGrid) {
                console.log('  ✓ Agent grid container found');
                passed++;
            } else {
                console.log('  ✗ Agent grid container missing');
                failed++;
            }

        } catch (error) {
            console.log('  ✗ Failed to fetch dashboard:', error.message);
            failed++;
        }

    } catch (error) {
        console.error('Test suite error:', error);
        exitCode = 1;
    } finally {
        await stopServer();
        console.log('\n' + '='.repeat(50));
        console.log(`Results: ${passed} passed, ${failed} failed`);
        console.log('='.repeat(50));
        process.exit(exitCode || (failed > 0 ? 1 : 0));
    }
}

runTests();
