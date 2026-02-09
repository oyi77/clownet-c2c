const fastify = require('fastify')({ logger: true });
const path = require('path');
const socketio = require('socket.io');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// SIMPLIFIED CONFIG
const SECRET_KEY = process.env.CLAWNET_SECRET_KEY || 'very-secret-key-123';
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'clownet_v3.json');
const SETTINGS_PATH = path.join(DATA_DIR, 'settings.json');
const SERVER_LOG_PATH = path.join(DATA_DIR, 'server.log');

// Real-time State
let state = {
    agents: {},
    tasks: [],
    messages: []
};

let settings = { supabase_url: '', supabase_key: '' };

function loadState() {
    try {
        if (fs.existsSync(DB_PATH)) {
            const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
            if (data.tenants && data.tenants.default) {
                 state.tasks = data.tenants.default.tasks || [];
                 state.messages = data.tenants.default.messages || [];
            } else {
                 state.tasks = data.tasks || [];
                 state.messages = data.messages || [];
            }
        }
        if (fs.existsSync(SETTINGS_PATH)) {
            settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
        }
    } catch (e) { console.error("Persistence Load Error", e); }
}

function saveState() {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify({
            tasks: state.tasks,
            messages: state.messages
        }, null, 2));
    } catch (e) { console.error("DB Save Error", e); }
}

function saveSettings() {
    try {
        fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings));
    } catch (e) { console.error("Settings Save Error", e); }
}

function logEvent(message) {
    const line = `[${new Date().toISOString()}] ${message}\n`;
    try { fs.appendFileSync(SERVER_LOG_PATH, line); } catch (e) {}
}

function readLastLines(filePath, limit) {
    try {
        if (!fs.existsSync(filePath)) return [];
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split(/\r?\n/).filter(Boolean);
        return lines.slice(-limit);
    } catch (e) {
        console.error("Log Read Error", e);
        return [];
    }
}

loadState();

fastify.register(require('@fastify/static'), { root: path.join(__dirname, 'public'), prefix: '/public/' });
fastify.register(require('@fastify/view'), { engine: { ejs: require('ejs') }, root: path.join(__dirname, 'views') });
fastify.register(require('@fastify/formbody'));

// DASHBOARD
fastify.get('/dashboard', async (req, reply) => {
    return reply.view('dashboard.ejs', { 
        agents: Object.values(state.agents),
        tasks: state.tasks.slice(-20),
        messages: state.messages.slice(-50),
        secret: '',
        accessCodeRequired: false, 
        isAccessCode: false,
        settings: settings
    });
});

// API ROUTES
fastify.post('/api/settings', async (req, reply) => {
    const { supabase_url, supabase_key } = req.body;
    settings = { supabase_url, supabase_key };
    saveSettings();
    return reply.redirect('/dashboard');
});

fastify.get('/api/logs/server', async (req, reply) => {
    const limit = Math.min(parseInt(req.query.limit || '200', 10), 1000);
    return reply.send({ lines: readLastLines(SERVER_LOG_PATH, limit) });
});

fastify.get('/api/logs/tasks', async (req, reply) => {
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    return reply.send({ tasks: state.tasks.slice(-limit) });
});

fastify.get('/', async () => ({ status: 'ClawNet v3.3 Simplified', online: true }));

const start = async () => {
    try {
        await fastify.listen({ port: PORT, host: '0.0.0.0' });
        
        const io = new socketio.Server(fastify.server, { 
            cors: { origin: "*" },
            transports: ['websocket', 'polling'] 
        });

        io.use((socket, next) => {
            const token = socket.handshake.auth.token;
            if (token === SECRET_KEY) return next();
            console.log(`Auth Failed. Expected: ${SECRET_KEY.substring(0,3)}... Got: ${token ? token.substring(0,3) + '...' : 'null'}`);
            next(new Error('Unauthorized'));
        });

        io.on('connection', (socket) => {
            const { agent_id, role, specs } = socket.handshake.auth;
            const sid = socket.id;

            if (agent_id) {
                state.agents[agent_id] = {
                    id: agent_id,
                    role: role || 'worker',
                    status: 'online',
                    specs: specs || {},
                    last_seen: new Date().toISOString(),
                    sid: sid,
                    cron: [],
                    sessions: []
                };
                io.emit('fleet_update', Object.values(state.agents));
                logEvent(`Agent connected: ${agent_id}`);
            }

            socket.on('report', (data) => {
                if (!data || typeof data !== 'object') return;
                if (state.agents[agent_id]) {
                    state.agents[agent_id].last_seen = new Date().toISOString();
                    state.agents[agent_id].specs = data.specs || state.agents[agent_id].specs;
                    state.agents[agent_id].cron = data.cron || [];
                    state.agents[agent_id].sessions = data.sessions || [];
                    io.emit('fleet_update', Object.values(state.agents));
                }
            });

            socket.on('dispatch', (payload) => {
                const task = {
                    id: uuidv4(),
                    agent_id: payload.to,
                    cmd: payload.cmd,
                    status: 'PENDING',
                    ts: new Date().toISOString(),
                    result: ''
                };
                state.tasks.push(task);
                saveState();
                io.emit('task_update', state.tasks.slice(-20));
                logEvent(`Dispatch: task=${task.id} to=${task.agent_id} cmd=${payload.cmd}`);
                
                if (payload.to === 'all') {
                    socket.broadcast.emit('command', { id: task.id, cmd: payload.cmd });
                } else {
                    const target = state.agents[payload.to];
                    if (target) io.to(target.sid).emit('command', { id: task.id, cmd: payload.cmd });
                }
            });

            socket.on('task_result', (payload) => {
                const task = state.tasks.find(t => t.id === payload.id);
                if (task) {
                    task.status = (payload.status || 'UNKNOWN').toUpperCase();
                    task.result = payload.output || '';
                    saveState();
                    io.emit('task_update', state.tasks.slice(-20));
                    io.emit('intel_update', { type: 'task', task });
                    logEvent(`Task result: ${task.id} status=${task.status} agent=${task.agent_id}`);
                }
            });

            socket.on('chat', (payload) => {
                const msg = {
                    from: agent_id || 'master-ui',
                    to: payload.to || 'all',
                    msg: payload.msg || payload.message,
                    ts: new Date().toISOString()
                };
                state.messages.push(msg);
                saveState();
                io.emit('chat_update', msg);
                logEvent(`Chat: ${msg.from} -> ${msg.to}: ${msg.msg}`);
            });

            socket.on('disconnect', () => {
                if (agent_id && state.agents[agent_id]) {
                    state.agents[agent_id].status = 'offline';
                    io.emit('fleet_update', Object.values(state.agents));
                    logEvent(`Agent disconnected: ${agent_id}`);
                }
            });
        });

    } catch (err) { console.error(err); process.exit(1); }
};

start();
