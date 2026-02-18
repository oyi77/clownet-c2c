const { createShutdownConfirm } = require('../src/client/shutdown-confirm');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function run() {
    let now = 0;
    const mgr = createShutdownConfirm({ nowMs: () => now, ttlMs: 30000 });

    assert(mgr.request('master-ui') === true, 'Expected request true');
    assert(mgr.confirm('worker-1') === false, 'Expected confirm false for wrong sender');
    assert(mgr.confirm('master-ui') === true, 'Expected confirm true for correct sender');

    mgr.request('master-ui');
    now = 40000;
    assert(mgr.confirm('master-ui') === false, 'Expected confirm false after TTL');

    console.log('✓ shutdown confirmation manager');
}

run();
