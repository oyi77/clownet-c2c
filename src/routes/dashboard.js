const state = require('../state');
const { resolveTenant } = require('../auth');
const { verifyToken } = require('../middleware/auth');

function readBearerToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    return authHeader.substring(7);
}

function resolveDashboardTenantId(req) {
    const token = readBearerToken(req);
    if (!token) return null;

    const tenantId = resolveTenant(token);
    if (tenantId) return tenantId;

    const decoded = verifyToken(token);
    if (decoded) return decoded.tenantId || 'default';

    return null;
}

function getUnauthedViewContext() {
    return {
        agents: [],
        tasks: [],
        messages: [],
        settings: {
            supabase_url: '',
            supabase_key: '',
            clientApprovalMode: 'auto',
            whitelistedClients: [],
            blacklistedClients: [],
            tokenRotationEnabled: false
        },
        connectionEvents: [],
        pendingClients: [],
        commandTemplates: []
    };
}

function register(fastify) {
    fastify.get('/dashboard', async (req, reply) => {
        const tenantId = resolveDashboardTenantId(req);
        const ctx = tenantId ? null : getUnauthedViewContext();
        const s = tenantId ? state.getTenantState(tenantId) : null;
        const host = req.headers.host;
        const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'wss' : 'ws';
        const serverUrl = `${protocol}://${host}`;

        return reply.view('dashboard.ejs', {
            isAuthenticated: !!tenantId,
            agents: tenantId ? Object.values(s.agents) : ctx.agents,
            tasks: tenantId ? s.tasks.slice(-20) : ctx.tasks,
            messages: tenantId ? s.messages.slice(-50) : ctx.messages,
            authEnabled: true,
            serverUrl: serverUrl,
            accessCodeRequired: false,
            isAccessCode: false,
            settings: tenantId ? state.getSettings() : ctx.settings,
            connectionEvents: tenantId ? s.connectionEvents : ctx.connectionEvents,
            pendingClients: tenantId ? s.pendingClients : ctx.pendingClients,
            commandTemplates: tenantId ? s.commandTemplates : ctx.commandTemplates
        });
    });
}

module.exports = { register };
