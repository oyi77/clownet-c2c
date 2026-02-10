const fs = require('fs');
const crypto = require('crypto');
const config = require('../config');

let prevHash = null;

// In-memory buffer of recent traffic entries
const trafficBuffer = [];
const TRAFFIC_BUFFER_MAX = 500;

function recordTraffic(entry) {
    const record = {
        ...entry,
        ts: new Date().toISOString(),
        tenant_id: entry.tenant_id || 'default',
    };

    // SHA-256 hash chain
    const payload = JSON.stringify(record);
    const hash = crypto.createHash('sha256').update(payload + (prevHash || '')).digest('hex');
    record.prev_hash = prevHash;
    record.hash = hash;
    prevHash = hash;

    // Write to file
    try {
        fs.appendFileSync(config.TRAFFIC_LOG_PATH, JSON.stringify(record) + '\n');
    } catch (e) {
        console.error('Traffic log write error:', e.message);
    }

    // Keep in memory buffer
    trafficBuffer.push(record);
    if (trafficBuffer.length > TRAFFIC_BUFFER_MAX) {
        trafficBuffer.shift();
    }
}

function getRecentTraffic(limit = 50) {
    return trafficBuffer.slice(-limit);
}

module.exports = { recordTraffic, getRecentTraffic };
