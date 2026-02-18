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
        env: {
            ...process.env,
            PORT: port,
            CLAWNET_SECRET_KEY: AUTH_TOKEN,
            SHARED_MEMORY_ENCRYPTION_KEY: '12345678901234567890123456789012',
            DATA_DIR: dataDir
        },
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

function emitWithAck(socket, event, payload, timeoutMs = 2500) {
    return new Promise((resolve) => {
        let settled = false;
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            resolve({ success: false, error: `${event} timeout` });
        }, timeoutMs);

        socket.emit(event, payload, (response) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(response || {});
        });
    });
}

// Test 1: Shared Memory
async function testSharedMemory() {
    console.log('\n🧪 Shared Memory Tests');
    console.log('='.repeat(50));
    let s; try {
        s = await startServer('shared-memory', BASE_PORT);
        const socket = io(`http://localhost:${BASE_PORT}`, {
            auth: { token: AUTH_TOKEN, agent_id: 'test-shared-memory', role: 'tester' },
            transports: ['websocket']
        });
        
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
        const socket = io(`http://localhost:${BASE_PORT + 1}`, {
            auth: { token: AUTH_TOKEN, agent_id: 'test-credentials', role: 'tester' },
            transports: ['websocket']
        });
        await new Promise(resolve => {
            const connectTimer = setTimeout(() => {
                console.log('✗ Connect failed');
                allFailed++;
                resolve();
            }, 4000);

            socket.on('connect', async () => {
                clearTimeout(connectTimer);

                socket.emit('store_credentials', {
                    service: 'test-key',
                    credentials: { value: 'sk-123' }
                });
                await wait(100);

                const r2 = await emitWithAck(socket, 'get_credentials', { service: 'test-key' });
                if (!r2.error && r2.credentials && r2.credentials.value === 'sk-123') {
                    console.log('✓ Store');
                    console.log('✓ Get');
                    allPassed += 2;
                } else {
                    console.log('✗ Store/Get failed');
                    allFailed += 2;
                }

                const r3 = await emitWithAck(socket, 'list_credentials', {});
                if (!r3.error && Array.isArray(r3.credentials)) {
                    console.log('✓ List');
                    allPassed++;
                } else {
                    console.log('✗ List failed');
                    allFailed++;
                }

                resolve();
            });

            socket.on('connect_error', () => {
                clearTimeout(connectTimer);
                console.log('✗ Connect failed');
                allFailed++;
                resolve();
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
        const socket = io(`http://localhost:${BASE_PORT + 2}`, {
            auth: { token: AUTH_TOKEN, agent_id: 'test-file-sharing', role: 'tester' },
            transports: ['websocket']
        });
        const fileData = Buffer.from('Hello World').toString('base64');
        
        await new Promise(resolve => {
            let settled = false;
            const finish = () => {
                if (settled) return;
                settled = true;
                clearTimeout(connectTimer);
                resolve();
            };

            const connectTimer = setTimeout(() => {
                console.log('✗ Connect failed');
                allFailed++;
                finish();
            }, 4000);

            socket.on('connect', async () => {
                const upload = await emitWithAck(socket, 'upload_file', { filename: 'test.txt', data: fileData });
                if (upload.success && upload.fileId) {
                    console.log('✓ Upload');
                    allPassed++;
                } else {
                    console.log('✗ Upload failed');
                    allFailed++;
                    finish();
                    return;
                }

                const uploadedFileId = upload.fileId;

                const r2 = await emitWithAck(socket, 'download_file', { fileId: uploadedFileId });
                if (r2.success && r2.data === fileData) {
                    console.log('✓ Download');
                    allPassed++;
                } else {
                    console.log('✗ Download failed');
                    allFailed++;
                }

                const r3 = await emitWithAck(socket, 'list_files', {});
                if (r3.success && Array.isArray(r3.files) && r3.files.some((f) => f.fileId === uploadedFileId)) {
                    console.log('✓ List');
                    allPassed++;
                } else {
                    console.log('✗ List failed');
                    allFailed++;
                }

                const deleteResp = await emitWithAck(socket, 'delete_file', { fileId: uploadedFileId });
                if (deleteResp.success) {
                    console.log('✓ Delete ACK');
                    allPassed++;
                } else {
                    console.log('✗ Delete ACK failed');
                    allFailed++;
                }

                const afterDelete = await emitWithAck(socket, 'list_files', {});
                const stillThere = Array.isArray(afterDelete.files)
                    ? afterDelete.files.some((f) => f.fileId === uploadedFileId)
                    : true;
                if (!stillThere) {
                    console.log('✓ Delete');
                    allPassed++;
                } else {
                    console.log('✗ Delete failed');
                    allFailed++;
                }

                finish();
            });

            socket.on('connect_error', () => {
                console.log('✗ Connect failed');
                allFailed++;
                finish();
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
        const socket = io(`http://localhost:${BASE_PORT + 3}`, {
            auth: { token: AUTH_TOKEN, agent_id: 'test-skills', role: 'tester' },
            transports: ['websocket']
        });
        
        await new Promise(resolve => {
            let settled = false;
            const finish = () => {
                if (settled) return;
                settled = true;
                clearTimeout(connectTimer);
                resolve();
            };

            const connectTimer = setTimeout(() => {
                console.log('✗ Connect failed');
                allFailed++;
                finish();
            }, 4000);

            socket.on('connect', async () => {
                socket.emit('register_skill', { name: 'NLP', data: { description: 'Test' }, experience: 1 });
                await wait(100);

                const list1 = await emitWithAck(socket, 'list_skills', {});
                const skill = Array.isArray(list1.skills)
                    ? list1.skills.find((x) => x.name === 'NLP')
                    : null;
                if (skill && skill.skillId) {
                    console.log('✓ Register');
                    allPassed++;
                } else {
                    console.log('✗ Register failed');
                    allFailed++;
                    finish();
                    return;
                }

                const r2 = await emitWithAck(socket, 'get_skill', { skillId: skill.skillId });
                if (!r2.error && r2.name === 'NLP') {
                    console.log('✓ Get');
                    allPassed++;
                } else {
                    console.log('✗ Get failed');
                    allFailed++;
                }

                socket.emit('update_skill_experience', { skillId: skill.skillId, experience: 2 });
                await wait(100);
                const r3 = await emitWithAck(socket, 'get_skill', { skillId: skill.skillId });
                if (!r3.error && r3.experience >= 3) {
                    console.log('✓ Update experience');
                    allPassed++;
                } else {
                    console.log('✗ Update failed');
                    allFailed++;
                }

                const r4 = await emitWithAck(socket, 'list_skills', {});
                if (!r4.error && Array.isArray(r4.skills)) {
                    console.log('✓ List');
                    allPassed++;
                } else {
                    console.log('✗ List failed');
                    allFailed++;
                }

                finish();
            });

            socket.on('connect_error', () => {
                console.log('✗ Connect failed');
                allFailed++;
                finish();
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
        const orchestrator = io(`http://localhost:${BASE_PORT + 4}`, {
            auth: { token: AUTH_TOKEN, agent_id: 'test-orchestrator', role: 'tester' },
            transports: ['websocket']
        });
        const agent = io(`http://localhost:${BASE_PORT + 4}`, {
            auth: { token: AUTH_TOKEN, agent_id: 'test-orch-agent', role: 'worker' },
            transports: ['websocket']
        });
        await new Promise(resolve => {
            let settled = false;
            const finish = () => {
                if (settled) return;
                settled = true;
                clearTimeout(connectTimer);
                resolve();
            };

            const connectTimer = setTimeout(() => {
                console.log('✗ Connect failed');
                allFailed++;
                finish();
            }, 5000);

            orchestrator.on('connect', async () => {
                if (!agent.connected) {
                    await wait(300);
                }

                orchestrator.emit('create_orchestration', {
                    name: 'Test',
                    agents: ['test-orch-agent'],
                    tasks: [{ description: 'test', command: '/echo hi', target: 'test-orch-agent' }],
                    mode: 'sequential'
                });
                await wait(100);

                const list1 = await emitWithAck(orchestrator, 'list_orchestrations', {});
                const orch = Array.isArray(list1.orchestrations)
                    ? list1.orchestrations.find((o) => o.name === 'Test')
                    : null;
                if (orch && orch.orchId) {
                    console.log('✓ Create');
                    allPassed++;
                } else {
                    console.log('✗ Create failed');
                    allFailed++;
                    finish();
                    return;
                }

                const r2 = await emitWithAck(orchestrator, 'get_orchestration', { orchId: orch.orchId });
                if (!r2.error && r2.name === 'Test') {
                    console.log('✓ Get');
                    allPassed++;
                } else {
                    console.log('✗ Get failed');
                    allFailed++;
                }

                const r3 = await emitWithAck(orchestrator, 'list_orchestrations', {});
                if (!r3.error && Array.isArray(r3.orchestrations)) {
                    console.log('✓ List');
                    allPassed++;
                } else {
                    console.log('✗ List failed');
                    allFailed++;
                }

                orchestrator.emit('create_orchestration', {
                    name: 'TaskIndexZero',
                    agents: ['test-orch-agent'],
                    tasks: [{ description: 'result with index 0', command: '/echo zero', target: 'test-orch-agent' }],
                    mode: 'sequential'
                });
                await wait(100);

                const list2 = await emitWithAck(orchestrator, 'list_orchestrations', {});
                const zeroOrch = Array.isArray(list2.orchestrations)
                    ? list2.orchestrations.find((o) => o.name === 'TaskIndexZero')
                    : null;
                if (!zeroOrch || !zeroOrch.orchId) {
                    console.log('✗ Task index 0 orchestration create failed');
                    allFailed++;
                    finish();
                    return;
                }

                const completionPromise = new Promise((resolve) => {
                    const completionTimer = setTimeout(() => resolve(null), 2500);
                    agent.on('orchestration_task', function onTask(taskPayload) {
                        if (taskPayload.orchId !== zeroOrch.orchId) return;
                        agent.off('orchestration_task', onTask);
                        agent.emit('report_task_result', {
                            orchId: taskPayload.orchId,
                            taskIndex: taskPayload.taskIndex,
                            result: { ok: true }
                        });
                    });

                    agent.on('orchestration_completed', function onCompleted(donePayload) {
                        if (donePayload.orchId !== zeroOrch.orchId) return;
                        clearTimeout(completionTimer);
                        agent.off('orchestration_completed', onCompleted);
                        resolve(donePayload);
                    });
                });

                orchestrator.emit('start_orchestration', { orchId: zeroOrch.orchId });
                const completion = await completionPromise;

                const zeroState = await emitWithAck(orchestrator, 'get_orchestration', { orchId: zeroOrch.orchId });
                const taskZeroResults = zeroState.results && zeroState.results[0];
                if (completion && zeroState.status === 'completed' && Array.isArray(taskZeroResults) && taskZeroResults.length > 0) {
                    console.log('✓ report_task_result accepts taskIndex 0');
                    allPassed++;
                } else {
                    console.log('✗ report_task_result ignored taskIndex 0');
                    allFailed++;
                }

                orchestrator.emit('cancel_orchestration', { orchId: orch.orchId });
                await wait(100);
                const r4 = await emitWithAck(orchestrator, 'get_orchestration', { orchId: orch.orchId });
                if (!r4.error && r4.status === 'cancelled') {
                    console.log('✓ Cancel');
                    allPassed++;
                } else {
                    console.log('✗ Cancel failed');
                    allFailed++;
                }

                finish();
            });

            orchestrator.on('connect_error', () => {
                console.log('✗ Connect failed');
                allFailed++;
                finish();
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
        const socket = io(`http://localhost:${BASE_PORT + 5}`, {
            auth: { token: AUTH_TOKEN, agent_id: 'test-config', role: 'tester' },
            transports: ['websocket']
        });
        
        await new Promise(resolve => {
            let settled = false;
            const finish = () => {
                if (settled) return;
                settled = true;
                clearTimeout(connectTimer);
                resolve();
            };

            const connectTimer = setTimeout(() => {
                console.log('✗ Connect failed');
                allFailed++;
                finish();
            }, 4000);

            socket.on('connect', async () => {
                socket.emit('save_agent_config', { name: 'test', data: { key: 'value' } });
                await wait(100);

                const list1 = await emitWithAck(socket, 'list_agent_configs', {});
                const cfg = Array.isArray(list1.configs)
                    ? list1.configs.find((c) => c.name === 'test')
                    : null;
                if (cfg && cfg.configId) {
                    console.log('✓ Save');
                    allPassed++;
                } else {
                    console.log('✗ Save failed');
                    allFailed++;
                    finish();
                    return;
                }

                const r2 = await emitWithAck(socket, 'get_agent_config', { configId: cfg.configId });
                if (!r2.error && r2.name === 'test') {
                    console.log('✓ Get');
                    allPassed++;
                } else {
                    console.log('✗ Get failed');
                    allFailed++;
                }

                const r3 = await emitWithAck(socket, 'clone_agent_config', { configId: cfg.configId, newName: 'test2' });
                if (!r3.error && r3.configId) {
                    console.log('✓ Clone');
                    allPassed++;
                } else {
                    console.log('✗ Clone failed');
                    allFailed++;
                }

                const r4 = await emitWithAck(socket, 'revert_agent_config', { configId: cfg.configId, version: 1 });
                if (!r4.error && r4.version) {
                    console.log('✓ Revert');
                    allPassed++;
                } else {
                    console.log('✗ Revert failed');
                    allFailed++;
                }

                finish();
            });

            socket.on('connect_error', () => {
                console.log('✗ Connect failed');
                allFailed++;
                finish();
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
