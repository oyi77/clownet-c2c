const path = require('path');
const fastify = require('fastify')({ logger: true });
const fastifyView = require('@fastify/view');
const ejs = require('ejs');
const fastifyStatic = require('@fastify/static');
const fastifyFormbody = require('@fastify/formbody');

const config = require('./config');
const persistence = require('./persistence');
const socketSetup = require('./socket');
const healthRoutes = require('./routes/health');
const dashboardRoutes = require('./routes/dashboard');
const apiRoutes = require('./routes/api');
const authRoutes = require('./routes/auth');

// Template engine
fastify.register(fastifyView, {
    engine: { ejs },
    root: path.join(__dirname, '..', 'views'),
});

// Static files
try {
    fastify.register(fastifyStatic, {
        root: path.join(__dirname, '..', 'public'),
        prefix: '/',
    });
} catch (e) {
    // public/ dir may not exist
}

// Parse form bodies
fastify.register(fastifyFormbody);

// Register routes
healthRoutes.register(fastify);
dashboardRoutes.register(fastify);
apiRoutes.register(fastify);
authRoutes.register(fastify);

// Load persisted state
persistence.loadState();

// Boot
async function start() {
    try {
        await fastify.listen({ port: config.PORT, host: '0.0.0.0' });
        console.log(`ClawNet Relay v3.5 operational on port ${config.PORT}`);

        // Attach Socket.io to the raw HTTP server
        socketSetup.setup(fastify.server);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
}

start();

// Export for testing
module.exports = { fastify, start };
