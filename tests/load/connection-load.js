#!/usr/bin/env node

const fs = require('fs/promises');
const http = require('http');
const path = require('path');
const { spawn, execFile } = require('child_process');
const io = require('socket.io-client');

const SECRET = process.env.CLAWNET_SECRET_KEY || 'very-secret-key-123';

const CONFIG = {
    concurrentConnections: 100,
    throughputTargetMsgsPerSec: 1000,
    throughputMessagesPerClient: 10,
    connectTimeoutMs: 5000,
    ackTimeoutMs: 5000,
    serverStartTimeoutMs: 15000,
    shellAckTimeoutMs: 2500,
    evidencePath: path.join(__dirname, '..', '..', '.sisyphus', 'evidence', 'task-24-load-test.json'),
};

function nowIso() {
    return new Date().toISOString();
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function toErrorMessage(err) {
    return err && err.message ? err.message : String(err);
}

function pickFreePort() {
    return new Promise((resolve, reject) => {
        const server = http.createServer();
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            const port = address && typeof address === 'object' ? address.port : null;
            server.close((closeErr) => {
                if (closeErr) return reject(closeErr);
                if (!port) return reject(new Error('Failed to select free port'));
                resolve(port);
            });
        });
        server.on('error', reject);
    });
}

function getRssBytes(pid) {
    return new Promise((resolve) => {
        execFile('ps', ['-o', 'rss=', '-p', String(pid)], (err, stdout) => {
            if (err) return resolve(null);
            const kb = Number.parseInt(String(stdout).trim(), 10);
            if (!Number.isFinite(kb) || kb < 0) return resolve(null);
            resolve(kb * 1024);
        });
    });
}

function startServer(port) {
    return new Promise((resolve, reject) => {
        const child = spawn('node', ['server.js'], {
            cwd: path.join(__dirname, '..', '..'),
            env: {
                ...process.env,
                PORT: String(port),
                CLAWNET_SECRET_KEY: SECRET,
                CLAWNET_SHELL_ENABLED: '1',
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        const stdout = [];
        const stderr = [];
        let ready = false;

        const onDataOut = (chunk) => {
            const text = chunk.toString();
            stdout.push(text);
            if (!ready && text.includes('listening')) {
                ready = true;
                cleanup();
                resolve({ child, stdout, stderr });
            }
        };

        const onDataErr = (chunk) => {
            stderr.push(chunk.toString());
        };

        const onExit = (code, signal) => {
            if (ready) return;
            cleanup();
            reject(new Error(`Server exited before ready (code=${code}, signal=${signal})`));
        };

        const timer = setTimeout(() => {
            if (ready) return;
            cleanup();
            reject(new Error(`Server startup timeout after ${CONFIG.serverStartTimeoutMs}ms`));
        }, CONFIG.serverStartTimeoutMs);

        function cleanup() {
            clearTimeout(timer);
            child.stdout.off('data', onDataOut);
            child.stderr.off('data', onDataErr);
            child.off('exit', onExit);
        }

        child.stdout.on('data', onDataOut);
        child.stderr.on('data', onDataErr);
        child.on('exit', onExit);
    });
}

async function stopServer(child) {
    if (!child || child.killed) return;
    child.kill('SIGTERM');
    const exited = await Promise.race([
        new Promise((resolve) => child.once('exit', () => resolve(true))),
        delay(1500).then(() => false),
    ]);
    if (!exited) {
        child.kill('SIGKILL');
        await Promise.race([
            new Promise((resolve) => child.once('exit', () => resolve(true))),
            delay(500).then(() => false),
        ]);
    }
}

function connectSocket(baseUrl, agentId, role) {
    return new Promise((resolve, reject) => {
        const socket = io(baseUrl, {
            auth: {
                token: SECRET,
                agent_id: agentId,
                role,
                specs: {},
            },
            transports: ['websocket'],
            timeout: CONFIG.connectTimeoutMs,
        });

        const timer = setTimeout(() => {
            socket.disconnect();
            reject(new Error(`connect timeout for ${agentId}`));
        }, CONFIG.connectTimeoutMs + 1000);

        socket.once('connect', () => {
            clearTimeout(timer);
            socket.__agentId = agentId;
            socket.__role = role;
            resolve(socket);
        });

        socket.once('connect_error', (err) => {
            clearTimeout(timer);
            reject(err || new Error(`connect_error for ${agentId}`));
        });
    });
}

function emitWithAck(socket, eventName, payload, timeoutMs) {
    return new Promise((resolve, reject) => {
        socket.timeout(timeoutMs).emit(eventName, payload, (err, res) => {
            if (err) return reject(err);
            resolve(res);
        });
    });
}

async function runConnectionTest(baseUrl, sockets) {
    const startedAt = Date.now();
    const promises = Array.from({ length: CONFIG.concurrentConnections }, (_v, idx) =>
        connectSocket(baseUrl, `load-worker-${idx}`, 'worker')
    );

    const settled = await Promise.allSettled(promises);
    let success = 0;
    const failures = [];

    for (const result of settled) {
        if (result.status === 'fulfilled') {
            sockets.push(result.value);
            success += 1;
        } else {
            failures.push(toErrorMessage(result.reason));
        }
    }

    return {
        required: CONFIG.concurrentConnections,
        connected: success,
        failed: failures.length,
        failures,
        durationMs: Date.now() - startedAt,
        pass: success === CONFIG.concurrentConnections,
    };
}

async function runThroughputTest(sockets) {
    const totalMessages = sockets.length * CONFIG.throughputMessagesPerClient;
    const startedAt = Date.now();
    const ackCalls = [];

    for (let i = 0; i < sockets.length; i += 1) {
        for (let j = 0; j < CONFIG.throughputMessagesPerClient; j += 1) {
            ackCalls.push(
                emitWithAck(
                    sockets[i],
                    'latency_ping',
                    { msg_id: `tp-${i}-${j}` },
                    CONFIG.ackTimeoutMs
                )
            );
        }
    }

    const settled = await Promise.allSettled(ackCalls);
    const elapsedMs = Date.now() - startedAt;
    const elapsedSec = elapsedMs / 1000;

    let acked = 0;
    const failures = [];
    const latenciesMs = [];
    for (const result of settled) {
        if (result.status === 'fulfilled') {
            acked += 1;
            const ack = result.value;
            if (ack && ack.server_ts) {
                const latency = Math.abs(Date.now() - new Date(ack.server_ts).getTime());
                if (Number.isFinite(latency)) latenciesMs.push(latency);
            }
        } else {
            failures.push(toErrorMessage(result.reason));
        }
    }

    const messagesPerSec = elapsedSec > 0 ? acked / elapsedSec : 0;
    const sorted = latenciesMs.slice().sort((a, b) => a - b);
    const p95Index = sorted.length > 0 ? Math.floor(sorted.length * 0.95) - 1 : -1;
    const p95LatencyMs = p95Index >= 0 ? sorted[Math.max(0, p95Index)] : null;

    const errorRate = totalMessages > 0 ? failures.length / totalMessages : 1;

    return {
        targetMsgsPerSec: CONFIG.throughputTargetMsgsPerSec,
        totalMessages,
        acked,
        failed: failures.length,
        durationMs: elapsedMs,
        measuredMsgsPerSec: Number(messagesPerSec.toFixed(2)),
        p95LatencyMs,
        errorRate,
        failures: failures.slice(0, 10),
        pass: acked === totalMessages && messagesPerSec >= CONFIG.throughputTargetMsgsPerSec * 0.7,
    };
}

async function runShellUnderLoadTest(baseUrl, sockets) {
    const worker = sockets.find((s) => s && s.connected);
    if (!worker) {
        return {
            attempted: false,
            pass: false,
            reason: 'No connected worker socket available',
        };
    }

    const master = await connectSocket(baseUrl, 'load-master', 'master');
    let sessionId = null;
    try {
        const workerStart = new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('worker shell_start timeout')), CONFIG.shellAckTimeoutMs);
            worker.once('shell_start', (payload, ack) => {
                clearTimeout(timer);
                if (typeof ack === 'function') {
                    ack({ ok: true });
                }
                resolve(payload);
            });
        });

        const masterAck = emitWithAck(
            master,
            'shell_start',
            {
                agent_id: worker.__agentId,
                cols: 80,
                rows: 24,
            },
            CONFIG.shellAckTimeoutMs
        );

        const [workerPayload, ack] = await Promise.all([workerStart, masterAck]);
        sessionId = ack && ack.session_id ? ack.session_id : null;
        const ok = Boolean(
            ack && ack.ok === true && sessionId && workerPayload && workerPayload.session_id === sessionId
        );

        if (ok) {
            master.emit('shell_stop', { session_id: sessionId, reason: 'load-test-cleanup' });
        }

        return {
            attempted: true,
            pass: ok,
            sessionId,
            workerAgentId: worker.__agentId,
            ack: ack || null,
        };
    } catch (err) {
        if (sessionId) {
            master.emit('shell_stop', { session_id: sessionId, reason: 'load-test-error-cleanup' });
        }
        return {
            attempted: true,
            pass: false,
            error: toErrorMessage(err),
        };
    } finally {
        master.disconnect();
    }
}

async function writeEvidence(data) {
    const dir = path.dirname(CONFIG.evidencePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(CONFIG.evidencePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function main() {
    const startedAt = Date.now();
    const port = await pickFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const sockets = [];

    let serverRun = null;
    let serverMemoryBefore = null;
    let serverMemoryAfter = null;

    const summary = {
        task: 24,
        generatedAt: nowIso(),
        config: CONFIG,
        server: { baseUrl, port },
    };

    try {
        serverRun = await startServer(port);
        serverMemoryBefore = await getRssBytes(serverRun.child.pid);

        const connectionTest = await runConnectionTest(baseUrl, sockets);
        const throughputTest = await runThroughputTest(sockets);
        const shellTest = await runShellUnderLoadTest(baseUrl, sockets);

        serverMemoryAfter = await getRssBytes(serverRun.child.pid);
        const memoryDelta =
            Number.isFinite(serverMemoryBefore) && Number.isFinite(serverMemoryAfter)
                ? serverMemoryAfter - serverMemoryBefore
                : null;

        const overallPass = connectionTest.pass && throughputTest.pass;

        Object.assign(summary, {
            startedAt: new Date(startedAt).toISOString(),
            finishedAt: nowIso(),
            durationMs: Date.now() - startedAt,
            checks: {
                concurrentConnections: connectionTest,
                throughput: throughputTest,
                shellSessionUnderLoad: {
                    optional: true,
                    ...shellTest,
                },
            },
            metrics: {
                latencyP95Ms: throughputTest.p95LatencyMs,
                errorRate: throughputTest.errorRate,
                serverMemoryRssBeforeBytes: serverMemoryBefore,
                serverMemoryRssAfterBytes: serverMemoryAfter,
                serverMemoryDeltaBytes: memoryDelta,
            },
            result: overallPass ? 'PASS' : 'FAIL',
        });

        await writeEvidence(summary);

        console.log('=== Task 24 Load Test Summary ===');
        console.log(`Concurrent Connections: ${connectionTest.connected}/${connectionTest.required} -> ${connectionTest.pass ? 'PASS' : 'FAIL'}`);
        console.log(
            `Throughput: ${throughputTest.measuredMsgsPerSec} msg/s target~${throughputTest.targetMsgsPerSec}, ` +
            `acked ${throughputTest.acked}/${throughputTest.totalMessages}, errorRate ${(throughputTest.errorRate * 100).toFixed(3)}% -> ${throughputTest.pass ? 'PASS' : 'FAIL'}`
        );
        if (shellTest.attempted) {
            console.log(`Shell Session Under Load (optional): ${shellTest.pass ? 'PASS' : 'FAIL'}`);
        } else {
            console.log(`Shell Session Under Load (optional): SKIPPED (${shellTest.reason})`);
        }
        console.log(`Server RSS Delta: ${Number.isFinite(summary.metrics.serverMemoryDeltaBytes) ? summary.metrics.serverMemoryDeltaBytes : 'n/a'} bytes`);
        console.log(`Overall: ${summary.result}`);
        console.log(`Evidence: ${CONFIG.evidencePath}`);

        if (!overallPass) {
            process.exitCode = 1;
        }
    } finally {
        for (const socket of sockets) {
            try { socket.disconnect(); } catch (_e) {}
        }
        if (serverRun && serverRun.child) {
            await stopServer(serverRun.child);
        }
    }
}

main().catch(async (err) => {
    const failure = {
        task: 24,
        generatedAt: nowIso(),
        result: 'FAIL',
        fatalError: toErrorMessage(err),
    };
    try {
        await writeEvidence(failure);
    } catch (_e) {}
    console.error(`FAIL: ${toErrorMessage(err)}`);
    console.error(`Evidence: ${CONFIG.evidencePath}`);
    process.exit(1);
});
