const { EventEmitter } = require('events');

const { createShellManager } = require('../src/client/shell-manager');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function makeFakeChild() {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = { written: '', write: (d) => { child.stdin.written += d; } };
    child.kill = () => { child.emit('close', 0); };
    return child;
}

function makeFakePty() {
    const proc = new EventEmitter();
    proc.written = '';
    proc.resizes = [];
    proc.kills = 0;

    proc.write = (d) => { proc.written += d; };
    proc.resize = (cols, rows) => { proc.resizes.push({ cols, rows }); };
    proc.kill = () => {
        proc.kills += 1;
        proc.emit('exit', { exitCode: 0, signal: null });
    };

    proc.onData = (fn) => { proc.on('data', fn); };
    proc.onExit = (fn) => { proc.on('exit', fn); };

    const pty = {
        spawned: 0,
        lastOptions: null,
        spawn: (_cmd, _args, options) => {
            pty.spawned += 1;
            pty.lastOptions = options || null;
            return proc;
        },
    };

    return { proc, pty };
}

async function run() {
    const outputs = [];
    const exits = [];

    let childSpawned = 0;
    const { proc, pty } = makeFakePty();

    const manager = createShellManager({
        pty,
        spawnFn: () => {
            childSpawned += 1;
            return makeFakeChild();
        },
        onOutput: (evt) => outputs.push(evt),
        onExit: (evt) => exits.push(evt),
    });

    manager.start({ session_id: 's1', cols: 120, rows: 40 });
    assert(pty.spawned === 1, 'Expected pty.spawn called');
    assert(childSpawned === 0, 'Expected child_process spawn not called when pty available');
    assert(pty.lastOptions && pty.lastOptions.cols === 120 && pty.lastOptions.rows === 40, 'Expected cols/rows passed to pty.spawn');
    assert(pty.lastOptions && pty.lastOptions.env && typeof pty.lastOptions.env === 'object', 'Expected env passed to pty.spawn');
    assert(pty.lastOptions && typeof pty.lastOptions.name === 'string' && pty.lastOptions.name.length > 0, 'Expected name passed to pty.spawn');
    assert(pty.lastOptions && typeof pty.lastOptions.cwd === 'string' && pty.lastOptions.cwd.length > 0, 'Expected cwd passed to pty.spawn');

    manager.input({ session_id: 's1', data: 'echo hi\n' });
    assert(proc.written === 'echo hi\n', 'Expected PTY write to receive input');

    manager.resize({ session_id: 's1', cols: 140, rows: 45 });
    assert(proc.resizes.length === 1, 'Expected resize forwarded to PTY');
    assert(proc.resizes[0].cols === 140 && proc.resizes[0].rows === 45, 'Expected resize dims forwarded');

    proc.emit('data', 'hello\n');
    assert(outputs.length === 1, 'Expected PTY output to call onOutput');
    assert(outputs[0].stream === 'stdout', 'Expected PTY output stream');
    assert(outputs[0].encoding === 'utf8', 'Expected PTY output encoding');
    assert(outputs[0].data === 'hello\n', 'Expected PTY output data');

    manager.stop({ session_id: 's1' });
    assert(proc.kills === 1, 'Expected PTY kill called');
    assert(exits.length === 1, 'Expected exit callback');
    assert(manager.getSession('s1') === null, 'Expected session removed');

    console.log('✓ shell manager uses PTY when available');
}

run().catch((err) => {
    console.error(`✗ shell manager PTY test failed: ${err && err.message ? err.message : String(err)}`);
    process.exit(1);
});
