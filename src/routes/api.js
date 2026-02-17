const state = require('../state');
const persistence = require('../persistence');
const config = require('../config');
const { readLastLines, readAuditLogs } = require('../utils/logger');
const { getRecentTraffic } = require('../utils/audit');
const { getServerStats } = require('../utils/server-monitor');

function register(fastify) {
    // Settings
    fastify.post('/api/settings', async (req, reply) => {
        const { supabase_url, supabase_key } = req.body;
        state.setSettings({ supabase_url, supabase_key });
        persistence.saveSettings();
        return reply.redirect('/dashboard');
    });

    fastify.post('/api/advanced-settings', async (req, reply) => {
        const { clientApprovalMode, whitelistedClients, blacklistedClients } = req.body;
        const currentSettings = state.getSettings();
        const newSettings = {
            ...currentSettings,
            clientApprovalMode,
            whitelistedClients: whitelistedClients || [],
            blacklistedClients: blacklistedClients || []
        };
        state.setSettings(newSettings);
        persistence.saveSettings();
        return reply.send({ success: true, settings: newSettings });
    });

    fastify.post('/api/client/approve', async (req, reply) => {
        const { agentId } = req.body;
        const s = state.getTenantState('default');
        const settings = state.getSettings();

        if (s.pendingClients.find(c => c.agentId === agentId)) {
            s.pendingClients = s.pendingClients.filter(c => c.agentId !== agentId);
            settings.whitelistedClients.push(agentId);
            state.setSettings(settings);
            persistence.saveSettings();
        }

        return reply.send({ success: true, pendingClients: s.pendingClients });
    });

    fastify.post('/api/client/deny', async (req, reply) => {
        const { agentId } = req.body;
        const s = state.getTenantState('default');

        if (s.pendingClients.find(c => c.agentId === agentId)) {
            s.pendingClients = s.pendingClients.filter(c => c.agentId !== agentId);
        }

        return reply.send({ success: true, pendingClients: s.pendingClients });
    });

    // Command Templates
    fastify.get('/api/templates', async (req, reply) => {
        const s = state.getTenantState('default');
        return reply.send({ templates: s.commandTemplates || [] });
    });

    fastify.post('/api/templates', async (req, reply) => {
        const { name, command } = req.body;
        const s = state.getTenantState('default');
        const newTemplate = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2),
            name,
            command
        };
        s.commandTemplates.push(newTemplate);
        return reply.send({ success: true, template: newTemplate });
    });

    fastify.delete('/api/templates/:id', async (req, reply) => {
        const { id } = req.params;
        const s = state.getTenantState('default');
        s.commandTemplates = s.commandTemplates.filter(t => t.id !== id);
        return reply.send({ success: true });
    });

    // Server logs
    fastify.get('/api/logs/server', async (req, reply) => {
        let limit = Math.min(parseInt(req.query.limit || '200', 10), 1000);
        const search = req.query.search ? req.query.search.toLowerCase() : null;

        let lines = readLastLines(config.SERVER_LOG_PATH, limit);

        if (search) {
            lines = lines.filter(line => line.toLowerCase().includes(search));
        }

        return reply.send({ lines });
    });

    // Audit logs
    fastify.get('/api/logs/audit', async (req, reply) => {
        let limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
        const eventType = req.query.type || null;

        let entries = readAuditLogs(limit);

        if (eventType) {
            entries = entries.filter(e => e.type === eventType);
        }

        return reply.send({ entries });
    });

    // Task logs
    fastify.get('/api/logs/tasks', async (req, reply) => {
        const s = state.getTenantState('default');
        let limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
        const search = req.query.search ? req.query.search.toLowerCase() : null;

        let tasks = s.tasks.slice(-limit);

        if (search) {
            tasks = tasks.filter(t =>
                (t.id && t.id.toLowerCase().includes(search)) ||
                (t.agent_id && t.agent_id.toLowerCase().includes(search)) ||
                (t.cmd && t.cmd.toLowerCase().includes(search))
            );
        }

        return reply.send({ tasks });
    });

// Metrics endpoint
  fastify.get('/api/metrics', async (req, reply) => {
    const s = state.getTenantState('default');
    const agentsOnline = Object.values(s.agents).filter(a => a.status === 'online').length;
    const serverStats = getServerStats();
    return reply.send({
      tasks_total: s.metrics.tasks_total,
      tasks_success: s.metrics.tasks_success,
      tasks_failed: s.metrics.tasks_failed,
      messages_total: s.metrics.messages_total,
      agents_online: agentsOnline,
      server: {
        cpu: serverStats.cpu_percent,
        ram: serverStats.ram_percent,
        uptime: serverStats.uptime
      }
    });
  });

    // Traffic audit log
    fastify.get('/api/traffic', async (req, reply) => {
        const limit = Math.min(parseInt(req.query.limit || '50', 10), 500);
        return reply.send({ entries: getRecentTraffic(limit) });
    });

    fastify.get('/api/agents/:id', async (req, reply) => {
        const s = state.getTenantState('default');
        const agentId = req.params.id;
        const agent = s.agents[agentId];

        if (!agent) {
            return reply.status(404).send({ error: 'Agent not found' });
        }

        const recentTasks = s.tasks.filter(t => t.agent_id === agentId).slice(-20);

        return reply.send({
            agent: {
                id: agent.id,
                role: agent.role,
                status: agent.status,
                last_seen: agent.last_seen,
                ip: agent.ip,
                specs: agent.specs,
                sessions: agent.sessions,
            },
            tasks: recentTasks
        });
    });

// Server info
  fastify.get('/api/info', async (req, reply) => {
    return reply.send({
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      pid: process.pid,
      server: getServerStats()
    });
  });

    // Token rotation (write new token to .env file)
    fastify.post('/api/rotate-token', async (req, reply) => {
        const { newToken } = req.body;
        if (!newToken || newToken.length < 8) {
            return reply.status(400).send({ success: false, error: 'Token must be at least 8 characters' });
        }

        const envPath = require('path').join(__dirname, '..', '..', '.env');
        const fs = require('fs');

        try {
            let envContent = '';
            if (fs.existsSync(envPath)) {
                envContent = fs.readFileSync(envPath, 'utf8');
            }

            // Update or add CLAWNET_SECRET_KEY
            const tokenRegex = /^CLAWNET_SECRET_KEY=.*$/m;
            if (tokenRegex.test(envContent)) {
                envContent = envContent.replace(tokenRegex, `CLAWNET_SECRET_KEY=${newToken}`);
            } else {
                envContent += `\nCLAWNET_SECRET_KEY=${newToken}\n`;
            }

            fs.writeFileSync(envPath, envContent);

            return reply.send({ success: true, message: 'Token rotated. Restart server to apply.' });
        } catch (e) {
            return reply.status(500).send({ success: false, error: e.message });
        }
    });

    // Restart server
    fastify.post('/api/restart', async (req, reply) => {
        // Signal itself to restart (requires process manager like pm2, Docker, or systemd)
        setTimeout(() => {
            process.kill(process.pid, 'SIGTERM');
        }, 100);
        return reply.send({ success: true, message: 'Restart signal sent.' });
    });
}

module.exports = { register };
