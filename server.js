const fastify = require('fastify')({ logger: true });
const path = require('path');
const socketio = require('socket.io');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

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
            state.tasks = data.tasks || [];
            state.messages = data.messages || [];
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
    try {
        fs.appendFileSync(SERVER_LOG_PATH, line);
    } catch (e) {
        console.error("Log Write Error", e);
    }
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

// Dashboard Route (v3.2.1 Fix) - Protected
fastify.get('/dashboard', async (req, reply) => {
    // Basic auth protection for dashboard
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.substring(7) !== SECRET_KEY) {
        reply.header('WWW-Authenticate', 'Bearer realm="ClawNet Dashboard"');
        return reply.code(401).send({ error: 'Unauthorized' });
    }
    
    return reply.view('dashboard.ejs', { 
        agents: Object.values(state.agents),
        tasks: state.tasks.slice(-20),
        messages: state.messages.slice(-50),
        secret: SECRET_KEY,
        settings: settings
    });
});

fastify.post('/api/settings', async (req, reply) => {
    const { supabase_url, supabase_key } = req.body;
    settings = { supabase_url, supabase_key };
    saveSettings();
    return reply.redirect('/dashboard');
});

fastify.get('/api/docs', async (req, reply) => {
    const docsPath = path.join(__dirname, 'openapi.yaml');
    if (!fs.existsSync(docsPath)) {
        return reply.code(404).send({ error: 'OpenAPI spec not found' });
    }
    reply.type('text/yaml').send(fs.readFileSync(docsPath, 'utf8'));
});

fastify.get('/api/logs/server', async (req, reply) => {
    const limit = Math.min(parseInt(req.query.limit || '200', 10), 1000);
    return reply.send({ lines: readLastLines(SERVER_LOG_PATH, limit) });
});

fastify.get('/api/logs/tasks', async (req, reply) => {
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    return reply.send({ tasks: state.tasks.slice(-limit) });
});

fastify.get('/', async () => ({ status: 'ClawNet v3.3 War Room', online: true }));

const start = async () => {
    try {
        await fastify.listen({ port: PORT, host: '0.0.0.0' });
        // ALLOW POLLING FOR ROBUSTNESS
        const io = new socketio.Server(fastify.server, { 
            cors: { origin: "*" },
            transports: ['websocket', 'polling'] 
        });

        io.use((socket, next) => {
            const token = socket.handshake.auth.token;
            if (token === SECRET_KEY) return next();
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
                    sessions: [],
                    last_seen: new Date().toISOString(),
                    sid: sid
                };
                console.log(`[+] Agent ${agent_id} joined as ${role} (${socket.conn.transport.name})`);
                logEvent(`Agent connected: ${agent_id} role=${role || 'worker'} sid=${sid}`);
                io.emit('fleet_update', Object.values(state.agents));
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
                if (!payload || !payload.to || !payload.cmd) return;
                const task = {
                    id: uuidv4(),
                    agent_id: payload.to === 'all' ? 'BROADCAST' : payload.to,
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
                if (!payload || !payload.id) return;
                const task = state.tasks.find(t => t.id === payload.id);
                if (task) {
                    task.status = (payload.status || 'UNKNOWN').toUpperCase();
                    task.result = payload.output || '';
                    if (payload.agent_id) task.agent_id = payload.agent_id;
                    saveState();
                    io.emit('task_update', state.tasks.slice(-20));
                    io.emit('intel_update', { type: 'task', task });
                    logEvent(`Task result: ${task.id} status=${task.status} agent=${task.agent_id}`);
                }
            });

            socket.on('typing', (payload) => {
                if (!payload || typeof payload !== 'object') return;
                const to = payload.to || 'all';
                const msg = {
                    from: agent_id || 'master-ui',
                    to: to,
                    isTyping: payload.isTyping === true,
                    ts: new Date().toISOString()
                };

                if (to === 'all') {
                    io.emit('typing_update', msg);
                } else {
                    const target = state.agents[to];
                    if (target) io.to(target.sid).emit('typing_update', msg);
                    socket.emit('typing_update', msg);
                }
            });

            // Unified Chat/Message Handler
            socket.on('chat', (payload) => {
                // Support both 'msg' (old) and 'to/msg' (new) formats
                // Fallback to 'all' if 'to' is missing (Global Chat)
                const to = payload.to || 'all';
                const messageText = payload.msg || payload.message;
                
                if (!messageText) return;

                const msg = { 
                    from: agent_id || 'master-ui', 
                    to: to,
                    msg: messageText, 
                    ts: new Date().toISOString() 
                };

                state.messages.push(msg);
                if (state.messages.length > 100) state.messages.shift();
                saveState();

                // Emit to relevant parties
                if (to === 'all') {
                     io.emit('chat_update', msg);
                     io.emit('intel_update', { type: 'chat', message: msg });
                } else {
                    // Direct Message
                    const target = state.agents[to];
                    if (target) io.to(target.sid).emit('chat_update', msg);
                    // Also send back to sender (if not me)
                    socket.emit('chat_update', msg);
                    // And to master UI
                     io.emit('intel_update', { type: 'chat', message: msg });
                }

                logEvent(`Chat: ${msg.from} -> ${msg.to}: ${msg.msg}`);
            });
            
            // Legacy/Sidecar support alias
            socket.on('message', (payload) => {
                if (socket.listeners('chat').length > 0) {
                     // trigger the chat listener
                     const chatHandler = socket.listeners('chat')[0];
                     chatHandler(payload);
                }
            });

            socket.on('reassign_role', (payload) => {
                if (!payload || !payload.agent_id || !payload.role) return;
                if (role !== 'master') return;
                if (state.agents[payload.agent_id]) {
                    state.agents[payload.agent_id].role = payload.role;
                    io.emit('fleet_update', Object.values(state.agents));
                    logEvent(`Role change: ${payload.agent_id} -> ${payload.role}`);
                }
            });

            socket.on('disconnect', () => {
                if (agent_id && state.agents[agent_id]) {
                    state.agents[agent_id].status = 'offline';
                    io.emit('fleet_update', Object.values(state.agents));
                    logEvent(`Agent disconnected: ${agent_id}`);
                }
            });
        });

    } catch (err) { process.exit(1); }
};

start();
