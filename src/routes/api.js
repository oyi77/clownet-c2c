const state = require('../state');
const persistence = require('../persistence');
const config = require('../config');
const { readLastLines } = require('../utils/logger');
const { getRecentTraffic } = require('../utils/audit');

function register(fastify) {
    // Settings
    fastify.post('/api/settings', async (req, reply) => {
        const { supabase_url, supabase_key } = req.body;
        state.setSettings({ supabase_url, supabase_key });
        persistence.saveSettings();
        return reply.redirect('/dashboard');
    });

    // Server logs
    fastify.get('/api/logs/server', async (req, reply) => {
        const limit = Math.min(parseInt(req.query.limit || '200', 10), 1000);
        return reply.send({ lines: readLastLines(config.SERVER_LOG_PATH, limit) });
    });

    // Task logs
    fastify.get('/api/logs/tasks', async (req, reply) => {
        const s = state.getTenantState('default');
        const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
        return reply.send({ tasks: s.tasks.slice(-limit) });
    });

    // Metrics endpoint
    fastify.get('/api/metrics', async (req, reply) => {
        const s = state.getTenantState('default');
        const agentsOnline = Object.values(s.agents).filter(a => a.status === 'online').length;
        return reply.send({
            tasks_total: s.metrics.tasks_total,
            tasks_success: s.metrics.tasks_success,
            tasks_failed: s.metrics.tasks_failed,
            messages_total: s.metrics.messages_total,
            agents_online: agentsOnline,
        });
    });

    // Traffic audit log
    fastify.get('/api/traffic', async (req, reply) => {
        const limit = Math.min(parseInt(req.query.limit || '50', 10), 500);
        return reply.send({ entries: getRecentTraffic(limit) });
    });
}

module.exports = { register };
