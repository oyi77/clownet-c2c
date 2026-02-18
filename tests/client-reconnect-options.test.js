const { buildSocketOptions } = require('../src/client/socket-options');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function run() {
    const authPayload = { token: 't', agent_id: 'a', role: 'worker' };
    const options = buildSocketOptions({ authPayload });

    assert(options.reconnection === true, 'Expected reconnection: true');
    assert(options.reconnectionAttempts === 0, 'Expected reconnectionAttempts: 0 (unlimited)');
    assert(options.reconnectionDelay === 1000, `Expected reconnectionDelay 1000, got ${options.reconnectionDelay}`);
    assert(options.reconnectionDelayMax === 30000, `Expected reconnectionDelayMax 30000, got ${options.reconnectionDelayMax}`);
    assert(options.randomizationFactor > 0, 'Expected randomizationFactor > 0 for jitter');
    assert(Array.isArray(options.transports), 'Expected transports array');
    assert(options.auth === authPayload, 'Expected auth payload to be passed through');

    console.log('✓ client reconnect socket options');
}

run();
