const fastify = require('fastify')({ logger: false });
const path = require('path');
const socketio = require('socket.io');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const SECRET_KEY = process.env.CLAWNET_SECRET_KEY || 'very-secret-key-123';
const PORT = process.env.PORT || 3000;
const DATA_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'clownet_v3.json');

// Real-time State
let state = {
    agents: {},
    tasks: [],
    messages: []
};

function loadState() {
    if (fs.existsSync(DB_PATH)) {
        try {
            const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
            state.tasks = data.tasks || [];
            state.messages = data.messages || [];
            // Agents are volatile/discovered on connect
        } catch (e) { console.error("DB Load Error", e); }
    }
}

function saveState() {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify({
            tasks: state.tasks,
            messages: state.messages
        }, null, 2));
    } catch (e) { console.error("DB Save Error", e); }
}

loadState();

fastify.register(require('@fastify/static'), { root: path.join(__dirname, 'public'), prefix: '/public/' });
fastify.register(require('@fastify/view'), { engine: { ejs: require('ejs') }, root: path.join(__dirname, 'views') });
fastify.register(require('@fastify/formbody'));

// Dashboard with full state
fastify.get('/dashboard', async (req, reply) => {
    return reply.view('dashboard.ejs', { 
        agents: Object.values(state.agents),
        tasks: state.tasks.slice(-20),
        messages: state.messages.slice(-50),
        secret: SECRET_KEY
    });
});

fastify.get('/', async () => ({ status: 'ClawNet v3.0 Sovereign Relay', online: true }));

const start = async () => {
    try {
        await fastify.listen({ port: PORT, host: '0.0.0.0' });
        const io = new socketio.Server(fastify.server, { cors: { origin: "*" } });

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
                    last_seen: new Date().toISOString(),
                    sid: sid
                };
                console.log(`[+] Agent ${agent_id} joined as ${role}`);
                io.emit('fleet_update', Object.values(state.agents));
            }

            socket.on('report', (data) => {
                if (state.agents[agent_id]) {
                    state.agents[agent_id].last_seen = new Date().toISOString();
                    state.agents[agent_id].specs = data.specs || state.agents[agent_id].specs;
                    state.agents[agent_id].cron = data.cron || [];
                    io.emit('fleet_update', Object.values(state.agents));
                }
            });

            socket.on('dispatch', (payload) => {
                // Command from Master
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
                
                // Forward to specific agent or broadcast
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
                    task.status = payload.status; // SUCCESS / FAIL
                    task.result = payload.output;
                    saveState();
                    io.emit('task_update', state.tasks.slice(-20));
                }
            });

            socket.on('chat', (payload) => {
                const msg = { from: agent_id || 'master-ui', msg: payload.msg, ts: new Date().toISOString() };
                state.messages.push(msg);
                if (state.messages.length > 100) state.messages.shift();
                saveState();
                io.emit('chat_update', msg);
            });

            socket.on('disconnect', () => {
                if (agent_id && state.agents[agent_id]) {
                    state.agents[agent_id].status = 'offline';
                    io.emit('fleet_update', Object.values(state.agents));
                }
            });
        });

    } catch (err) { process.exit(1); }
};

start();
