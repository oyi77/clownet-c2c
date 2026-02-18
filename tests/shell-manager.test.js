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
    child.killed = false;
    child.kill = () => { child.killed = true; child.emit('close', 0); };
    return child;
}

async function run() {
    const outputs = [];
    const exits = [];

    let spawned = 0;
    const manager = createShellManager({
        spawnFn: () => {
            spawned += 1;
            return makeFakeChild();
        },
        onOutput: (evt) => outputs.push(evt),
        onExit: (evt) => exits.push(evt),
    });

    manager.start({ session_id: 's1' });
    assert(spawned === 1, 'Expected spawn called');

    manager.input({ session_id: 's1', data: 'ls\n' });
    const sess = manager.getSession('s1');
    assert(sess.child.stdin.written === 'ls\n', 'Expected stdin write');

    sess.child.stdout.emit('data', Buffer.from('ok\n'));
    assert(outputs.length === 1, 'Expected output callback');
    assert(outputs[0].session_id === 's1', 'Expected session id on output');

    manager.stop({ session_id: 's1' });
    assert(exits.length === 1, 'Expected exit callback');
    assert(manager.getSession('s1') === null, 'Expected session removed');

    console.log('✓ shell manager basic lifecycle');
}

run().catch((err) => {
    console.error(`✗ shell manager test failed: ${err && err.message ? err.message : String(err)}`);
    process.exit(1);
});
