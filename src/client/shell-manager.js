const { spawn } = require('child_process');

function createShellManager({ spawnFn, pty, ptySpawnFn, onOutput, onExit } = {}) {
    const spawner = typeof spawnFn === 'function' ? spawnFn : spawn;
    const ptySpawner = typeof ptySpawnFn === 'function'
        ? ptySpawnFn
        : (pty && typeof pty.spawn === 'function' ? pty.spawn.bind(pty) : null);
    const handleOutput = typeof onOutput === 'function' ? onOutput : () => {};
    const handleExit = typeof onExit === 'function' ? onExit : () => {};

    const sessions = new Map();

    function getSession(sessionId) {
        return sessions.get(sessionId) || null;
    }

    function listSessionIds() {
        return Array.from(sessions.keys());
    }

    function stopAll() {
        for (const sessionId of listSessionIds()) {
            stop({ session_id: sessionId });
        }
    }

    function start({ session_id, command, cols, rows } = {}) {
        if (!session_id) throw new Error('session_id is required');
        if (sessions.has(session_id)) return;

        const argv = Array.isArray(command && command.argv) ? command.argv : null;

        const safeCols = Number.isFinite(cols) ? cols : 80;
        const safeRows = Number.isFinite(rows) ? rows : 24;

        if (ptySpawner) {
            const ptyOptions = {
                name: process.env.TERM || 'xterm-color',
                cols: safeCols,
                rows: safeRows,
                cwd: process.env.HOME || process.cwd(),
                env: process.env,
            };
            const child = argv && argv.length > 0
                ? ptySpawner(argv[0], argv.slice(1), ptyOptions)
                : ptySpawner('sh', ['-l'], ptyOptions);

            const sess = { session_id, child, isPty: true };
            sessions.set(session_id, sess);

            if (child && typeof child.onData === 'function') {
                child.onData((data) => {
                    handleOutput({ session_id, stream: 'stdout', data: String(data), encoding: 'utf8' });
                });
            } else if (child && typeof child.on === 'function') {
                child.on('data', (data) => {
                    handleOutput({ session_id, stream: 'stdout', data: String(data), encoding: 'utf8' });
                });
            }

            if (child && typeof child.onExit === 'function') {
                child.onExit(({ exitCode, signal }) => {
                    sessions.delete(session_id);
                    handleExit({ session_id, exitCode: exitCode === undefined ? null : exitCode, signal: signal || null });
                });
            } else if (child && typeof child.on === 'function') {
                child.on('exit', ({ exitCode, signal }) => {
                    sessions.delete(session_id);
                    handleExit({ session_id, exitCode: exitCode === undefined ? null : exitCode, signal: signal || null });
                });
            }

            return;
        }

        const child = argv && argv.length > 0
            ? spawner(argv[0], argv.slice(1), { stdio: 'pipe' })
            : spawner('sh', ['-l'], { stdio: 'pipe' });

        const sess = { session_id, child, isPty: false };
        sessions.set(session_id, sess);

        if (child.stdout) {
            child.stdout.on('data', (data) => {
                handleOutput({ session_id, stream: 'stdout', data: data.toString(), encoding: 'utf8' });
            });
        }
        if (child.stderr) {
            child.stderr.on('data', (data) => {
                handleOutput({ session_id, stream: 'stderr', data: data.toString(), encoding: 'utf8' });
            });
        }

        child.on('close', (code, signal) => {
            sessions.delete(session_id);
            handleExit({ session_id, exitCode: code, signal: signal || null });
        });

        child.on('error', (err) => {
            sessions.delete(session_id);
            handleExit({ session_id, exitCode: null, signal: null, error: err.message });
        });
    }

    function input({ session_id, data } = {}) {
        const sess = getSession(session_id);
        if (!sess) return;
        const child = sess.child;
        if (!child) return;
        if (sess.isPty && typeof child.write === 'function') {
            child.write(data || '');
            return;
        }
        if (!child.stdin) return;
        child.stdin.write(data || '');
    }

    function resize({ session_id, cols, rows } = {}) {
        const sess = getSession(session_id);
        if (!sess) return;
        const child = sess.child;
        if (!child) return;
        if (typeof child.resize === 'function' && Number.isFinite(cols) && Number.isFinite(rows)) {
            child.resize(cols, rows);
        }
    }

    function stop({ session_id } = {}) {
        const sess = getSession(session_id);
        if (!sess) return;
        if (sess.stopping) return;
        sess.stopping = true;

        setTimeout(() => {
            if (sessions.has(session_id)) {
                sessions.delete(session_id);
                handleExit({ session_id, exitCode: null, signal: 'SIGTERM' });
            }
        }, 1000);

        try {
            const child = sess.child;
            if (child && typeof child.kill === 'function') {
                child.kill();
            }
        } catch (_e) {}
    }

    return { start, input, resize, stop, stopAll, getSession, listSessionIds };
}

module.exports = { createShellManager };
