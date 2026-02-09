const io = require('socket.io-client');
const { v4: uuidv4 } = require('uuid');

const URL = "http://localhost:3337";
const SECRET = "very-secret-key-123";

async function runBroadcastTest() {
    console.log("📡 [BROADCAST] Starting Master Broadcast to 2+ Workers Test...");
    let passed = 0;
    let total = 1;

    // Set a global timeout for the entire test
    const testTimeout = setTimeout(() => {
        console.error("❌ [BROADCAST] Test timeout after 10 seconds");
        process.exit(1);
    }, 10000);

    try {
        // --- 1. MASTER BROADCASTS TO ALL WORKERS ---
        const master = io(URL, {
            auth: { token: SECRET, agent_id: 'master-1', role: 'master' },
            transports: ['websocket', 'polling']
        });

        let workerAReceived = false;
        let workerBReceived = false;

        const workerACommandPromise = new Promise((resolve, reject) => {
            const workerA = io(URL, {
                auth: { token: SECRET, agent_id: 'worker-a', role: 'worker' },
                transports: ['websocket', 'polling']
            });

            const timeout = setTimeout(() => {
                workerA.disconnect();
                reject(new Error("Worker A timeout"));
            }, 8000);

            workerA.on('connect', () => {
                console.log("✅ [WORKER-A] Connected");
            });

            workerA.on('command', (data) => {
                console.log("✅ [WORKER-A] Received command:", data);
                workerAReceived = true;
                clearTimeout(timeout);
                workerA.disconnect();
                resolve();
            });

            workerA.on('connect_error', (err) => {
                console.error("❌ [WORKER-A] Connection error:", err);
                reject(err);
            });
        });

        const workerBCommandPromise = new Promise((resolve, reject) => {
            const workerB = io(URL, {
                auth: { token: SECRET, agent_id: 'worker-b', role: 'worker' },
                transports: ['websocket', 'polling']
            });

            const timeout = setTimeout(() => {
                workerB.disconnect();
                reject(new Error("Worker B timeout"));
            }, 8000);

            workerB.on('connect', () => {
                console.log("✅ [WORKER-B] Connected");
            });

            workerB.on('command', (data) => {
                console.log("✅ [WORKER-B] Received command:", data);
                workerBReceived = true;
                clearTimeout(timeout);
                workerB.disconnect();
                resolve();
            });

            workerB.on('connect_error', (err) => {
                console.error("❌ [WORKER-B] Connection error:", err);
                reject(err);
            });
        });

        // Wait for master to connect
        const masterConnectPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error("Master connection timeout"));
            }, 5000);

            master.on('connect', () => {
                console.log("✅ [MASTER] Master connected successfully.");
                clearTimeout(timeout);
                resolve();
            });

            master.on('connect_error', (err) => {
                console.error("❌ [MASTER] Connection error:", err);
                reject(err);
            });
        });

        await masterConnectPromise;

        // Wait for workers to connect
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Master broadcasts
        master.emit('dispatch', {
            to: 'all',
            cmd: 'test-broadcast-command'
        });
        console.log("📤 [MASTER] Dispatched broadcast command to all workers.");

        // Wait for both workers to receive the command
        try {
            await Promise.all([workerACommandPromise, workerBCommandPromise]);
            console.log("✅ [BROADCAST] Both workers received the command!");
            passed++;
        } catch (err) {
            console.error("❌ [BROADCAST] Error waiting for workers:", err.message);
        }

        console.log(`\n🏁 [RESULT] ${passed}/${total} tests passed.`);
        master.disconnect();
        clearTimeout(testTimeout);
        
        if (passed === total) {
            process.exit(0);
        } else {
            process.exit(1);
        }
    } catch (err) {
        console.error("❌ [BROADCAST] Test error:", err.message);
        clearTimeout(testTimeout);
        process.exit(1);
    }
}

runBroadcastTest().catch(err => {
    console.error("💥 Broadcast Test Crashed:", err);
    process.exit(1);
});
