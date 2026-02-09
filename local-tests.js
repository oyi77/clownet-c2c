const axios = require('axios');
const io = require('socket.io-client');
const { v4: uuidv4 } = require('uuid');

const SERVER_URL = 'http://localhost:3030';
const SECRET_KEY = 'very-secret-key-123';
const AGENT_ID = 'test-agent-' + uuidv4().substring(0, 4);

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
    console.log("🛠️ Starting Local Merge Verification Tests...");

    // 1. HTTP Server Check
    try {
        const res = await axios.get(SERVER_URL);
        if (res.status === 200 && res.data.online) {
            console.log("✅ HTTP Server is ONLINE (v3.3 War Room)");
        } else {
            throw new Error("Server response invalid");
        }
    } catch (e) {
        console.error("❌ HTTP Server Check FAILED:", e.message);
        process.exit(1);
    }

    // 2. Dashboard Access (Auth)
    try {
        await axios.get(`${SERVER_URL}/dashboard`, {
            headers: { 'Authorization': `Bearer ${SECRET_KEY}` }
        });
        console.log("✅ Dashboard Access (Auth) PASSED");
    } catch (e) {
        console.error("❌ Dashboard Access FAILED:", e.message);
        process.exit(1);
    }

    // 3. Socket Connection & Chat
    console.log("🔌 Connecting Agent...");
    const socket = io(SERVER_URL, {
        auth: { token: SECRET_KEY, agent_id: AGENT_ID, role: 'worker' },
        reconnection: false
    });

    await new Promise((resolve, reject) => {
        socket.on('connect', () => {
            console.log(`✅ Agent ${AGENT_ID} Connected`);
            resolve();
        });
        socket.on('connect_error', (err) => reject(err));
        setTimeout(() => reject(new Error("Socket timeout")), 3000);
    });

    // 4. Test Chat (Global)
    console.log("💬 Testing Chat Broadcast...");
    const testMsg = `Hello World ${uuidv4()}`;
    
    const chatPromise = new Promise((resolve, reject) => {
        socket.on('chat_update', (msg) => {
            if (msg.msg === testMsg && msg.from === AGENT_ID) {
                console.log("✅ Chat Broadcast Received");
                resolve();
            }
        });
        setTimeout(() => reject(new Error("Chat timeout")), 3000);
    });

    socket.emit('chat', { msg: testMsg });
    await chatPromise;

    // 5. Test Dispatch
    console.log("⚡ Testing Command Dispatch...");
    const taskPromise = new Promise((resolve, reject) => {
        socket.on('task_update', (tasks) => {
            const myTask = tasks.find(t => t.agent_id === AGENT_ID && t.cmd === '/ping');
            if (myTask) {
                console.log("✅ Task Dispatch Received");
                resolve();
            }
        });
        setTimeout(() => reject(new Error("Task timeout")), 3000);
    });

    // Simulate master dispatching to us
    // Since we are just a worker, we can't dispatch via socket unless we are master or using the API (which isn't fully exposed for dispatch yet without socket)
    // Actually, workers CAN dispatch in this loose permission model, or we can use a second socket as master.
    // Let's just use the current socket for simplicity as the code allows it currently.
    socket.emit('dispatch', { to: AGENT_ID, cmd: '/ping' });
    await taskPromise;

    console.log("🎉 All Local Tests PASSED");
    socket.close();
    process.exit(0);
}

runTests().catch(e => {
    console.error("❌ Unexpected Error:", e);
    process.exit(1);
});
