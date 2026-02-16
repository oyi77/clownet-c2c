/**
 * v3.5 Feature Tests - Shared Memory, Credentials, Files, Skills, Orchestration, Config
 */

const io = require('socket.io-client');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const BASE_PORT = 4000;
const AUTH_TOKEN = 'test-v3.5-secret';
const DATA_DIR = path.join(__dirname, '..', 'data-test-v3.5');

let servers = {};
let allPassed = 0;
let allFailed = 0;

async function startServer(name, port) {
    try { await new Promise(r => exec(`lsof -t -i:${port} | xargs kill -9 2>/dev/null`, () => r())); } catch(e) {}
    await new Promise(r => setTimeout(r, 300));

    const dataDir = path.join(DATA_DIR, name);
    if (fs.existsSync(dataDir)) fs.rmSync(dataDir, { recursive: true });
    fs.mkdirSync(dataDir, { recursive: true });

    const proc = spawn('node', ['server.js'], {
        cwd: path.join(__dirname, '..'),
        env: { ...process.env, PORT: port, CLAWNET_SECRET_KEY: AUTH_TOKEN, DATA_DIR: dataDir },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    return new Promise((resolve) => {
        let ready = false;
        proc.stdout.on('data', (d) => { if (d.toString().includes('listening')) ready = true; });
        
        const checkReady = setInterval(() => {
            if (ready) { clearInterval(checkReady); setTimeout(() => resolve(proc), 200); }
        }, 100);
        
        setTimeout(() => { clearInterval(checkReady); resolve(proc); }, 2500);
    });
}

async function stopServer(proc, name) {
    if (proc) try { proc.kill('SIGTERM'); await new Promise(r => setTimeout(r, 500)); } catch(e) {}
    const d = path.join(DATA_DIR, name);
    try { fs.rmSync(d, { recursive: true }, () => {}); } catch(e) {}
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

// Test 1: Shared Memory
async function testSharedMemory() {
    console.log('\n🧪 Shared Memory Tests');
    console.log('='.repeat(50));
    let s; try {
        s = await startServer('shared-memory', BASE_PORT);
        const socket = io(`http://localhost:${BASE_PORT}`, { query: { secret: AUTH_TOKEN }, transports: ['websocket'] });
        
        await new Promise(resolve => {
            socket.on('connect', () => {
                socket.emit('set_shared_memory', { key: 'test', value: 'hello', ttl: 3600 }, (r) => {
                    if (r.success) { console.log('✓ Set'); allPassed++; } else { console.log('✗ Set failed'); allFailed++; }
                    socket.emit('get_shared_memory', { key: 'test' }, (r2) => {
                        if (r2.success && r2.data.value === 'hello') { console.log('✓ Get'); allPassed++; } else { console.log('✗ Get failed'); allFailed++; }
                        socket.emit('list_shared_memory', {}, (r3) => {
                            if (r3.success) { console.log('✓ List'); allPassed++; } else { console.log('✗ List failed'); allFailed++; }
                            socket.emit('delete_shared_memory', { key: 'test' }, (r4) => {
                                if (r4.success) { console.log('✓ Delete'); allPassed++; } else { console.log('✗ Delete failed'); allFailed++; }
                                resolve();
                            });
                        });
                    });
                });
            });
        });
        
        socket.disconnect();
    } catch(e) { console.error('Error:', e); allFailed++; } finally { await stopServer(s, 'shared-memory'); }
}

// Test 2: Credentials
async function testCredentials() {
    console.log('\n🧪 Credentials Tests');
    console.log('='.repeat(50));
    let s; try {
        s = await startServer('credentials', BASE_PORT + 1);
        const socket = io(`http://localhost:${BASE_PORT + 1}`, { query: { secret: AUTH_TOKEN }, transports: ['websocket'] });
        let credId;
        
        await new Promise(resolve => {
            socket.on('connect', () => {
                socket.emit('store_credentials', { name: 'Test Key', value: 'sk-123' }, (r) => {
                    if (r.success) { credId = r.credentialId; console.log('✓ Store'); allPassed++; } else { console.log('✗ Store failed'); allFailed++; }
                    socket.emit('get_credentials', { credentialId: credId }, (r2) => {
                        if (r2.success && r2.data.value === 'sk-123') { console.log('✓ Get'); allPassed++; } else { console.log('✗ Get failed'); allFailed++; }
                        socket.emit('list_credentials', {}, (r3) => {
                            if (r3.success) { console.log('✓ List'); allPassed++; } else { console.log('✗ List failed'); allFailed++; }
                            resolve();
                        });
                    });
                });
            });
        });
        
        socket.disconnect();
    } catch(e) { console.error('Error:', e); allFailed++; } finally { await stopServer(s, 'credentials'); }
}

// Test 3: File Sharing
async function testFileSharing() {
    console.log('\n🧪 File Sharing Tests');
    console.log('='.repeat(50));
    let s; try {
        s = await startServer('file-sharing', BASE_PORT + 2);
        const socket = io(`http://localhost:${BASE_PORT + 2}`, { query: { secret: AUTH_TOKEN }, transports: ['websocket'] });
        const fileData = Buffer.from('Hello World').toString('base64');
        let fileId;
        
        await new Promise(resolve => {
            socket.on('connect', () => {
                socket.emit('upload_file', { name: 'test.txt', data: fileData }, (r) => {
                    if (r.success) { fileId = r.fileId; console.log('✓ Upload'); allPassed++; } else { console.log('✗ Upload failed'); allFailed++; }
                    socket.emit('download_file', { fileId }, (r2) => {
                        if (r2.success) { console.log('✓ Download'); allPassed++; } else { console.log('✗ Download failed'); allFailed++; }
                        socket.emit('list_files', {}, (r3) => {
                            if (r3.success) { console.log('✓ List'); allPassed++; } else { console.log('✗ List failed'); allFailed++; }
                            socket.emit('delete_file', { fileId }, (r4) => {
                                if (r4.success) { console.log('✓ Delete'); allPassed++; } else { console.log('✗ Delete failed'); allFailed++; }
                                resolve();
                            });
                        });
                    });
                });
            });
        });
        
        socket.disconnect();
    } catch(e) { console.error('Error:', e); allFailed++; } finally { await stopServer(s, 'file-sharing'); }
}

// Test 4: Skills
async function testSkills() {
    console.log('\n🧪 Skills Tests');
    console.log('='.repeat(50));
    let s; try {
        s = await startServer('skills', BASE_PORT + 3);
        const socket = io(`http://localhost:${BASE_PORT + 3}`, { query: { secret: AUTH_TOKEN }, transports: ['websocket'] });
        let skillId;
        
        await new Promise(resolve => {
            socket.on('connect', () => {
                socket.emit('register_skill', { name: 'NLP', description: 'Test' }, (r) => {
                    if (r.success) { skillId = r.skillId; console.log('✓ Register'); allPassed++; } else { console.log('✗ Register failed'); allFailed++; }
                    socket.emit('get_skill', { skillId }, (r2) => {
                        if (r2.success) { console.log('✓ Get'); allPassed++; } else { console.log('✗ Get failed'); allFailed++; }
                        socket.emit('update_skill_experience', { skillId }, (r3) => {
                            if (r3.success) { console.log('✓ Update experience'); allPassed++; } else { console.log('✗ Update failed'); allFailed++; }
                            socket.emit('list_skills', {}, (r4) => {
                                if (r4.success) { console.log('✓ List'); allPassed++; } else { console.log('✗ List failed'); allFailed++; }
                                resolve();
                            });
                        });
                    });
                });
            });
        });
        
        socket.disconnect();
    } catch(e) { console.error('Error:', e); allFailed++; } finally { await stopServer(s, 'skills'); }
}

// Test 5: Orchestration
async function testOrchestration() {
    console.log('\n🧪 Orchestration Tests');
    console.log('='.repeat(50));
    let s; try {
        s = await startServer('orchestration', BASE_PORT + 4);
        const orchestrator = io(`http://localhost:${BASE_PORT + 4}`, { query: { secret: AUTH_TOKEN }, transports: ['websocket'] });
        const agent = io(`http://localhost:${BASE_PORT + 4}`, { query: { secret: AUTH_TOKEN }, transports: ['websocket'] });
        let orchId;
        
        await wait(500);
        agent.emit('agent_connect', { agentId: 'test-orch-agent' });
        await wait(500);
        
        await new Promise(resolve => {
            orchestrator.emit('create_orchestration', {
                name: 'Test',
                agents: ['test-orch-agent'],
                tasks: [{ description: 'test', command: '/echo hi', targetAgentId: 'test-orch-agent' }],
                mode: 'sequential'
            }, (r) => {
                if (r.success) { orchId = r.orchestrationId; console.log('✓ Create'); allPassed++; } else { console.log('✗ Create failed'); allFailed++; }
                orchestrator.emit('get_orchestration', { orchestrationId: orchId }, (r2) => {
                    if (r2.success) { console.log('✓ Get'); allPassed++; } else { console.log('✗ Get failed'); allFailed++; }
                    orchestrator.emit('list_orchestrations', {}, (r3) => {
                        if (r3.success) { console.log('✓ List'); allPassed++; } else { console.log('✗ List failed'); allFailed++; }
                        orchestrator.emit('cancel_orchestration', { orchestrationId: orchId }, (r4) => {
                            if (r4.success) { console.log('✓ Cancel'); allPassed++; } else { console.log('✗ Cancel failed'); allFailed++; }
                            resolve();
                        });
                    });
                });
            });
        });
        
        orchestrator.disconnect();
        agent.disconnect();
    } catch(e) { console.error('Error:', e); allFailed++; } finally { await stopServer(s, 'orchestration'); }
}

// Test 6: Config
async function testConfig() {
    console.log('\n🧪 Configuration Tests');
    console.log('='.repeat(50));
    let s; try {
        s = await startServer('config', BASE_PORT + 5);
        const socket = io(`http://localhost:${BASE_PORT + 5}`, { query: { secret: AUTH_TOKEN }, transports: ['websocket'] });
        let configId;
        
        await new Promise(resolve => {
            socket.on('connect', () => {
                socket.emit('save_agent_config', { name: 'test', data: { key: 'value' } }, (r) => {
                    if (r.success) { configId = r.configId; console.log('✓ Save'); allPassed++; } else { console.log('✗ Save failed'); allFailed++; }
                    socket.emit('get_agent_config', { configId }, (r2) => {
                        if (r2.success) { console.log('✓ Get'); allPassed++; } else { console.log('✗ Get failed'); allFailed++; }
                        socket.emit('clone_agent_config', { configId, newName: 'test2' }, (r3) => {
                            if (r3.success) { console.log('✓ Clone'); allPassed++; } else { console.log('✗ Clone failed'); allFailed++; }
                            socket.emit('revert_agent_config', { configId, toVersion: 1 }, (r4) => {
                                if (r4.success) { console.log('✓ Revert'); allPassed++; } else { console.log('✗ Revert failed'); allFailed++; }
                                resolve();
                            });
                        });
                    });
                });
            });
        });
        
        socket.disconnect();
    } catch(e) { console.error('Error:', e); allFailed++; } finally { await stopServer(s, 'config'); }
}

async function runAll() {
    console.log(`🧪 Test Suite - All v3.5 Features\n`);
    await testSharedMemory();
    await testCredentials();
    await testFileSharing();
    await testSkills();
    await testOrchestration();
    await testConfig();
    
    console.log('\n' + '='.repeat(50));
    console.log(`🏁 Final Results: ${allPassed} passed, ${allFailed} failed`);
    console.log('='.repeat(50));
    process.exit(allFailed > 0 ? 1 : 0);
}

runAll();
