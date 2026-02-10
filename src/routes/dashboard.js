const state = require('../state');

function register(fastify) {
    fastify.get('/dashboard', async (req, reply) => {
        const s = state.getTenantState('default');
        return reply.view('dashboard.ejs', {
            agents: Object.values(s.agents),
            tasks: s.tasks.slice(-20),
            messages: s.messages.slice(-50),
            secret: '',
            accessCodeRequired: false,
            isAccessCode: false,
            settings: state.getSettings(),
        });
    });
}

module.exports = { register };
