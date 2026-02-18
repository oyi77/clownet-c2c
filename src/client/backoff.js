function computeBackoffDelayMs({ attempt, baseMs, maxMs, jitterFactor, rand }) {
    const safeAttempt = Math.max(1, Number.isFinite(attempt) ? attempt : 1);
    const safeBase = Math.max(0, Number.isFinite(baseMs) ? baseMs : 0);
    const safeMax = Math.max(safeBase, Number.isFinite(maxMs) ? maxMs : safeBase);
    const safeJitter = Math.max(0, Number.isFinite(jitterFactor) ? jitterFactor : 0);
    const safeRand = Math.min(1, Math.max(0, Number.isFinite(rand) ? rand : Math.random()));

    const pow = Math.pow(2, safeAttempt - 1);
    const raw = Math.min(safeMax, safeBase * pow);
    const withJitter = raw * (1 + safeJitter * safeRand);

    return Math.round(withJitter);
}

module.exports = { computeBackoffDelayMs };
