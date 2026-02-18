const io = require('socket.io-client');
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_SERVER = 'wss://clownet-c2c.fly.dev';
const DEFAULT_TOKEN = 'jarancokasu';
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || 'openclaw';

const { buildSocketOptions } = require('./src/client/socket-options');
const { createReconnectState } = require('./src/client/reconnect-state');
const { createLatencySampler } = require('./src/client/latency-sampler');
const { computeBackoffDelayMs } = require('./src/client/backoff');
const { createOfflineOutbox } = require('./src/client/offline-outbox');
const { getDiskAvailableKb } = require('./src/client/disk-usage');
const { createHealthServer } = require('./src/client/health-server');
const { createShutdownConfirm } = require('./src/client/shutdown-confirm');
const { createShellManager } = require('./src/client/shell-manager');
const { wrapEmitter } = require('./src/client/safe-emitter');

function parseList(value) {
    return (value || '')
        .split(',')
        .map(item => item.trim())
        .filter(item => item.length > 0);
}

const EXEC_ALLOWLIST = parseList(process.env.CLAWNET_EXEC_ALLOWLIST || '');
const EXEC_DENYLIST = parseList(process.env.CLAWNET_EXEC_DENYLIST || '');
const EXEC_TIMEOUT_SECONDS = parseInt(process.env.CLAWNET_EXEC_TIMEOUT || '30', 10);

const ADMIN_IDS = parseList(process.env.CLAWNET_ADMIN_IDS || 'master-ui');

const args = {
    url: process.env.CLAWNET_SERVER || DEFAULT_SERVER,
    token: process.env.CLAWNET_SECRET_KEY || DEFAULT_TOKEN,
    id: process.env.AGENT_ID || `node-${require('crypto').randomBytes(2).toString('hex')}`,
    role: process.env.AGENT_ROLE || 'worker',
    tenant: process.env.CLAWNET_TENANT_ID || ''
};

const authPayload = { token: args.token, agent_id: args.id, role: args.role };
if (args.tenant) authPayload.tenant_id = args.tenant;

const socketOptions = buildSocketOptions({ authPayload });
const sio = io(args.url, socketOptions);

const reconnectState = createReconnectState();

const outboxPath = process.env.CLAWNET_OFFLINE_OUTBOX_PATH || path.join(os.homedir(), '.clownet', 'outbox.json');
const outbox = createOfflineOutbox({
    filePath: outboxPath,
    maxItems: parseInt(process.env.CLAWNET_OFFLINE_OUTBOX_MAX_ITEMS || '200', 10),
    maxSendAttempts: parseInt(process.env.CLAWNET_OFFLINE_OUTBOX_MAX_SEND_ATTEMPTS || '3', 10),
});

let lastDiskSampleAtMs = 0;
let lastDiskAvailableKb = null;

const healthPortRaw = process.env.CLAWNET_CLIENT_HEALTH_PORT;
const healthPort = healthPortRaw ? parseInt(healthPortRaw, 10) : null;
let healthServer = null;

const shellEnabled = process.env.CLAWNET_SHELL_ENABLED === '1';
const shellPtyEnabled = shellEnabled && process.env.CLAWNET_SHELL_PTY === '1';

let pty = null;
if (shellPtyEnabled) {
    try {
        pty = require('node-pty');
    } catch (e) {
        console.error(`[!] node-pty unavailable, falling back to non-PTY shell: ${e && e.message ? e.message : String(e)}`);
        pty = null;
    }
}

const shellManager = createShellManager({
    pty,
    onOutput: (evt) => {
        if (!sio.connected) return;
        sio.emit('shell_output', {
            session_id: evt.session_id,
            stream: evt.stream,
            encoding: evt.encoding,
            data: evt.data,
        });
    },
    onExit: (evt) => {
        if (!sio.connected) return;
        sio.emit('shell_exit', {
            session_id: evt.session_id,
            exitCode: evt.exitCode === undefined ? null : evt.exitCode,
            signal: evt.signal || null,
            error: evt.error || null,
        });
    },
});

const shutdownConfirm = createShutdownConfirm({
    ttlMs: parseInt(process.env.CLAWNET_SHUTDOWN_CONFIRM_TTL_MS || '30000', 10),
});

function isAdminSender(senderId) {
    return ADMIN_IDS.includes(senderId);
}

const latencySampler = createLatencySampler({
    pingFn: async () => {
        if (!sio.connected) {
            throw new Error('Socket not connected');
        }

        return await new Promise((resolve, reject) => {
            sio.timeout(1000).emit('latency_ping', {}, (err, payload) => {
                if (err) return reject(err);
                resolve(payload);
            });
        });
    }
});

let lastLatencySampleAtMs = 0;

function makeLocalId(prefix) {
    return `${prefix}-${crypto.randomBytes(8).toString('hex')}`;
}

const lastHandlerErrorByEvent = new Map();

function reportHandlerError({ event, message }) {
    const key = typeof event === 'string' && event.length > 0 ? event : 'unknown';
    const now = Date.now();
    const last = lastHandlerErrorByEvent.get(key) || 0;
    if (now - last < 5000) return;
    lastHandlerErrorByEvent.set(key, now);

    const text = `CLIENT_HANDLER_ERROR: event=${key} ${message || ''}`.trim();
    console.error(`[!] ${text}`);

    const localId = makeLocalId('client_handler_error');
    queueOrEmit('chat', { to: 'master-ui', msg: text, localId }, `chat:${localId}`);
}

async function emitWithAck(event, payload) {
    if (!sio.connected) throw new Error('Socket disconnected');

    return await new Promise((resolve, reject) => {
        sio.timeout(1500).emit(event, payload, (err, res) => {
            if (err) return reject(err);
            resolve(res);
        });
    });
}

function queueOrEmit(event, payload, key) {
    if (!sio.connected) {
        outbox.enqueue({ event, payload, key });
        return;
    }

    emitWithAck(event, payload)
        .catch(() => {
            outbox.enqueue({ event, payload, key });
        });
}

function flushOutbox() {
    if (!sio.connected) return;
    outbox.flush(async (entry) => {
        const res = await emitWithAck(entry.event, entry.payload);
        return res && res.ok === true ? { ok: true } : { ok: false };
    }).then((result) => {
        if (result && result.sent > 0) {
            console.log(`[*] Flushed offline outbox: sent=${result.sent} remaining=${result.remaining}`);
        }
    }).catch(() => {});
}

const handledCommands = [];
const HANDLED_COMMAND_LIMIT = 200;

// OpenCLAW session for master-ui communication
let masterSessionId = null;

function rememberCommand(commandId) {
    if (!commandId) return true;
    if (handledCommands.includes(commandId)) return false;
    handledCommands.push(commandId);
    if (handledCommands.length > HANDLED_COMMAND_LIMIT) {
        handledCommands.shift();
    }
    return true;
}

function isDeniedExec(cmd) {
    return EXEC_DENYLIST.some(token => cmd.includes(token));
}

function isAllowedExec(cmd) {
    if (EXEC_ALLOWLIST.length === 0) return true;
    return EXEC_ALLOWLIST.some(token => cmd.startsWith(token));
}

// Better CPU Usage Calculation
let lastCpus = os.cpus();
function getCpuUsage() {
    const cpus = os.cpus();
    let user = 0, nice = 0, sys = 0, idle = 0, irq = 0;

    for (let i = 0; i < cpus.length; i++) {
        const cpu = cpus[i];
        const last = lastCpus[i];
        user += cpu.times.user - last.times.user;
        nice += cpu.times.nice - last.times.nice;
        sys += cpu.times.sys - last.times.sys;
        idle += cpu.times.idle - last.times.idle;
        irq += cpu.times.irq - last.times.irq;
    }

    lastCpus = cpus;
    const total = user + nice + sys + idle + irq;
    return total > 0 ? ((total - idle) / total) * 100 : 0;
}

const VERSION = '3.9.1';

function reportStatus() {
    if (!sio.connected) return;
    try {
        const cpu = parseFloat(getCpuUsage().toFixed(1));
        const ram = parseFloat(((1 - os.freemem() / os.totalmem()) * 100).toFixed(1));

        const reconnect = reconnectState.getSnapshot();
        const latencyMs = latencySampler.getLastMs();

        const ifaces = os.networkInterfaces();
        const ifaceNames = Object.keys(ifaces || {});

        const specs = {
            cpu_percent: cpu,
            ram_percent: ram,
            version: VERSION,
            latency_ms: latencyMs,
            disk_available_kb: lastDiskAvailableKb,
            uptime_s: Math.floor(process.uptime()),
            loadavg_1m: Array.isArray(os.loadavg()) ? os.loadavg()[0] : null,
            network: {
                interfaces: ifaceNames.length,
                names: ifaceNames.slice(0, 10),
            },
            reconnect: {
                reconnecting: reconnect.reconnecting,
                current_attempts: reconnect.currentAttempts,
                last_attempts: reconnect.lastAttempts,
                last_downtime_ms: reconnect.lastDowntimeMs,
            }
        };
        sio.emit('report', { agent_id: args.id, role: args.role, specs });

        if (ram >= 80) {
            console.warn(`[!] High memory usage: ${ram}%`);
        }
    } catch (e) {
        console.error('[!] Specs report failed:', e.message);
    }
}

function startHeartbeat() {
    setInterval(() => {
        reportStatus();

        const now = Date.now();
        if (sio.connected && now - lastLatencySampleAtMs >= 30000) {
            lastLatencySampleAtMs = now;
            latencySampler.sample().catch(() => {});
        }

        if (now - lastDiskSampleAtMs >= 60000) {
            lastDiskSampleAtMs = now;
            try {
                lastDiskAvailableKb = getDiskAvailableKb({ mountPath: '/' });
            } catch (_e) {
                lastDiskAvailableKb = null;
            }
        }
    }, 5000);
}

function getHealthSnapshot() {
    const reconnect = reconnectState.getSnapshot();
    return {
        ok: true,
        agent_id: args.id,
        role: args.role,
        version: VERSION,
        connected: sio.connected,
        outbox: { pending: outbox.size(), path: outboxPath },
        latency_ms: latencySampler.getLastMs(),
        disk_available_kb: lastDiskAvailableKb,
        reconnect: {
            reconnecting: reconnect.reconnecting,
            current_attempts: reconnect.currentAttempts,
            last_attempts: reconnect.lastAttempts,
            last_downtime_ms: reconnect.lastDowntimeMs,
        },
    };
}

async function gracefulShutdown(reason) {
    console.log(`[*] Shutting down (${reason})...`);
    try {
        if (healthServer) {
            await healthServer.stop();
        }
    } catch (_e) {}

    try {
        if (sio.connected) {
            await outbox.flush(async (entry) => {
                const res = await emitWithAck(entry.event, entry.payload);
                return res && res.ok === true ? { ok: true } : { ok: false };
            });
        }
    } catch (_e) {}

    try {
        sio.disconnect();
    } catch (_e) {}

    setTimeout(() => process.exit(0), 250);
}

function handleExecCommand(shellCmd, replyTo, taskId) {
    let response = '';
    if (isDeniedExec(shellCmd)) {
        response = `ERROR: Command blocked by denylist`;
        console.log(`[!] ${response}: ${shellCmd}`);
    } else if (!isAllowedExec(shellCmd)) {
        response = `ERROR: Command not in allowlist`;
        console.log(`[!] ${response}: ${shellCmd}`);
    } else {
        const child = spawn('sh', ['-c', shellCmd], {
            timeout: EXEC_TIMEOUT_SECONDS * 1000
        });

        let stdout = '';
        child.stdout.on('data', (data) => { stdout += data.toString(); });

        let stderr = '';
        child.stderr.on('data', (data) => { stderr += data.toString(); });

        child.on('close', (code) => {
            if (code === 0) {
                response = `EXEC_RESULT:\n\`\`\`\n${stdout}\n\`\`\``;
            } else {
                response = `EXEC_ERROR (Code ${code}): ${stderr || 'Unknown error'}`;
            }
            sendReply(response, replyTo, taskId);
        });

        child.on('error', (err) => {
            response = `EXEC_ERROR: ${err.message}`;
            sendReply(response, replyTo, taskId);
        });
    }
}

function sendReply(msg, replyTo, taskId) {
    const localId = makeLocalId('chat');
    queueOrEmit('chat', { to: replyTo, msg: msg, localId }, `chat:${localId}`);
    if (taskId) {
        queueOrEmit('task_result', { id: taskId, status: 'SUCCESS', output: msg }, `task_result:${taskId}`);
    }
}

function sendError(msg, replyTo, taskId) {
    console.error(msg);
    const localId = makeLocalId('chat');
    queueOrEmit('chat', { to: replyTo, msg: msg, localId }, `chat:${localId}`);
    if (taskId) {
        queueOrEmit('task_result', { id: taskId, status: 'FAIL', output: msg }, `task_result:${taskId}`);
    }
}

function processInstruction(msg, replyTo, taskId = null) {
    try {
        if (msg.startsWith('/exec ')) {
            const shellCmd = msg.replace('/exec ', '').trim();
            handleExecCommand(shellCmd, replyTo, taskId);
        } else if (msg === '/update') {
            sendReply('Initiating self-update...', replyTo, taskId);
            const updater = spawn('sh', [path.join(__dirname, 'scripts', 'update.sh')], {
                detached: true,
                stdio: 'ignore'
            });
            updater.unref();
        } else if (msg === '/ping') {
            sendReply('PONG', replyTo, taskId);
        } else if (msg === '/status') {
            const statusInfo = {
                agent_id: args.id,
                role: args.role,
                version: VERSION,
                uptime: process.uptime(),
                memory: {
                    rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + ' MB',
                    heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB',
                    heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB'
                },
                cpu: getCpuUsage().toFixed(1) + '%',
                platform: os.platform(),
                arch: os.arch(),
                hostname: os.hostname()
            };

            const response = `STATUS REPORT:
Agent ID: ${statusInfo.agent_id}
Role: ${statusInfo.role}
Version: ${statusInfo.version}
Uptime: ${Math.floor(statusInfo.uptime)} seconds
Platform: ${statusInfo.platform} (${statusInfo.arch})
Hostname: ${statusInfo.hostname}

Memory Usage:
  RSS: ${statusInfo.memory.rss}
  Heap Total: ${statusInfo.memory.heapTotal}
  Heap Used: ${statusInfo.memory.heapUsed}

CPU Usage: ${statusInfo.cpu}`;

            sendReply(response, replyTo, taskId);
        } else if (msg === '/restart') {
            sendReply('Restarting client...', replyTo, taskId);
            setTimeout(() => {
                process.exit(0);
            }, 1000);
        } else if (msg === '/shutdown') {
            if (!isAdminSender(replyTo)) {
                sendReply('ERROR: /shutdown requires admin', replyTo, taskId);
                return;
            }
            shutdownConfirm.request(replyTo);
            sendReply('Confirm shutdown by sending: /shutdown confirm', replyTo, taskId);
        } else if (msg === '/shutdown confirm') {
            if (!isAdminSender(replyTo)) {
                sendReply('ERROR: /shutdown requires admin', replyTo, taskId);
                return;
            }
            if (!shutdownConfirm.confirm(replyTo)) {
                sendReply('ERROR: No pending shutdown confirmation (or it expired). Send /shutdown again.', replyTo, taskId);
                return;
            }
            sendReply('Shutting down client...', replyTo, taskId);
            gracefulShutdown('admin');
        } else if (msg === '/queue') {
            const items = outbox.peek(20);
            const lines = [`OFFLINE QUEUE:`, `Pending: ${outbox.size()}`];
            for (let i = 0; i < items.length; i++) {
                const it = items[i];
                lines.push(`${i + 1}) [${it.event}] key=${it.key || '-'} attempts=${it.attempts} at=${it.createdAt}`);
            }
            sendReply(lines.join('\n'), replyTo, taskId);
        } else if (msg.startsWith('/join ')) {
            const parts = msg.split(' ', 2);
            if (parts.length < 2) {
                sendReply('Usage: /join #room', replyTo, taskId);
                return;
            }
            sio.emit('join_room', { room: parts[1].trim() });
            sendReply(`Joining ${parts[1]}...`, replyTo, taskId);
        } else {
            // Create or reuse session for master-ui communication
            if (!masterSessionId) {
                masterSessionId = `clownet-${args.id}-master-ui`;
            }

            let child;
            try {
                child = spawn(OPENCLAW_BIN, [
                    'agent',
                    '--session-id', masterSessionId,
                    '--message', msg,
                    '--local',
                    '--json'
                ]);
            } catch (err) {
                sendError(`Spawn Error: ${err.message}`, replyTo, taskId);
                return;
            }

            let stdout = '';
            child.stdout.on('data', (data) => { stdout += data.toString(); });
            child.stderr.on('data', (data) => { /* Ignore stderr logs */ });

            child.on('error', (err) => {
                sendError(`Brain Exec Error: ${err.message} (Is OPENCLAW_BIN installed?)`, replyTo, taskId);
            });

            child.on('close', (code) => {
                let response = '';
                if (code === 0) {
                    try {
                        const data = JSON.parse(stdout);
                        if (data.payloads && data.payloads.length > 0) {
                            response = data.payloads[0].text || 'No text response.';
                        } else if (data.result) {
                            response = data.result;
                        } else {
                            response = 'Thinking...';
                        }
                    } catch (e) {
                        response = stdout.trim();
                    }
                } else {
                    response = `BRAIN_ERROR (Code ${code})`;
                }
                if (response) sendReply(response, replyTo, taskId);
            });
        }
    } catch (e) {
        sendError(`Sidecar Error: ${e.message}`, replyTo, taskId);
    }
}

function registerHandlers() {
    sio.on('connect', () => {
        console.log(`[*] Connected to HQ as ${args.id}`);
        try {
            lastDiskSampleAtMs = Date.now();
            lastDiskAvailableKb = getDiskAvailableKb({ mountPath: '/' });
        } catch (_e) {
            lastDiskAvailableKb = null;
        }
        emitWithAck('agent_hello', {
            capabilities: {
                offline_outbox: true,
                chat_ack: true,
                task_result_ack: true,
                latency_ping: true,
                shell: shellEnabled,
                pty: shellPtyEnabled && !!pty,
            }
        }).catch(() => {});
        reportStatus();
        startHeartbeat();
        flushOutbox();
    });

    sio.on('disconnect', () => {
        console.log('[!] Disconnected from HQ');
        reconnectState.onDisconnect();
        if (outbox.size() > 0) {
            console.log(`[*] Offline outbox pending: ${outbox.size()}`);
        }
        shellManager.stopAll();
    });

    if (sio.io && typeof sio.io.on === 'function') {
        sio.io.on('reconnect_attempt', (attempt) => {
            reconnectState.onReconnectAttempt(attempt);

            const nextDelayMs = computeBackoffDelayMs({
                attempt,
                baseMs: socketOptions.reconnectionDelay,
                maxMs: socketOptions.reconnectionDelayMax,
                jitterFactor: socketOptions.randomizationFactor,
            });
            console.log(`[${new Date().toISOString()}] [RECONNECT] attempt=${attempt} next_delay_ms=${nextDelayMs}`);
        });
        sio.io.on('reconnect', (attempt) => {
            reconnectState.onReconnectAttempt(attempt);
            reconnectState.onReconnect();
            reportStatus();
            flushOutbox();
        });
    }

    sio.on('chat_update', (data) => {
        const sender = data.from || 'unknown';
        const msg = data.msg || '';
        const to = data.to || 'all';
        console.log(`[CHAT] From ${sender} to ${to}: ${msg}`);
        if ((to === args.id || to === 'all') && sender !== args.id) {
            // Process instructions from any sender (master-ui or other agents)
            processInstruction(msg, sender);
        }
    });

    sio.on('command', (data) => {
        console.log(`[COMMAND] Received command: ${data.cmd} (ID: ${data.id})`);
        const cmdId = data.id;
        if (cmdId) {
            if (!rememberCommand(cmdId)) {
                console.log(`[COMMAND] Duplicate command ID: ${cmdId}, skipping`);
                return;
            }
            sio.emit('command_ack', { id: cmdId });
        }

        // Route command based on content
        if (data.cmd.startsWith('/exec ')) {
            handleExecCommand(data.cmd, 'master-ui', cmdId);
        } else {
            processInstruction(data.cmd, 'master-ui', cmdId);
        }
    });

    sio.on('shell_start', (payload, ack) => {
        if (!shellEnabled) {
            if (typeof ack === 'function') ack({ ok: false, error: 'SHELL_DISABLED' });
            return;
        }

        try {
            shellManager.start({ session_id: payload.session_id, command: payload.command, cols: payload.cols, rows: payload.rows });
            if (typeof ack === 'function') ack({ ok: true });
        } catch (e) {
            if (typeof ack === 'function') ack({ ok: false, error: e.message });
        }
    });

    sio.on('shell_input', (payload) => {
        if (!shellEnabled) return;
        if (!payload || typeof payload !== 'object') return;
        if (payload.encoding === 'base64') {
            const buf = Buffer.from(payload.data || '', 'base64');
            shellManager.input({ session_id: payload.session_id, data: buf.toString('utf8') });
        } else {
            shellManager.input({ session_id: payload.session_id, data: payload.data || '' });
        }
    });

    sio.on('shell_resize', (payload) => {
        if (!shellEnabled) return;
        if (!payload || typeof payload !== 'object') return;
        shellManager.resize({ session_id: payload.session_id, cols: payload.cols, rows: payload.rows });
    });

    sio.on('shell_stop', (payload) => {
        if (!shellEnabled) return;
        if (!payload || typeof payload !== 'object') return;
        shellManager.stop({ session_id: payload.session_id });
    });
}

function main() {
    console.log(`[*] ClawNet Sidecar v3.9 (Node+Metrics) launching for ${args.id}...`);

    if (Number.isFinite(healthPort) && healthPort > 0) {
        healthServer = createHealthServer({
            port: healthPort,
            getSnapshot: getHealthSnapshot,
        });
        healthServer.start().then(() => {
            const addr = healthServer.address();
            const actualPort = addr && typeof addr === 'object' ? addr.port : healthPort;
            console.log(`[*] Health server listening on ${actualPort}`);
        }).catch((e) => {
            console.error(`[!] Health server failed: ${e.message}`);
        });
    }

    process.on('SIGINT', () => {
        gracefulShutdown('SIGINT');
    });
    process.on('SIGTERM', () => {
        gracefulShutdown('SIGTERM');
    });

    wrapEmitter(sio, {
        onError: reportHandlerError,
    });

    process.on('unhandledRejection', (reason) => {
        const msg = reason && reason.message ? reason.message : String(reason || 'Unknown rejection');
        reportHandlerError({ event: 'unhandledRejection', message: msg });
    });

    registerHandlers();
}

if (require.main === module) {
    main();
}
