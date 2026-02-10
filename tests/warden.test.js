const io = require('socket.io-client');
const { v4: uuidv4 } = require('uuid');

const URL = "http://localhost:3336";
const SECRET = "very-secret-key-123";

async function runWardenTest() {
    console.log("🛡️ [WARDEN] Starting Warden Traffic Event Test...");
    let passed = 0;
    let total = 3;

    // --- 1. WARDEN CONNECT & RECEIVE CONNECT TRAFFIC ---
    const warden = io(URL, {
        auth: { token: SECRET, agent_id: 'warden-1', role: 'warden' },
        transports: ['websocket']
    });

    const wardenConnectPromise = new Promise((resolve) => {
        warden.on('connect', () => {
            console.log("✅ [WARDEN] Warden connected successfully.");
            passed++;
            resolve();
        });
    });

    await wardenConnectPromise;

    // --- 2. WORKER CONNECTS & WARDEN RECEIVES TRAFFIC EVENT ---
    const trafficConnectPromise = new Promise((resolve) => {
        const handler = (data) => {
            if (data.type === 'connect' && data.agent_id === 'worker-1') {
                console.log("✅ [WARDEN] Received traffic event for worker connect:", data);
                passed++;
                warden.off('traffic', handler);
                resolve();
            }
        };
        warden.on('traffic', handler);

        // Connect a worker to trigger traffic event
        const worker = io(URL, {
            auth: { token: SECRET, agent_id: 'worker-1', role: 'worker' },
            transports: ['websocket']
        });
    });

    await trafficConnectPromise;

    // --- 3. CHAT MESSAGE TRIGGERS TRAFFIC EVENT ---
    const trafficChatPromise = new Promise((resolve) => {
        const handler = (data) => {
            if (data.type === 'chat' && data.from === 'worker-1') {
                console.log("✅ [WARDEN] Received traffic event for chat:", data);
                passed++;
                warden.off('traffic', handler);
                resolve();
            }
        };
        warden.on('traffic', handler);

        // Send a chat message from worker
        const worker = io(URL, {
            auth: { token: SECRET, agent_id: 'worker-1', role: 'worker' },
            transports: ['websocket']
        });

        worker.on('connect', () => {
            worker.emit('chat', { msg: 'Test message from worker' });
        });
    });

    await trafficChatPromise;

    console.log(`\n🏁 [RESULT] ${passed}/${total} tests passed.`);
    warden.disconnect();

    if (passed >= total) {
        process.exit(0);
    } else {
        process.exit(1);
    }
}

runWardenTest().catch(err => {
    console.error("💥 Warden Test Crashed:", err);
    process.exit(1);
});
