function createLatencySampler({ nowMs, pingFn }) {
    const clock = typeof nowMs === 'function' ? nowMs : () => Date.now();
    if (typeof pingFn !== 'function') {
        throw new Error('pingFn is required');
    }

    let lastMs = null;

    async function sample() {
        const start = clock();
        await pingFn();
        const elapsed = Math.max(0, clock() - start);
        lastMs = elapsed;
        return elapsed;
    }

    function getLastMs() {
        return lastMs;
    }

    return { sample, getLastMs };
}

module.exports = { createLatencySampler };
