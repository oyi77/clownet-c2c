function createShutdownConfirm({ nowMs, ttlMs } = {}) {
    const clock = typeof nowMs === 'function' ? nowMs : () => Date.now();
    const ttl = Math.max(1, Number.isFinite(ttlMs) ? ttlMs : 30000);

    let pending = null;

    function request(senderId) {
        if (!senderId) return false;
        pending = { senderId, ts: clock() };
        return true;
    }

    function confirm(senderId) {
        if (!pending) return false;
        if (pending.senderId !== senderId) return false;
        if (clock() - pending.ts > ttl) {
            pending = null;
            return false;
        }
        pending = null;
        return true;
    }

    function clear() {
        pending = null;
    }

    function isPendingFor(senderId) {
        return !!pending && pending.senderId === senderId && (clock() - pending.ts) <= ttl;
    }

    return { request, confirm, clear, isPendingFor };
}

module.exports = { createShutdownConfirm };
