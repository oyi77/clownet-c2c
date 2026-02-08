const fastify = require('fastify')({ logger: true });
const path = require('path');
const socketio = require('socket.io');
const fs = require('fs');

// Configuration
const SECRET_KEY = process.env.CLAWNET_SECRET_KEY || 'very-secret-key-123';
const PORT = process.env.PORT || 3000;

// Dynamic Paths for Local vs Fly.io
const DATA_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const SETTINGS_PATH = path.join(DATA_DIR, 'settings.json');
const DB_PATH = path.join(DATA_DIR, 'clownet.json');

let state = {
    agents: {},
    tasks: [],
    messages: [],
    settings: { supabase_url: '', supabase_key: '' }
};

function loadPersistence() {
    try {
        if (fs.existsSync(SETTINGS_PATH)) state.settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
        if (fs.existsSync(DB_PATH)) {
            const dbData = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
            state.agents = dbData.agents || {};
            state.tasks = dbData.tasks || [];
            state.messages = dbData.messages || [];
        }
    } catch (e) {}
}

function savePersistence() {
    try {
        fs.writeFileSync(SETTINGS_PATH, JSON.stringify(state.settings));
        fs.writeFileSync(DB_PATH, JSON.stringify({
            agents: state.agents,
            tasks: state.tasks,
            messages: state.messages
        }));
    } catch (e) { console.error("Persistence save failed:", e.message); }
}

loadPersistence();

fastify.register(require('@fastify/static'), { root: path.join(__dirname, 'public'), prefix: '/public/' });
fastify.register(require('@fastify/view'), { engine: { ejs: require('ejs') }, root: path.join(__dirname, 'views') });
fastify.register(require('@fastify/formbody'));

fastify.get('/dashboard', async (request, reply) => {
    return reply.view('dashboard.ejs', { 
        agents: Object.values(state.agents),
        tasks: state.tasks,
        messages: state.messages,
        settings: state.settings
    });
});

fastify.get('/', async () => ({ status: 'ClawNet v3.0 Sovereign Relay Active' }));

const start = async () => {
    try {
        await fastify.listen({ port: PORT, host: '0.0.0.0' });
        const io = new socketio.Server(fastify.server, { cors: { origin: "*" } });

        io.on('connection', (socket) => {
            const token = socket.handshake.auth.token;
            if (token !== SECRET_KEY) return socket.disconnect();

            const agentId = socket.handshake.auth.agent_id || 'unknown';
            const role = socket.handshake.auth.role || 'worker';

            state.agents[agentId] = { id: agentId, role, status: 'online', last_heartbeat: new Date().toISOString(), cron_snapshot: 'Waiting...' };
            io.emit('agent_update');

            socket.on('report', (payload) => {
                if (state.agents[agentId]) {
                    state.agents[agentId].cron_snapshot = payload.cron;
                    state.agents[agentId].last_heartbeat = new Date().toISOString();
                    savePersistence();
                    io.emit('agent_update');
                }
            });

            socket.on('message', (payload) => {
                const msg = { from: agentId, to: payload.to, msg: payload.msg, ts: new Date().toISOString() };
                state.messages.push(msg);
                if (state.messages.length > 50) state.messages.shift();
                savePersistence();
                io.emit('direct_message', msg);
            });

            socket.on('disconnect', () => {
                if (state.agents[agentId]) state.agents[agentId].status = 'offline';
                io.emit('agent_update');
            });
        });
    } catch (err) {
        process.exit(1);
    }
};

start();
