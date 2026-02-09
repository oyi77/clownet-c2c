const fastify = require('fastify')({ logger: true });
const path = require('path');
const socketio = require('socket.io');
const fs = require('fs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const SECRET_KEY = process.env.CLAWNET_SECRET_KEY || 'very-secret-key-123';
const DASHBOARD_ACCESS_CODE = process.env.CLAWNET_DASHBOARD_ACCESS_CODE || '';
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'clownet_v3.json');
const SETTINGS_PATH = path.join(DATA_DIR, 'settings.json');
const TENANTS_PATH = process.env.CLAWNET_TENANTS_PATH || path.join(DATA_DIR, 'tenants.json');
const SERVER_LOG_PATH = path.join(DATA_DIR, 'server.log');
const TRAFFIC_LOG_PATH = path.join(DATA_DIR, 'traffic.log');

const DEFAULT_TENANT = 'default';
const TRAFFIC_LOG_MAX_BYTES = parseInt(process.env.CLAWNET_TRAFFIC_LOG_MAX_BYTES || '5242880', 10);
const TRAFFIC_LOG_MAX_FILES = parseInt(process.env.CLAWNET_TRAFFIC_LOG_MAX_FILES || '5', 10);
const ACK_TIMEOUT_MS = parseInt(process.env.CLAWNET_ACK_TIMEOUT_MS || '5000', 10);
const ACK_MAX_RETRIES = parseInt(process.env.CLAWNET_ACK_MAX_RETRIES || '3', 10);
const COMMAND_ALLOWLIST = parseList(process.env.CLAWNET_COMMAND_ALLOWLIST || '');
const COMMAND_DENYLIST = parseList(process.env.CLAWNET_COMMAND_DENYLIST || '');
const COMMAND_RISKYLIST = parseList(process.env.CLAWNET_COMMAND_RISKYLIST || 'rm -rf,shutdown,reboot,halt,poweroff,del /s,format');

const stateByTenant = {};
const pendingAckTimers = new Map();
let tenantSecrets = {};
let lastTrafficHash = null;

function initTenantState() {
    return {
        agents: {},
        tasks: [],
        messages: [],
        pendingDispatches: {},
        pendingApprovals: {}
    };
}

function getTenantState(tenantId) {
    const key = tenantId || DEFAULT_TENANT;
    if (!stateByTenant[key]) stateByTenant[key] = initTenantState();
    return stateByTenant[key];
}

let settings = { supabase_url: '', supabase_key: '' };

function parseList(value) {
    return value
        .split(',')
        .map(item => item.trim())
        .filter(item => item.length > 0);
}

function loadTenantSecrets() {
    try {
        if (fs.existsSync(TENANTS_PATH)) {
            const data = JSON.parse(fs.readFileSync(TENANTS_PATH, 'utf8'));
            tenantSecrets = data.tenants || data || {};
        }
    } catch (e) {
        console.error('Tenant Secrets Load Error', e);
        tenantSecrets = {};
    }
}

function getTenantSecret(tenantId) {
    if (!tenantId || tenantId === DEFAULT_TENANT) return SECRET_KEY;
    if (tenantSecrets[tenantId]) return tenantSecrets[tenantId];
    return null;
}

function loadLastTrafficHash() {
    try {
        if (!fs.existsSync(TRAFFIC_LOG_PATH)) return null;
        const lines = readLastLines(TRAFFIC_LOG_PATH, 1);
        if (lines.length === 0) return null;
        const last = JSON.parse(lines[0]);
        return last.hash || null;
    } catch (e) {
        console.error('Traffic Log Hash Load Error', e);
        return null;
    }
}

function loadState() {
    try {
        if (fs.existsSync(DB_PATH)) {
            const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
            if (data.tenants && typeof data.tenants === 'object') {
                Object.entries(data.tenants).forEach(([tenantId, tenantData]) => {
                    const tenantState = getTenantState(tenantId);
                    tenantState.tasks = tenantData.tasks || [];
                    tenantState.messages = tenantData.messages || [];
                });
            } else {
                const tenantState = getTenantState(DEFAULT_TENANT);
                tenantState.tasks = data.tasks || [];
                tenantState.messages = data.messages || [];
            }
        } else {
            getTenantState(DEFAULT_TENANT);
        }
        if (fs.existsSync(SETTINGS_PATH)) {
            settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
        }
    } catch (e) { console.error("Persistence Load Error", e); }
}

function saveState() {
    try {
        const tenantsPayload = {};
        Object.entries(stateByTenant).forEach(([tenantId, tenantState]) => {
            tenantsPayload[tenantId] = {
                tasks: tenantState.tasks,
                messages: tenantState.messages
            };
        });
        fs.writeFileSync(DB_PATH, JSON.stringify({ tenants: tenantsPayload }, null, 2));
    } catch (e) { console.error("DB Save Error", e); }
}

function saveSettings() {
    try {
        fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings));
    } catch (e) { console.error("Settings Save Error", e); }
}

function logEvent(message, tenantId) {
    const prefix = tenantId ? `[tenant:${tenantId}] ` : '';
    const line = `[${new Date().toISOString()}] ${prefix}${message}\n`;
    try {
        fs.appendFileSync(SERVER_LOG_PATH, line);
    } catch (e) {
        console.error('Log Write Error', e);
    }
}

function rotateTrafficLogIfNeeded() {
    try {
        if (!fs.existsSync(TRAFFIC_LOG_PATH)) return;
        const stats = fs.statSync(TRAFFIC_LOG_PATH);
        if (stats.size < TRAFFIC_LOG_MAX_BYTES) return;
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const rotated = `${TRAFFIC_LOG_PATH}.${stamp}`;
        fs.renameSync(TRAFFIC_LOG_PATH, rotated);
        lastTrafficHash = null;

        const files = fs.readdirSync(DATA_DIR)
            .filter(name => name.startsWith('traffic.log.'))
            .sort();
        if (files.length > TRAFFIC_LOG_MAX_FILES) {
            const toRemove = files.slice(0, files.length - TRAFFIC_LOG_MAX_FILES);
            toRemove.forEach(name => {
                try {
                    fs.unlinkSync(path.join(DATA_DIR, name));
                } catch (e) {
                    console.error('Traffic Log Cleanup Error', e);
                }
            });
        }
    } catch (e) {
        console.error('Traffic Log Rotate Error', e);
    }
}

function appendTrafficLog(entry) {
    try {
        rotateTrafficLogIfNeeded();
        const payload = JSON.stringify(entry);
        const prevHash = lastTrafficHash || '';
        const hash = crypto.createHash('sha256').update(prevHash + payload).digest('hex');
        const line = JSON.stringify({ ...entry, prev_hash: prevHash || null, hash }) + '\n';
        fs.appendFileSync(TRAFFIC_LOG_PATH, line);
        lastTrafficHash = hash;
    } catch (e) {
        console.error('Traffic Log Write Error', e);
    }
}

function emitTraffic(io, tenantId, eventType, data) {
    const tenantState = getTenantState(tenantId);
    const entry = {
        ts: new Date().toISOString(),
        tenant_id: tenantId,
        type: eventType,
        data: data || {}
    };
    appendTrafficLog(entry);
    const wardens = Object.values(tenantState.agents).filter(a => a.role === 'warden');
    wardens.forEach(warden => {
        io.to(warden.sid).emit('traffic', { type: eventType, ...data, ts: entry.ts, tenant_id: tenantId });
    });
}

function readLastLines(filePath, limit) {
    try {
        if (!fs.existsSync(filePath)) return [];
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split(/\r?\n/).filter(Boolean);
        return lines.slice(-limit);
    } catch (e) {
        console.error("Log Read Error", e);
        return [];
    }
}

function getTenantRoom(tenantId) {
    return `tenant:${tenantId}`;
}

function getRoomKey(tenantId, room) {
    return `${getTenantRoom(tenantId)}:${room}`;
}

function parseAuthToken(token) {
    if (!token) return { tenantId: DEFAULT_TENANT, secret: '' };
    const parts = token.split(':');
    if (parts.length >= 2) {
        return { tenantId: parts[0], secret: parts.slice(1).join(':') };
    }
    return { tenantId: DEFAULT_TENANT, secret: token };
}

function resolveSocketAuth(auth) {
    const token = auth && auth.token ? auth.token : '';
    const parsed = parseAuthToken(token);

    // Check if this is an access code token
    if (DASHBOARD_ACCESS_CODE && token === `access-code:${DASHBOARD_ACCESS_CODE}`) {
        const requestedTenant = auth && auth.tenant_id ? auth.tenant_id : null;
        const tenantId = requestedTenant || DEFAULT_TENANT;
        return { tenantId, token, isAccessCode: true };
    }

    // Normal token auth
    const requestedTenant = auth && auth.tenant_id ? auth.tenant_id : null;
    if (requestedTenant && parsed.tenantId !== DEFAULT_TENANT && requestedTenant !== parsed.tenantId) {
        throw new Error('Tenant mismatch');
    }
    if (requestedTenant && parsed.tenantId === DEFAULT_TENANT && requestedTenant !== DEFAULT_TENANT) {
        throw new Error('Tenant token required');
    }
    const tenantId = requestedTenant || parsed.tenantId || DEFAULT_TENANT;
    const expected = getTenantSecret(tenantId);
    if (parsed.secret !== expected) throw new Error('Unauthorized');
    return { tenantId, token, isAccessCode: false };
}

function resolveHttpAuth(req, allowAccessCode = false) {
    // 1. Check access code first (strict - only one way in)
    if (DASHBOARD_ACCESS_CODE) {
        const accessCodeHeader = req.headers['x-access-code'] || '';
        const accessCodeQuery = req.query.access_code || '';
        const providedCode = accessCodeHeader || accessCodeQuery;

        // If access code is required, ONLY allow access code
        if (allowAccessCode && providedCode === DASHBOARD_ACCESS_CODE) {
            const requestedTenant = req.headers['x-tenant-id'] || req.query.tenant || null;
            return { tenantId: requestedTenant || DEFAULT_TENANT, token: `access-code:${DASHBOARD_ACCESS_CODE}`, isAccessCode: true };
        }

        // If access code is set but not provided or wrong, block
        return null;
    }

    // 2. No access code required - allow Bearer token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.substring(7);
    const parsed = parseAuthToken(token);
    const requestedTenant = req.headers['x-tenant-id'] || req.query.tenant || null;
    if (requestedTenant && parsed.tenantId !== DEFAULT_TENANT && requestedTenant !== parsed.tenantId) return null;
    if (requestedTenant && parsed.tenantId === DEFAULT_TENANT && requestedTenant !== DEFAULT_TENANT) return null;
    const tenantId = requestedTenant || parsed.tenantId || DEFAULT_TENANT;
    const expected = getTenantSecret(tenantId);
    if (parsed.secret !== expected) return null;
    return { tenantId, token, isAccessCode: false };
}

function isAllowlistedCommand(cmd) {
    if (COMMAND_ALLOWLIST.length === 0) return true;
    return COMMAND_ALLOWLIST.some(item => cmd.startsWith(item));
}

function findListMatch(cmd, list) {
    return list.find(item => cmd.includes(item));
}

function evaluateCommand(cmd) {
    const denyMatch = findListMatch(cmd, COMMAND_DENYLIST);
    if (denyMatch) {
        return { allowed: false, reason: `Command blocked by denylist: ${denyMatch}`, requiresApproval: false };
    }
    if (!isAllowlistedCommand(cmd)) {
        return { allowed: false, reason: 'Command not in allowlist', requiresApproval: false };
    }
    const riskyMatch = findListMatch(cmd, COMMAND_RISKYLIST);
    if (riskyMatch) {
        return { allowed: true, reason: `Command requires approval: ${riskyMatch}`, requiresApproval: true };
    }
    return { allowed: true, reason: '', requiresApproval: false };
}

function createTask(agentId, cmd, traceId, requestedBy, status) {
    const now = new Date().toISOString();
    return {
        id: uuidv4(),
        agent_id: agentId,
        cmd: cmd,
        status: status || 'PENDING',
        ts: now,
        trace_id: traceId,
        requested_by: requestedBy,
        result: '',
        attempts: 0,
        delivery_status: 'PENDING',
        approval_required: false,
        approved_at: null,
        approved_by: null,
        ack_at: null,
        dispatched_at: null,
        completed_at: null,
        latency_ms: null
    };
}

function queueDispatch(tenantState, agentId, taskId) {
    if (!tenantState.pendingDispatches[agentId]) tenantState.pendingDispatches[agentId] = [];
    tenantState.pendingDispatches[agentId].push(taskId);
}

function clearAckTimer(taskId) {
    if (pendingAckTimers.has(taskId)) {
        clearTimeout(pendingAckTimers.get(taskId));
        pendingAckTimers.delete(taskId);
    }
}

function scheduleAck(io, tenantId, taskId, agentId) {
    clearAckTimer(taskId);
    const timer = setTimeout(() => {
        const tenantState = getTenantState(tenantId);
        const task = tenantState.tasks.find(t => t.id === taskId);
        if (!task) return;
        if (task.delivery_status === 'ACKED' || task.status === 'SUCCESS' || task.status === 'FAIL' || task.status === 'FAILED') return;
        if (task.attempts < ACK_MAX_RETRIES) {
            const target = tenantState.agents[agentId];
            if (target && target.status === 'online') {
                sendCommandToAgent(io, tenantId, task, target, 'retry');
                return;
            }
            task.status = 'QUEUED';
            task.delivery_status = 'QUEUED';
            queueDispatch(tenantState, agentId, task.id);
            saveState();
            io.to(getTenantRoom(tenantId)).emit('task_update', tenantState.tasks.slice(-20));
            emitTraffic(io, tenantId, 'delivery_queued', { task_id: task.id, agent_id: agentId, trace_id: task.trace_id });
            return;
        }

        task.status = 'DELIVERY_FAILED';
        task.delivery_status = 'FAILED';
        saveState();
        io.to(getTenantRoom(tenantId)).emit('task_update', tenantState.tasks.slice(-20));
        emitTraffic(io, tenantId, 'delivery_failed', { task_id: task.id, agent_id: agentId, trace_id: task.trace_id });
        logEvent(`Delivery failed: task=${task.id} agent=${agentId}`, tenantId);
    }, ACK_TIMEOUT_MS);
    pendingAckTimers.set(taskId, timer);
}

function sendCommandToAgent(io, tenantId, task, target, reason) {
    task.attempts = (task.attempts || 0) + 1;
    task.dispatched_at = task.dispatched_at || new Date().toISOString();
    task.delivery_status = 'SENT';
    task.status = 'SENT';
    io.to(target.sid).emit('command', { id: task.id, cmd: task.cmd, trace_id: task.trace_id });
    scheduleAck(io, tenantId, task.id, target.id);
    emitTraffic(io, tenantId, 'dispatch', { task_id: task.id, agent_id: target.id, trace_id: task.trace_id, reason: reason || 'dispatch' });
}

function flushPendingDispatches(io, tenantId, agentId) {
    const tenantState = getTenantState(tenantId);
    const queued = tenantState.pendingDispatches[agentId] || [];
    if (queued.length === 0) return;
    const target = tenantState.agents[agentId];
    if (!target || target.status !== 'online') return;
    tenantState.pendingDispatches[agentId] = [];
    queued.forEach(taskId => {
        const task = tenantState.tasks.find(t => t.id === taskId);
        if (task) sendCommandToAgent(io, tenantId, task, target, 'flush');
    });
    saveState();
}

loadTenantSecrets();
loadState();
lastTrafficHash = loadLastTrafficHash();

fastify.register(require('@fastify/static'), { root: path.join(__dirname, 'public'), prefix: '/public/' });
fastify.register(require('@fastify/view'), { engine: { ejs: require('ejs') }, root: path.join(__dirname, 'views') });
fastify.register(require('@fastify/formbody'));

// Dashboard Route - Protected
fastify.get('/dashboard', async (req, reply) => {
    const auth = resolveHttpAuth(req, true);

    // If no valid auth, return 401 (dashboard will show login form if accessCodeRequired)
    if (!auth) {
        reply.header('WWW-Authenticate', 'Bearer realm="ClawNet Dashboard"');
        return reply.code(401).send({ error: 'Unauthorized' });
    }

    const tenantState = getTenantState(auth.tenantId);
    return reply.view('dashboard.ejs', {
        agents: Object.values(tenantState.agents),
        tasks: tenantState.tasks.slice(-20),
        messages: tenantState.messages.slice(-50),
        secret: auth.token,
        isAccessCode: auth.isAccessCode || false,
        accessCodeRequired: !!DASHBOARD_ACCESS_CODE,
        settings: settings
    });
});

fastify.post('/api/settings', async (req, reply) => {
    const { supabase_url, supabase_key } = req.body;
    settings = { supabase_url, supabase_key };
    saveSettings();
    return reply.redirect('/dashboard');
});

fastify.get('/api/docs', async (req, reply) => {
    const docsPath = path.join(__dirname, 'openapi.yaml');
    if (!fs.existsSync(docsPath)) {
        return reply.code(404).send({ error: 'OpenAPI spec not found' });
    }
    reply.type('text/yaml').send(fs.readFileSync(docsPath, 'utf8'));
});

fastify.get('/api/logs/server', async (req, reply) => {
    const limit = Math.min(parseInt(req.query.limit || '200', 10), 1000);
    return reply.send({ lines: readLastLines(SERVER_LOG_PATH, limit) });
});

fastify.get('/api/logs/tasks', async (req, reply) => {
    const auth = resolveHttpAuth(req);
    if (!auth) return reply.code(401).send({ error: 'Unauthorized' });
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const tenantState = getTenantState(auth.tenantId);
    return reply.send({ tasks: tenantState.tasks.slice(-limit) });
});

fastify.get('/api/metrics', async (req, reply) => {
    const auth = resolveHttpAuth(req);
    if (!auth) return reply.code(401).send({ error: 'Unauthorized' });
    const tenantState = getTenantState(auth.tenantId);
    const tasks = tenantState.tasks;
    const total = tasks.length;
    const success = tasks.filter(t => t.status === 'SUCCESS').length;
    const fail = tasks.filter(t => t.status === 'FAIL' || t.status === 'FAILED').length;
    const deliveryFailed = tasks.filter(t => t.status === 'DELIVERY_FAILED').length;
    const pending = tasks.filter(t => t.status === 'PENDING' || t.status === 'QUEUED' || t.status === 'SENT').length;
    const latencies = tasks.map(t => t.latency_ms).filter(v => typeof v === 'number');
    const avgLatency = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
    return reply.send({
        tenant_id: auth.tenantId,
        agents_online: Object.values(tenantState.agents).filter(a => a.status === 'online').length,
        tasks_total: total,
        tasks_success: success,
        tasks_fail: fail,
        tasks_delivery_failed: deliveryFailed,
        tasks_pending: pending,
        avg_latency_ms: avgLatency
    });
});

fastify.get('/api/traffic', async (req, reply) => {
    const auth = resolveHttpAuth(req);
    if (!auth) return reply.code(401).send({ error: 'Unauthorized' });
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 1000);
    const lines = readLastLines(TRAFFIC_LOG_PATH, limit);
    const entries = lines
        .map(line => {
            try {
                return JSON.parse(line);
            } catch (e) {
                return null;
            }
        })
        .filter(entry => entry && entry.tenant_id === auth.tenantId);
    return reply.send({ entries });
});

fastify.get('/', async () => ({ status: 'ClawNet v3.3 War Room', online: true }));

const start = async () => {
    try {
        await fastify.listen({ port: PORT, host: '0.0.0.0' });
        // ALLOW POLLING FOR ROBUSTNESS
        const io = new socketio.Server(fastify.server, { 
            cors: { origin: "*" },
            transports: ['websocket', 'polling'] 
        });

        io.use((socket, next) => {
            try {
                const auth = resolveSocketAuth(socket.handshake.auth || {});
                socket.data.tenantId = auth.tenantId;
                socket.data.role = socket.handshake.auth.role || 'worker';
                socket.data.agentId = socket.handshake.auth.agent_id;
                return next();
            } catch (e) {
                return next(new Error('Unauthorized'));
            }
        });

        io.on('connection', (socket) => {
            const { specs } = socket.handshake.auth;
            const agent_id = socket.data.agentId;
            const role = socket.data.role;
            const tenantId = socket.data.tenantId || DEFAULT_TENANT;
            const sid = socket.id;
            const tenantState = getTenantState(tenantId);
            const tenantRoom = getTenantRoom(tenantId);
            socket.join(tenantRoom);

            if (agent_id) {
                tenantState.agents[agent_id] = {
                    id: agent_id,
                    role: role || 'worker',
                    status: 'online',
                    specs: specs || {},
                    sessions: [],
                    last_seen: new Date().toISOString(),
                    sid: sid
                };
                console.log(`[+] Agent ${agent_id} joined as ${role} (${socket.conn.transport.name})`);
                logEvent(`Agent connected: ${agent_id} role=${role || 'worker'} sid=${sid}`, tenantId);
                io.to(tenantRoom).emit('fleet_update', Object.values(tenantState.agents));
                emitTraffic(io, tenantId, 'connect', { agent_id, role: role || 'worker' });
                flushPendingDispatches(io, tenantId, agent_id);
            }

            socket.on('report', (data) => {
                if (!data || typeof data !== 'object') return;
                if (tenantState.agents[agent_id]) {
                    tenantState.agents[agent_id].last_seen = new Date().toISOString();
                    tenantState.agents[agent_id].specs = data.specs || tenantState.agents[agent_id].specs;
                    tenantState.agents[agent_id].cron = data.cron || [];
                    tenantState.agents[agent_id].sessions = data.sessions || [];
                    io.to(tenantRoom).emit('fleet_update', Object.values(tenantState.agents));
                }
            });

            socket.on('dispatch', (payload) => {
                if (!payload || !payload.to || !payload.cmd) return;
                if (role !== 'master') {
                    logEvent(`Dispatch blocked: ${agent_id} is not master`, tenantId);
                    return;
                }

                const cmd = String(payload.cmd).trim();
                if (!cmd) return;
                const evaluation = evaluateCommand(cmd);
                const traceId = payload.trace_id || uuidv4();
                const idempotencyKey = payload.idempotency_key || null;

                if (idempotencyKey) {
                    const existing = tenantState.tasks.find(t => t.idempotency_key === idempotencyKey);
                    if (existing) {
                        io.to(tenantRoom).emit('task_update', tenantState.tasks.slice(-20));
                        return;
                    }
                }

                const targets = payload.to === 'all'
                    ? Object.keys(tenantState.agents).filter(id => id !== agent_id)
                    : [payload.to];

                if (targets.length === 0) {
                    logEvent('Dispatch requested with no available targets', tenantId);
                    return;
                }

                targets.forEach(targetId => {
                    const task = createTask(targetId, cmd, traceId, agent_id, 'PENDING');
                    task.idempotency_key = idempotencyKey;

                    if (!evaluation.allowed) {
                        task.status = 'REJECTED';
                        task.result = evaluation.reason;
                        tenantState.tasks.push(task);
                        logEvent(`Dispatch rejected: task=${task.id} cmd=${cmd} reason=${evaluation.reason}`, tenantId);
                        emitTraffic(io, tenantId, 'dispatch_rejected', { task_id: task.id, agent_id: targetId, trace_id: traceId, reason: evaluation.reason });
                        return;
                    }

                    if (evaluation.requiresApproval && payload.approved !== true) {
                        task.status = 'AWAITING_APPROVAL';
                        task.result = evaluation.reason;
                        task.approval_required = true;
                        tenantState.pendingApprovals[task.id] = targetId;
                        tenantState.tasks.push(task);
                        logEvent(`Dispatch awaiting approval: task=${task.id} cmd=${cmd}`, tenantId);
                        emitTraffic(io, tenantId, 'approval_required', { task_id: task.id, agent_id: targetId, trace_id: traceId });
                        return;
                    }

                    if (evaluation.requiresApproval && payload.approved === true) {
                        task.approval_required = true;
                        task.approved_at = new Date().toISOString();
                        task.approved_by = agent_id;
                    }

                    tenantState.tasks.push(task);
                    const target = tenantState.agents[targetId];
                    if (!target || target.status !== 'online') {
                        task.status = 'QUEUED';
                        task.delivery_status = 'QUEUED';
                        queueDispatch(tenantState, targetId, task.id);
                        emitTraffic(io, tenantId, 'delivery_queued', { task_id: task.id, agent_id: targetId, trace_id: traceId });
                        logEvent(`Dispatch queued: task=${task.id} to=${targetId} cmd=${cmd}`, tenantId);
                        return;
                    }

                    sendCommandToAgent(io, tenantId, task, target, 'dispatch');
                    logEvent(`Dispatch: task=${task.id} to=${targetId} cmd=${cmd}`, tenantId);
                });

                saveState();
                io.to(tenantRoom).emit('task_update', tenantState.tasks.slice(-20));
            });

            socket.on('approve_task', (payload) => {
                if (!payload || !payload.id) return;
                if (role !== 'master') return;
                const task = tenantState.tasks.find(t => t.id === payload.id);
                if (!task || task.status !== 'AWAITING_APPROVAL') return;
                const targetId = tenantState.pendingApprovals[task.id] || task.agent_id;
                delete tenantState.pendingApprovals[task.id];
                task.approved_at = new Date().toISOString();
                task.approved_by = agent_id;
                task.status = 'PENDING';

                const target = tenantState.agents[targetId];
                if (!target || target.status !== 'online') {
                    task.status = 'QUEUED';
                    task.delivery_status = 'QUEUED';
                    queueDispatch(tenantState, targetId, task.id);
                    emitTraffic(io, tenantId, 'delivery_queued', { task_id: task.id, agent_id: targetId, trace_id: task.trace_id });
                    saveState();
                    io.to(tenantRoom).emit('task_update', tenantState.tasks.slice(-20));
                    return;
                }

                sendCommandToAgent(io, tenantId, task, target, 'approved');
                saveState();
                io.to(tenantRoom).emit('task_update', tenantState.tasks.slice(-20));
                emitTraffic(io, tenantId, 'dispatch_approved', { task_id: task.id, agent_id: targetId, trace_id: task.trace_id });
            });

            socket.on('command_ack', (payload) => {
                if (!payload || !payload.id) return;
                const task = tenantState.tasks.find(t => t.id === payload.id);
                if (!task || task.agent_id !== agent_id) return;
                if (!task.ack_at) {
                    task.ack_at = new Date().toISOString();
                    task.delivery_status = 'ACKED';
                }
                clearAckTimer(task.id);
                saveState();
                io.to(tenantRoom).emit('task_update', tenantState.tasks.slice(-20));
                emitTraffic(io, tenantId, 'command_ack', { task_id: task.id, agent_id: agent_id, trace_id: task.trace_id });
            });

            socket.on('task_result', (payload) => {
                if (!payload || !payload.id) return;
                const task = tenantState.tasks.find(t => t.id === payload.id);
                if (task && task.agent_id !== agent_id) return;
                if (task && !task.completed_at) {
                    task.status = (payload.status || 'UNKNOWN').toUpperCase();
                    task.result = payload.output || '';
                    if (payload.agent_id) task.agent_id = payload.agent_id;
                    task.completed_at = new Date().toISOString();
                    if (task.dispatched_at) {
                        task.latency_ms = new Date(task.completed_at).getTime() - new Date(task.dispatched_at).getTime();
                    }
                    if (!task.ack_at) {
                        task.ack_at = new Date().toISOString();
                        task.delivery_status = 'ACKED';
                    }
                    clearAckTimer(task.id);
                    saveState();
                    io.to(tenantRoom).emit('task_update', tenantState.tasks.slice(-20));
                    io.to(tenantRoom).emit('intel_update', { type: 'task', task });
                    logEvent(`Task result: ${task.id} status=${task.status} agent=${task.agent_id}`, tenantId);
                    emitTraffic(io, tenantId, 'task', { task_id: task.id, status: task.status, agent_id: task.agent_id, trace_id: task.trace_id });
                }
            });

            socket.on('typing', (payload) => {
                if (!payload || typeof payload !== 'object') return;
                const to = payload.to || 'all';
                const msg = {
                    from: agent_id || 'master-ui',
                    to: to,
                    isTyping: payload.isTyping === true,
                    ts: new Date().toISOString()
                };

                if (to === 'all') {
                    io.to(tenantRoom).emit('typing_update', msg);
                } else if (to.startsWith('#')) {
                    const roomKey = getRoomKey(tenantId, to);
                    io.to(roomKey).emit('typing_update', msg);
                } else {
                    const target = tenantState.agents[to];
                    if (target) io.to(target.sid).emit('typing_update', msg);
                    socket.emit('typing_update', msg);
                }
            });

            // Room Management Handlers
            socket.on('join_room', (payload) => {
                if (!payload || !payload.room) return;
                const room = payload.room;
                // Validate room name format (must start with #)
                if (!room.startsWith('#')) {
                    logEvent(`Invalid room name: ${room} (must start with #)`, tenantId);
                    return;
                }
                const roomKey = getRoomKey(tenantId, room);
                socket.join(roomKey);
                logEvent(`Agent ${agent_id} joined room ${room}`, tenantId);
                io.to(roomKey).emit('room_update', { room, action: 'join', agent_id, ts: new Date().toISOString() });
                emitTraffic(io, tenantId, 'room_join', { agent_id, room, trace_id: payload.trace_id || null });
            });

            socket.on('leave_room', (payload) => {
                if (!payload || !payload.room) return;
                const room = payload.room;
                // Validate room name format (must start with #)
                if (!room.startsWith('#')) {
                    logEvent(`Invalid room name: ${room} (must start with #)`, tenantId);
                    return;
                }
                const roomKey = getRoomKey(tenantId, room);
                socket.leave(roomKey);
                logEvent(`Agent ${agent_id} left room ${room}`, tenantId);
                io.to(roomKey).emit('room_update', { room, action: 'leave', agent_id, ts: new Date().toISOString() });
                emitTraffic(io, tenantId, 'room_leave', { agent_id, room, trace_id: payload.trace_id || null });
            });

            // Unified Chat/Message Handler
            socket.on('chat', (payload) => {
                // Support both 'msg' (old) and 'to/msg' (new) formats
                // Fallback to 'all' if 'to' is missing (Global Chat)
                const to = payload.to || 'all';
                const messageText = payload.msg || payload.message;
                
                if (!messageText) return;

                const msg = {
                    from: agent_id || 'master-ui',
                    to: to,
                    msg: messageText,
                    ts: new Date().toISOString(),
                    trace_id: payload.trace_id || null
                };

                tenantState.messages.push(msg);
                if (tenantState.messages.length > 100) tenantState.messages.shift();
                saveState();

                // Emit to relevant parties
                if (to === 'all') {
                     io.to(tenantRoom).emit('chat_update', msg);
                     io.to(tenantRoom).emit('intel_update', { type: 'chat', message: msg });
                } else if (to.startsWith('#')) {
                    // Room Multicast
                    const roomKey = getRoomKey(tenantId, to);
                    io.to(roomKey).emit('chat_update', msg);
                    io.to(tenantRoom).emit('intel_update', { type: 'chat', message: msg });
                    logEvent(`Room Chat: ${msg.from} -> ${msg.to}: ${msg.msg}`, tenantId);
                } else {
                    // Direct Message
                    const target = tenantState.agents[to];
                    if (target) io.to(target.sid).emit('chat_update', msg);
                    // Also send back to sender (if not me)
                    socket.emit('chat_update', msg);
                    // And to master UI
                     io.to(tenantRoom).emit('intel_update', { type: 'chat', message: msg });
                }

                logEvent(`Chat: ${msg.from} -> ${msg.to}: ${msg.msg}`, tenantId);
                emitTraffic(io, tenantId, 'chat', { from: msg.from, to: msg.to, msg: msg.msg, trace_id: msg.trace_id });
            });
            
            // Legacy/Sidecar support alias
            socket.on('message', (payload) => {
                if (socket.listeners('chat').length > 0) {
                     // trigger the chat listener
                     const chatHandler = socket.listeners('chat')[0];
                     chatHandler(payload);
                }
            });

            socket.on('reassign_role', (payload) => {
                if (!payload || !payload.agent_id || !payload.role) return;
                if (role !== 'master') return;
                if (tenantState.agents[payload.agent_id]) {
                    tenantState.agents[payload.agent_id].role = payload.role;
                    io.to(tenantRoom).emit('fleet_update', Object.values(tenantState.agents));
                    logEvent(`Role change: ${payload.agent_id} -> ${payload.role}`, tenantId);
                }
            });

            socket.on('disconnect', () => {
                if (agent_id && tenantState.agents[agent_id]) {
                    tenantState.agents[agent_id].status = 'offline';
                    io.to(tenantRoom).emit('fleet_update', Object.values(tenantState.agents));
                    logEvent(`Agent disconnected: ${agent_id}`, tenantId);
                    emitTraffic(io, tenantId, 'disconnect', { agent_id: agent_id, trace_id: null });
                }
            });
        });

    } catch (err) { process.exit(1); }
};

start();
