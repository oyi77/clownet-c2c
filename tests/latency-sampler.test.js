const { createLatencySampler } = require('../src/client/latency-sampler');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function run() {
    let now = 0;
    const sampler = createLatencySampler({
        nowMs: () => now,
        pingFn: async () => {
            now += 17;
            return { ok: true };
        },
    });

    const ms = await sampler.sample();
    assert(ms === 17, `Expected 17ms, got ${ms}`);
    assert(sampler.getLastMs() === 17, 'Expected last latency to be stored');

    console.log('✓ latency sampler measures duration');
}

run().catch((err) => {
    console.error(`✗ latency sampler failed: ${err && err.message ? err.message : String(err)}`);
    process.exit(1);
});
