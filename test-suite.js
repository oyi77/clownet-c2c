const io = require('socket.io-client');
const axios = require('axios');

const BASE_URL = "https://clownet-c2c.fly.dev";
const SECRET = "very-secret-key-123";

async function runTests() {
    console.log("🧪 Starting ClawNet C2C v2.1 Integration Tests...");

    // Test 1: Web Connectivity
    try {
        const res = await axios.get(`${BASE_URL}/`);
        if (res.status === 200) console.log("✅ [HTTP] Relay Root is UP");
    } catch (e) {
        console.error("❌ [HTTP] Relay Root is DOWN");
        process.exit(1);
    }

    // Test 2: Socket Auth & Connection
    const socket = io(BASE_URL, {
        auth: { token: SECRET, agent_id: 'tester-bot', role: 'worker' }
    });

    socket.on('connect', () => {
        console.log("✅ [WS] Auth & Connection Successful");
        
        // Test 3: Reporting Logic
        socket.emit('report', { cron: ["test-job 12:00"] });
        console.log("✅ [WS] Heartbeat/Report Sent");
    });

    socket.on('connect_error', (err) => {
        console.error("❌ [WS] Connection Failed:", err.message);
        process.exit(1);
    });

    // Timeout after 15s
    setTimeout(() => {
        console.log("🏁 Tests finished.");
        socket.disconnect();
        process.exit(0);
    }, 15000);
}

runTests();
