const state = require('../state');

function register(fastify) {
    fastify.get('/dashboard', async (req, reply) => {
        const s = state.getTenantState('default');
        const host = req.headers.host;
        const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'wss' : 'ws';
        const serverUrl = `${protocol}://${host}`;

        return reply.view('dashboard.ejs', {
            agents: Object.values(s.agents),
            tasks: s.tasks.slice(-20),
            messages: s.messages.slice(-50),
            secret: process.env.CLAWNET_SECRET_KEY || 'very-secret-key-123',
            serverUrl: serverUrl,
            accessCodeRequired: false,
            isAccessCode: false,
            settings: state.getSettings(),
        });
    });
}

module.exports = { register };
