const io = require('socket.io-client');
const { spawn } = require('child_process');
const path = require('path');

const PORT = 3338;
const SECRET_KEY = 'very-secret-key-123';
const SERVER_URL = `http://localhost:${PORT}`;

let serverProcess;
let masterSocket, workerASocket, workerBSocket;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function startServer() {
    return new Promise((resolve, reject) => {
        serverProcess = spawn('node', [path.join(__dirname, '..', 'server.js')], {
            env: { ...process.env, PORT, CLAWNET_SECRET_KEY: SECRET_KEY },
            stdio: 'pipe'
        });

        serverProcess.stdout.on('data', (data) => {
            const output = data.toString();
            if (output.includes('listening')) {
                resolve();
            }
        });

        serverProcess.stderr.on('data', (data) => {
            console.error(`Server stderr: ${data}`);
        });

        setTimeout(() => reject(new Error('Server startup timeout')), 5000);
    });
}

function connectAgent(agentId, role) {
    return new Promise((resolve, reject) => {
        const socket = io(SERVER_URL, {
            auth: { token: SECRET_KEY, agent_id: agentId, role, specs: {} },
            reconnection: true,
            reconnectionDelay: 100,
            reconnectionDelayMax: 1000
        });

        socket.on('connect', () => {
            console.log(`✓ ${agentId} connected`);
            resolve(socket);
        });

        socket.on('connect_error', (err) => {
            reject(err);
        });

        setTimeout(() => reject(new Error(`Connection timeout for ${agentId}`)), 3000);
    });
}

async function runTests() {
    try {
        console.log('🚀 Starting server...');
        await startServer();
        await sleep(500);

        console.log('🔌 Connecting agents...');
        masterSocket = await connectAgent('master-1', 'master');
        workerASocket = await connectAgent('worker-a', 'worker');
        workerBSocket = await connectAgent('worker-b', 'worker');
        await sleep(300);

        // TEST 1: Worker A and B join #squad-alpha
        console.log('\n📋 TEST 1: Workers join #squad-alpha');
        let roomUpdateCount = 0;
        const roomUpdatePromise = new Promise((resolve) => {
            workerASocket.on('room_update', (data) => {
                console.log(`  Worker A received room_update:`, data);
                roomUpdateCount++;
                if (roomUpdateCount === 2) resolve();
            });
            workerBSocket.on('room_update', (data) => {
                console.log(`  Worker B received room_update:`, data);
                roomUpdateCount++;
                if (roomUpdateCount === 2) resolve();
            });
        });

        workerASocket.emit('join_room', { room: '#squad-alpha' });
        await sleep(100);
        workerBSocket.emit('join_room', { room: '#squad-alpha' });
        
        await Promise.race([roomUpdatePromise, sleep(2000)]);
        console.log(`  ✓ Room join events received (count: ${roomUpdateCount})`);

        // TEST 2: Master sends chat to #squad-alpha, both workers receive
        console.log('\n📋 TEST 2: Master sends room chat to #squad-alpha');
        let chatCount = 0;
        const chatPromise = new Promise((resolve) => {
            workerASocket.on('chat_update', (msg) => {
                if (msg.to === '#squad-alpha') {
                    console.log(`  Worker A received: "${msg.msg}" from ${msg.from}`);
                    chatCount++;
                    if (chatCount === 2) resolve();
                }
            });
            workerBSocket.on('chat_update', (msg) => {
                if (msg.to === '#squad-alpha') {
                    console.log(`  Worker B received: "${msg.msg}" from ${msg.from}`);
                    chatCount++;
                    if (chatCount === 2) resolve();
                }
            });
        });

        masterSocket.emit('chat', { to: '#squad-alpha', msg: 'Hello squad-alpha!' });
        
        await Promise.race([chatPromise, sleep(2000)]);
        if (chatCount === 2) {
            console.log('  ✓ Both workers received room chat');
        } else {
            console.log(`  ✗ FAIL: Only ${chatCount}/2 workers received chat`);
            process.exit(1);
        }

        // TEST 3: Worker A leaves #squad-alpha
        console.log('\n📋 TEST 3: Worker A leaves #squad-alpha');
        let leaveUpdateCount = 0;
        const leavePromise = new Promise((resolve) => {
            workerBSocket.on('room_update', (data) => {
                if (data.action === 'leave') {
                    console.log(`  Worker B received leave notification:`, data);
                    leaveUpdateCount++;
                    resolve();
                }
            });
        });

        workerASocket.emit('leave_room', { room: '#squad-alpha' });
        
        await Promise.race([leavePromise, sleep(2000)]);
        console.log('  ✓ Leave event received');

        // TEST 4: Master sends another chat, only Worker B receives
        console.log('\n📋 TEST 4: Master sends chat again, only Worker B should receive');
        let finalChatCount = 0;
        const finalChatPromise = new Promise((resolve) => {
            workerASocket.on('chat_update', (msg) => {
                if (msg.to === '#squad-alpha') {
                    console.log(`  ✗ Worker A (left room) received: "${msg.msg}"`);
                    finalChatCount++;
                }
            });
            workerBSocket.on('chat_update', (msg) => {
                if (msg.to === '#squad-alpha') {
                    console.log(`  Worker B received: "${msg.msg}"`);
                    finalChatCount++;
                    resolve();
                }
            });
        });

        masterSocket.emit('chat', { to: '#squad-alpha', msg: 'Second message' });
        
        await Promise.race([finalChatPromise, sleep(2000)]);
        if (finalChatCount === 1) {
            console.log('  ✓ Only Worker B received (Worker A correctly excluded)');
        } else {
            console.log(`  ✗ FAIL: ${finalChatCount} agents received (expected 1)`);
            process.exit(1);
        }

        console.log('\n✅ All tests passed!');
        process.exit(0);

    } catch (err) {
        console.error('❌ Test failed:', err.message);
        process.exit(1);
    } finally {
        if (masterSocket) masterSocket.disconnect();
        if (workerASocket) workerASocket.disconnect();
        if (workerBSocket) workerBSocket.disconnect();
        if (serverProcess) serverProcess.kill();
    }
}

runTests();
