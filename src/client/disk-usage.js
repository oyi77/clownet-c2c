const { spawnSync } = require('child_process');

function parseDfAvailableKb(output) {
    if (!output || typeof output !== 'string') return null;
    const lines = output.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return null;

    const row = lines[1];
    const parts = row.split(/\s+/);
    if (parts.length < 4) return null;

    const availableKb = parseInt(parts[3], 10);
    return Number.isFinite(availableKb) ? availableKb : null;
}

function getDiskAvailableKb({ mountPath = '/' } = {}) {
    if (process.platform === 'win32') return null;
    const res = spawnSync('df', ['-k', mountPath], { encoding: 'utf8', timeout: 750 });
    if (!res || res.status !== 0) return null;
    return parseDfAvailableKb(res.stdout);
}

module.exports = { parseDfAvailableKb, getDiskAvailableKb };
