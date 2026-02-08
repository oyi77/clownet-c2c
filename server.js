const fastify = require('fastify')({ logger: true });
const path = require('path');
const socketio = require('socket.io');
const state = require('./state');

const SECRET_KEY = process.env.CLAWNET_SECRET_KEY || 'very-secret-key-123';
const PORT = process.env.PORT || 3000;

fastify.register(require('@fastify/static'), {
    root: path.join(__dirname, 'public'),
    prefix: '/public/',
});

fastify.register(require('@fastify/view'), {
    engine: { ejs: require('ejs') },
    root: path.join(__dirname, 'views'),
});

// v2 Dashboard
fastify.get('/dashboard', async (request, reply) => {
    return reply.view('dashboard.ejs', { 
        agents: state.getAgents(),
        tasks: state.getTasks(),
        messages: state.getMessages(),
        settings: state.getSettings()
    });
});

fastify.get('/', async () => ({ status: 'ClawNet Relay v2.0 Active', architecture: 'Federated Intelligence' }));

// Role Assignment API
fastify.post('/api/role', async (request, reply) => {
    const { agentId, role, secret } = request.body;
    if (secret !== SECRET_KEY) return reply.status(401).send({ error: 'Unauthorized' });
    await state.reassignRole(agentId, role);
    return { success: true };
});

// Settings API
fastify.post('/api/settings', async (request, reply) => {
    const { settings, secret } = request.body;
    if (secret !== SECRET_KEY) return reply.status(401).send({ error: 'Unauthorized' });
    state.updateSettings(settings);
    return { success: true };
});

const start = async () => {
    try {
        await fastify.listen({ port: PORT, host: '0.0.0.0' });
        const io = new socketio.Server(fastify.server, { cors: { origin: "*" } });

        io.use((socket, next) => {
            const token = socket.handshake.auth.token;
            if (token === SECRET_KEY) return next();
            return next(new Error('Authentication error'));
        });

        io.on('connection', (socket) => {
            const agentId = socket.handshake.auth.agent_id;
            const initialRole = socket.handshake.auth.role || 'worker';
            
            console.log(`Agent connected: ${agentId} (${initialRole})`);
            state.updateAgent(agentId, { id: agentId, status: 'online', role: initialRole });

            // Broadcast to everyone that a new agent joined
            io.emit('state_sync', { agents: state.getAgents() });

            socket.on('traffic_log', (log) => {
                const currentAgent = state.getAgents().find(a => a.id === agentId);
                if (currentAgent && currentAgent.role === 'warden') {
                    state.saveMessage({
                        sender_id: agentId,
                        content: `Warden Log: ${log.type}`,
                        raw_traffic: log,
                        message_type: 'system'
                    });
                }
            });

            socket.on('report', (payload) => {
                state.updateAgent(agentId, { 
                    status: 'online', 
                    specs: payload.specs,
                    metadata: payload.metadata
                });
                io.emit('state_sync', { agents: state.getAgents() });
            });

            socket.on('task_update', (task) => {
                state.saveTask(task);
                io.emit('state_sync', { tasks: state.getTasks() });
            });

            socket.on('chat', (msg) => {
                // If it's a command broadcast from a Master
                if (msg.content.startsWith('/') || msg.type === 'command') {
                    const task = {
                        agent_id: msg.target || 'all',
                        title: msg.content,
                        status: 'pending'
                    };
                    state.saveTask(task).then(savedTask => {
                        // Emit to ALL agents
                        io.emit('message', {
                            sender_id: agentId,
                            content: msg.content,
                            task_id: savedTask.id,
                            type: 'command'
                        });
                        io.emit('state_sync', { tasks: state.getTasks() });
                    });
                } else {
                    state.saveMessage({
                        sender_id: agentId,
                        target_id: msg.target || 'all',
                        content: msg.content
                    });
                    io.emit('chat_broadcast', {
                        sender_id: agentId,
                        content: msg.content,
                        timestamp: new Date().toISOString()
                    });
                }
            });

            socket.on('disconnect', () => {
                state.updateAgent(agentId, { status: 'offline' });
                io.emit('state_sync', { agents: state.getAgents() });
            });
        });

    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();
