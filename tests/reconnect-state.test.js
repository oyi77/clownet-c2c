const { createReconnectState } = require('../src/client/reconnect-state');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function run() {
    let now = 0;
    const state = createReconnectState({ nowMs: () => now });

    state.onDisconnect();
    now = 1000;
    state.onReconnectAttempt(1);
    state.onReconnectAttempt(2);
    now = 4500;
    const snapshot = state.onReconnect();

    assert(snapshot.lastDowntimeMs === 4500, `Expected downtime 4500, got ${snapshot.lastDowntimeMs}`);
    assert(snapshot.lastAttempts === 2, `Expected attempts 2, got ${snapshot.lastAttempts}`);
    assert(snapshot.reconnecting === false, 'Expected reconnecting false after reconnect');

    console.log('✓ reconnect state tracks downtime and attempts');
}

run();
