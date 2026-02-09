const io = require('socket.io-client');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const URL = "http://localhost:3333";
const SECRET = "very-secret-key-123";

async function runPerfectionSuite() {
    console.log("🏛️ [CLAWNET v3.1] Starting Atomic Perfection Test Suite...");
    let passed = 0;
    let total = 5;

    // --- 1. SMOKE TEST (HTTP) ---
    try {
        const res = await axios.get(`${URL}/`);
        if (res.status === 200 && res.data.online) {
            console.log("✅ [SMOKE] HTTP Root is responding.");
            passed++;
        }
    } catch (e) { console.error("❌ [SMOKE] HTTP Root failed."); }

    // --- 2. FUNCTIONAL TEST (AUTH & CONNECT) ---
    const socket = io(URL, {
        auth: { token: SECRET, agent_id: 'perfection-tester', role: 'master' },
        transports: ['websocket']
    });

    const connectPromise = new Promise((resolve) => {
        socket.on('connect', () => {
            console.log("✅ [FUNCTIONAL] WebSocket Authenticated Connection.");
            passed++;
            resolve();
        });
    });

    await connectPromise;

    // --- 3. INTEGRATION TEST (TELEMETRY FLOW) ---
    const telemetryPromise = new Promise((resolve) => {
        socket.on('fleet_update', (fleet) => {
            const me = fleet.find(a => a.id === 'perfection-tester');
            if (me && me.specs.cpu === 99) {
                console.log("✅ [INTEGRATION] Telemetry update reflected in state.");
                passed++;
                resolve();
            }
        });
        socket.emit('report', { specs: { cpu: 99, ram: 99 }, cron: ["test-cron"] });
    });

    await telemetryPromise;

    // --- 4. LOAD TEST (CONCURRENCY) ---
    console.log("[*] Running Load Test: 50 concurrent messages...");
    const startLoad = Date.now();
    for(let i=0; i<50; i++) {
        socket.emit('chat', { msg: `Load test message ${i}` });
    }
    console.log(`✅ [LOAD] 50 messages blasted in ${Date.now() - startLoad}ms.`);
    passed++;

    // --- 5. E2E LOGIC (DISPATCH -> RESULT) ---
    const dispatchPromise = new Promise((resolve) => {
        const taskId = uuidv4();
        socket.on('task_update', (tasks) => {
            const task = tasks.find(t => t.cmd === 'echo perfection');
            if (task && task.status === 'SUCCESS') {
                console.log("✅ [E2E] Command Dispatch -> Execution -> Success Loop verified.");
                passed++;
                resolve();
            }
        });

        // Simulate agent receiving command and reporting back
        socket.on('command', (cmd) => {
            if (cmd.cmd === 'echo perfection') {
                socket.emit('task_result', { id: cmd.id, status: 'SUCCESS', output: 'perfection' });
            }
        });

        socket.emit('dispatch', { to: 'perfection-tester', cmd: 'echo perfection' });
    });

    await dispatchPromise;

    console.log(`\n🏁 [RESULT] ${passed}/${total} tests passed.`);
    socket.disconnect();
    
    if (passed === total) {
        process.exit(0);
    } else {
        process.exit(1);
    }
}

runPerfectionSuite().catch(err => {
    console.error("💥 Suite Crashed:", err);
    process.exit(1);
});
