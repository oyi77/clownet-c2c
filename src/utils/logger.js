const fs = require('fs');
const config = require('../config');

function logEvent(message) {
    const line = `[${new Date().toISOString()}] ${message}\n`;
    try { fs.appendFileSync(config.SERVER_LOG_PATH, line); } catch (e) { }
}

function readLastLines(filePath, limit) {
    try {
        if (!fs.existsSync(filePath)) return [];
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split(/\r?\n/).filter(Boolean);
        return lines.slice(-limit);
    } catch (e) {
        console.error('Log Read Error', e);
        return [];
    }
}

module.exports = { logEvent, readLastLines };
