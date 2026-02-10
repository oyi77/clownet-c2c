const state = require('../state');

function register(fastify) {
    fastify.get('/', async () => ({
        status: 'ClawNet v3.5 Modular',
        online: true,
    }));
}

module.exports = { register };
