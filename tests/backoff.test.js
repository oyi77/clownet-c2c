const { computeBackoffDelayMs } = require('../src/client/backoff');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function run() {
    const baseMs = 1000;
    const maxMs = 30000;

    const d1 = computeBackoffDelayMs({ attempt: 1, baseMs, maxMs, jitterFactor: 0, rand: 0.123 });
    const d2 = computeBackoffDelayMs({ attempt: 2, baseMs, maxMs, jitterFactor: 0, rand: 0.123 });
    const d3 = computeBackoffDelayMs({ attempt: 3, baseMs, maxMs, jitterFactor: 0, rand: 0.123 });

    assert(d1 === 1000, `Expected 1000, got ${d1}`);
    assert(d2 === 2000, `Expected 2000, got ${d2}`);
    assert(d3 === 4000, `Expected 4000, got ${d3}`);

    const capped = computeBackoffDelayMs({ attempt: 99, baseMs, maxMs, jitterFactor: 0, rand: 0.5 });
    assert(capped === maxMs, `Expected capped ${maxMs}, got ${capped}`);

    const jittered = computeBackoffDelayMs({ attempt: 2, baseMs, maxMs, jitterFactor: 0.5, rand: 1 });
    assert(jittered === 3000, `Expected jittered 3000, got ${jittered}`);

    console.log('✓ backoff computation');
}

run();
