const fs = require('fs');
const path = require('path');

function ensureDirForFile(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function safeReadJson(filePath) {
    try {
        if (!fs.existsSync(filePath)) return null;
        const raw = fs.readFileSync(filePath, 'utf8');
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (_e) {
        return null;
    }
}

function safeWriteJson(filePath, value) {
    ensureDirForFile(filePath);
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
    fs.renameSync(tmp, filePath);
}

function normalizeEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    if (typeof entry.event !== 'string' || entry.event.length === 0) return null;
    if (!entry.payload || typeof entry.payload !== 'object') return null;

    return {
        key: typeof entry.key === 'string' && entry.key.length > 0 ? entry.key : null,
        event: entry.event,
        payload: entry.payload,
        createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : new Date().toISOString(),
        attempts: Number.isFinite(entry.attempts) ? entry.attempts : 0,
    };
}

function createOfflineOutbox({ filePath, maxItems = 200, maxSendAttempts = 3 } = {}) {
    if (!filePath || typeof filePath !== 'string') {
        throw new Error('filePath is required');
    }

    const cap = Math.max(1, Number.isFinite(maxItems) ? maxItems : 200);
    const sendAttemptsCap = Math.max(1, Number.isFinite(maxSendAttempts) ? maxSendAttempts : 3);

    const loaded = safeReadJson(filePath);
    let entries = Array.isArray(loaded && loaded.entries) ? loaded.entries.map(normalizeEntry).filter(Boolean) : [];
    let flushing = false;

    function persist() {
        safeWriteJson(filePath, { version: 1, entries });
    }

    function size() {
        return entries.length;
    }

    function enqueue(entry) {
        const normalized = normalizeEntry(entry);
        if (!normalized) return false;

        if (normalized.key) {
            const idx = entries.findIndex((e) => e && e.key === normalized.key);
            if (idx >= 0) {
                entries[idx] = normalized;
                persist();
                return true;
            }
        }

        entries.push(normalized);
        if (entries.length > cap) {
            entries = entries.slice(entries.length - cap);
        }
        persist();
        return true;
    }

    function peek(limit = 20) {
        const n = Math.max(0, Number.isFinite(limit) ? limit : 20);
        return entries.slice(0, n).map((e) => ({
            key: e.key,
            event: e.event,
            createdAt: e.createdAt,
            attempts: e.attempts,
        }));
    }

    async function flush(sendFn) {
        if (typeof sendFn !== 'function') throw new Error('sendFn is required');
        if (flushing) {
            return { sent: 0, remaining: entries.length };
        }

        flushing = true;
        let sent = 0;

        try {
            while (entries.length > 0) {
                const current = entries[0];

                if ((current.attempts || 0) >= sendAttemptsCap) {
                    entries.shift();
                    persist();
                    continue;
                }

                try {
                    current.attempts += 1;
                    const res = await sendFn(current);
                    if (!res || res.ok !== true) {
                        throw new Error('sendFn returned non-ok');
                    }
                    entries.shift();
                    sent += 1;
                    persist();
                } catch (_e) {
                    if ((current.attempts || 0) >= sendAttemptsCap) {
                        entries.shift();
                        persist();
                        continue;
                    }
                    persist();
                    break;
                }
            }

            return { sent, remaining: entries.length };
        } finally {
            flushing = false;
        }
    }

    return {
        filePath,
        size,
        enqueue,
        peek,
        flush,
    };
}

module.exports = { createOfflineOutbox };
