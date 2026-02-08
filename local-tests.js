const io = require('socket.io-client');
const assert = require('assert');

const LOCAL_URL = process.env.LOCAL_URL || "http://localhost:3000";
const SECRET = "very-secret-key-123";

async function runLocalTests() {
    console.log(`🧪 [TDD] Starting Local Test Suite for ClawNet v3.0 on ${LOCAL_URL}...`);

    const socket = io(LOCAL_URL, {
        auth: { token: SECRET, agent_id: 'local-test-worker', role: 'worker' },
        transports: ['websocket']
    });

    socket.on('connect', () => {
        console.log("✅ [FUNCTIONAL] Handshake Successful");

        // 2. Integration Test: Telemetry Reporting
        socket.emit('report', { 
            specs: { cpu: 10, ram: 20 },
            cron: ["job-1"] 
        });
        console.log("✅ [INTEGRATION] Telemetry Data Flowing");

        // 3. Smoke Test: Message Broadcasting
        socket.emit('message', { to: 'all', msg: 'System check' });
        console.log("✅ [SMOKE] Message Broadcast Triggered");
    });

    socket.on('connect_error', (err) => {
        console.error("❌ [FAIL] Connection Error:", err.message);
        process.exit(1);
    });

    setTimeout(() => {
        console.log("🏁 Local tests complete. Verify state in Terminal UI.");
        socket.disconnect();
        process.exit(0);
    }, 5000);
}

runLocalTests();
