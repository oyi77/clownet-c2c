function getIntEnv(name, defaultValue) {
    const raw = process.env[name];
    if (raw === undefined || raw === null || raw === '') return defaultValue;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : defaultValue;
}

function getFloatEnv(name, defaultValue) {
    const raw = process.env[name];
    if (raw === undefined || raw === null || raw === '') return defaultValue;
    const parsed = parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : defaultValue;
}

function buildSocketOptions({ authPayload }) {
    const reconnectionDelay = getIntEnv('CLAWNET_RECONNECT_BASE_MS', 1000);
    const reconnectionDelayMax = getIntEnv('CLAWNET_RECONNECT_MAX_MS', 30000);
    const randomizationFactor = getFloatEnv('CLAWNET_RECONNECT_JITTER', 0.5);

    return {
        reconnection: true,
        reconnectionAttempts: 0,
        reconnectionDelay,
        reconnectionDelayMax,
        randomizationFactor,
        transports: ['websocket', 'polling'],
        auth: authPayload
    };
}

module.exports = { buildSocketOptions };
