const io = require('socket.io-client');
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');

const DEFAULT_SERVER = 'wss://clownet-c2c.fly.dev';
const DEFAULT_TOKEN = 'very-secret-key-123';
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || 'openclaw';

function parseList(value) {
    return (value || '')
        .split(',')
        .map(item => item.trim())
        .filter(item => item.length > 0);
}

const EXEC_ALLOWLIST = parseList(process.env.CLAWNET_EXEC_ALLOWLIST || '');
const EXEC_DENYLIST = parseList(process.env.CLAWNET_EXEC_DENYLIST || '');
const EXEC_TIMEOUT_SECONDS = parseInt(process.env.CLAWNET_EXEC_TIMEOUT || '30', 10);

const args = {
    url: process.env.CLAWNET_SERVER || DEFAULT_SERVER,
    token: process.env.CLAWNET_SECRET_KEY || DEFAULT_TOKEN,
    id: process.env.AGENT_ID || `node-${require('crypto').randomBytes(2).toString('hex')}`,
    role: process.env.AGENT_ROLE || 'worker',
    tenant: process.env.CLAWNET_TENANT_ID || ''
};

const sio = io(args.url, {
    reconnection: true,
    reconnectionAttempts: 0,
    reconnectionDelay: 5000,
    transports: ['websocket', 'polling']
});

const handledCommands = [];
const HANDLED_COMMAND_LIMIT = 200;

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
        
        const specs = {
            cpu_percent: cpu,
            ram_percent: ram,
            version: VERSION
        };
        sio.emit('report', { agent_id: args.id, role: args.role, specs });
    } catch (e) {
        console.error('[!] Specs report failed:', e.message);
    }
}

function startHeartbeat() {
    setInterval(() => {
        reportStatus();
    }, 5000); 
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
    sio.emit('message', { to: replyTo, msg });
    if (taskId) {
        sio.emit('task_result', { id: taskId, status: 'SUCCESS', output: msg });
    }
}

function sendError(msg, replyTo, taskId) {
    console.error(msg);
    sio.emit('message', { to: replyTo, msg });
    if (taskId) {
        sio.emit('task_result', { id: taskId, status: 'FAIL', output: msg });
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
        } else if (msg === '/restart') {
            sendReply('Restarting client...', replyTo, taskId);
            setTimeout(() => {
                process.exit(0);
            }, 1000);
        } else if (msg.startsWith('/join ')) {
            const parts = msg.split(' ', 2);
            if (parts.length < 2) {
                sendReply('Usage: /join #room', replyTo, taskId);
                return;
            }
            sio.emit('join_room', { room: parts[1].trim() });
            sendReply(`Joining ${parts[1]}...`, replyTo, taskId);
        } else {
            const child = spawn(OPENCLAW_BIN, [
                'agent',
                '--session-id', 'clownet-sidecar',
                '--message', msg,
                '--local',
                '--json'
            ]);

            let stdout = '';
            child.stdout.on('data', (data) => { stdout += data.toString(); });
            child.stderr.on('data', (data) => { /* Ignore stderr logs */ });

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
                sendReply(response, replyTo, taskId);
            });
        }
    } catch (e) {
        sendError(`Sidecar Error: ${e.message}`, replyTo, taskId);
    }
}

function registerHandlers() {
    sio.on('connect', () => {
        console.log(`[*] Connected to HQ as ${args.id}`);
        reportStatus();
        startHeartbeat(); 
    });

    sio.on('disconnect', () => {
        console.log('[!] Disconnected from HQ');
    });

    sio.on('direct_message', (data) => {
        const sender = data.from || 'unknown';
        const msg = data.msg || '';
        console.log(`[DM] From ${sender}: ${msg}`);
        if (sender === 'master-ui') {
            processInstruction(msg, sender);
        }
    });

    sio.on('command', (data) => {
        const cmdId = data.id;
        if (cmdId) {
            if (!rememberCommand(cmdId)) return;
            sio.emit('command_ack', { id: cmdId });
        }
        processInstruction(data.cmd, 'master-ui', cmdId);
    });
}

function main() {
    console.log(`[*] ClawNet Sidecar v3.9 (Node+Metrics) launching for ${args.id}...`);
    registerHandlers();
    const authPayload = { token: args.token, agent_id: args.id, role: args.role };
    if (args.tenant) authPayload.tenant_id = args.tenant;
    sio.connect(args.url, { auth: authPayload });
}

if (require.main === module) {
    main();
}
