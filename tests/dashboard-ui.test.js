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

// Helper: Start server on TEST_PORT
async function startServer() {
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

    try {
        // Start server
        console.log('Starting server on port', TEST_PORT);
        await startServer();
        console.log('✓ Server started\n');

        // Test 1: Dashboard HTML Structure
        console.log('Test 1: Dashboard HTML Structure');
        try {
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

        console.log('\n' + '='.repeat(50));
        console.log(`Results: ${passed} passed, ${failed} failed`);
        console.log('='.repeat(50));

        process.exit(failed > 0 ? 1 : 0);

    } catch (error) {
        console.error('Test suite error:', error);
        process.exit(1);
    } finally {
        await stopServer();
    }
}

runTests();
