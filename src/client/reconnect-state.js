function createReconnectState({ nowMs } = {}) {
    const clock = typeof nowMs === 'function' ? nowMs : () => Date.now();

    let reconnecting = false;
    let reconnectingSinceMs = null;
    let currentAttempts = 0;

    let lastDowntimeMs = 0;
    let lastAttempts = 0;

    function onDisconnect() {
        reconnecting = true;
        reconnectingSinceMs = clock();
        currentAttempts = 0;
    }

    function onReconnectAttempt(attempt) {
        if (!reconnecting) return;
        if (Number.isFinite(attempt)) currentAttempts = attempt;
    }

    function onReconnect() {
        if (reconnecting && reconnectingSinceMs !== null) {
            lastDowntimeMs = Math.max(0, clock() - reconnectingSinceMs);
            lastAttempts = currentAttempts;
        }

        reconnecting = false;
        reconnectingSinceMs = null;
        currentAttempts = 0;

        return getSnapshot();
    }

    function getSnapshot() {
        return {
            reconnecting,
            reconnectingSinceMs,
            currentAttempts,
            lastDowntimeMs,
            lastAttempts,
        };
    }

    return {
        onDisconnect,
        onReconnectAttempt,
        onReconnect,
        getSnapshot,
    };
}

module.exports = { createReconnectState };
