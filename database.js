const path = require('path');
const fs = require('fs');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'clownet.json');

// Simple JSON database to avoid native binary issues with SQLite in Docker
let data = { agents: {}, messages: [] };

if (fs.existsSync(dbPath)) {
    try {
        data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    } catch (e) {
        console.error("Error loading database, starting fresh");
    }
}

function save() {
    try {
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Error saving database:", e);
    }
}

module.exports = {
    getAgents: () => Promise.resolve(Object.values(data.agents)),
    updateAgent: (id, role, status, cron) => {
        data.agents[id] = {
            id,
            role,
            status,
            last_heartbeat: new Date().toISOString(),
            cron_snapshot: cron
        };
        save();
    },
    saveMessage: (sender, target, content) => {
        data.messages.push({
            sender_id: sender,
            target_id: target,
            content: content,
            timestamp: new Date().toISOString()
        });
        if (data.messages.length > 1000) data.messages.shift(); // Keep last 1000
        save();
    }
};
