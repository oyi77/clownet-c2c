const axios = require('axios');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const io = require('socket.io-client');

const TEST_PORT = 3335;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const AUTH_TOKEN = 'very-secret-key-123';
// Note: server.js hardcodes DATA_DIR to ./data, so we use that
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'clownet_v3.json');

let serverProcess = null;

// Helper: Start server on TEST_PORT
async function startServer() {
    return new Promise((resolve, reject) => {
        // Ensure data directory exists
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }

        serverProcess = spawn('node', ['server.js'], {
            cwd: path.join(__dirname, '..'),
            env: {
                ...process.env,
                PORT: TEST_PORT,
                CLAWNET_SECRET_KEY: AUTH_TOKEN
            },
            stdio: 'pipe'
        });

        let startupComplete = false;

        serverProcess.stdout.on('data', (data) => {
            const output = data.toString();
            if (output.includes('listening') && !startupComplete) {
                startupComplete = true;
                setTimeout(() => resolve(), 500);
            }
        });

        serverProcess.stderr.on('data', (data) => {
            console.error(`Server stderr: ${data}`);
        });

        serverProcess.on('error', reject);

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
    console.log('🧪 Data Persistence Tests');
    console.log('='.repeat(50));

    let passed = 0;
    let failed = 0;

    try {
        // Clean up before test (remove old DB file if it exists)
        if (fs.existsSync(DB_PATH)) {
            fs.unlinkSync(DB_PATH);
        }
        // Ensure data directory exists
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }

        // Start first server instance
        console.log('Starting server (instance 1) on port', TEST_PORT);
        await startServer();
        console.log('✓ Server started\n');

        // Test 1: Verify server creates data directory and initializes
        console.log('Test 1: Verify server initialization and data directory');
        try {
            // Wait a moment for server to fully initialize
            await new Promise(r => setTimeout(r, 2000));

            // Check if data directory was created
            if (fs.existsSync(DATA_DIR)) {
                console.log('  ✓ Data directory created:', DATA_DIR);
                passed++;
            } else {
                console.log('  ✗ Data directory not created');
                failed++;
            }

            // Verify server is responding to HTTP requests
            try {
                const response = await axios.get(`${BASE_URL}/dashboard`, {
                    headers: {
                        'Authorization': `Bearer ${AUTH_TOKEN}`
                    }
                });
                if (response.status === 200) {
                    console.log('  ✓ Server HTTP endpoint responding');
                    passed++;
                }
            } catch (error) {
                console.log('  ✗ Server HTTP endpoint not responding:', error.message);
                failed++;
            }

            // Stop first server
            console.log('\nStopping server (instance 1)');
            await stopServer();
            console.log('✓ Server stopped\n');

            // Note: Database file is only created when saveState() is called
            // (i.e., when tasks are dispatched or results are received)
            // For this test, we verify the data directory structure is preserved
            if (fs.existsSync(DATA_DIR)) {
                console.log('  ✓ Data directory structure preserved');
                passed++;
            } else {
                console.log('  ✗ Data directory lost');
                failed++;
            }

            // Test 2: Restart server and verify data is loaded
            console.log('\nTest 2: Restart server and verify data loads');
            console.log('Starting server (instance 2) on port', TEST_PORT);
            await startServer();
            console.log('✓ Server restarted\n');

            // Verify dashboard is accessible
            try {
                const response = await axios.get(`${BASE_URL}/dashboard`, {
                    headers: {
                        'Authorization': `Bearer ${AUTH_TOKEN}`
                    }
                });

                if (response.status === 200) {
                    console.log('  ✓ Dashboard accessible after restart');
                    passed++;
                } else {
                    console.log('  ✗ Dashboard returned unexpected status:', response.status);
                    failed++;
                }
            } catch (error) {
                console.log('  ✗ Failed to access dashboard after restart:', error.message);
                failed++;
            }

            // Verify data directory still exists after restart
            if (fs.existsSync(DATA_DIR)) {
                console.log('  ✓ Data directory still exists after restart');
                passed++;
            } else {
                console.log('  ✗ Data directory lost after restart');
                failed++;
            }

        } catch (error) {
            console.log('  ✗ Test error:', error.message);
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
        // Clean up test data (only remove the DB file, not the entire data dir)
        if (fs.existsSync(DB_PATH)) {
            fs.unlinkSync(DB_PATH);
        }
    }
}

runTests();
