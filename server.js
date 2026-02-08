const fastify = require('fastify')({ logger: true });
const path = require('path');
const socketio = require('socket.io');
const db = require('./database');

// Configuration
const SECRET_KEY = process.env.CLAWNET_SECRET_KEY || 'very-secret-key-123';
const PORT = process.env.PORT || 3000;

// Plugins
fastify.register(require('@fastify/static'), {
    root: path.join(__dirname, 'public'),
    prefix: '/public/',
});

fastify.register(require('@fastify/view'), {
    engine: { ejs: require('ejs') },
    root: path.join(__dirname, 'views'),
});

// Routes
fastify.get('/dashboard', async (request, reply) => {
    const agents = await db.getAgents();
    console.log("Dashboard fetch, agents count:", agents.length);
    return reply.view('dashboard.ejs', { agents });
});

fastify.get('/', async (request, reply) => {
    return { status: 'ClawNet Relay Active', version: '1.0.0' };
});

// Start Server
const start = async () => {
    try {
        await fastify.listen({ port: PORT, host: '0.0.0.0' });
        const io = new socketio.Server(fastify.server, {
            cors: { origin: "*" }
        });

        io.use((socket, next) => {
            const token = socket.handshake.auth.token;
            if (token === SECRET_KEY) {
                return next();
            }
            console.log("Auth failed for socket");
            return next(new Error('Authentication error'));
        });

        io.on('connection', (socket) => {
            const agentId = socket.handshake.auth.agent_id;
            const role = socket.handshake.auth.role || 'worker';
            
            console.log(`Agent connected: ${agentId} (${role})`);
            db.updateAgent(agentId, role, 'online', "Waiting for report...");

            socket.on('report', (payload) => {
                console.log(`Report received from ${agentId}`);
                db.updateAgent(agentId, role, 'online', payload.cron || "No cron data");
                io.emit('agent_update');
            });

            socket.on('disconnect', () => {
                console.log(`Agent disconnected: ${agentId}`);
                db.updateAgent(agentId, role, 'offline', "Disconnected");
                io.emit('agent_update');
            });
        });

        console.log(`ClawNet Relay running on port ${PORT}`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();
