const path = require('path');
const fs = require('fs');

const SECRET_KEY = process.env.CLAWNET_SECRET_KEY || 'very-secret-key-123';
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'clownet_v3.json');
const SETTINGS_PATH = path.join(DATA_DIR, 'settings.json');
const SERVER_LOG_PATH = path.join(DATA_DIR, 'server.log');
const TRAFFIC_LOG_PATH = path.join(DATA_DIR, 'traffic.log');

// Safety controls
function parseList(value) {
    return (value || '').split(',').map(s => s.trim()).filter(Boolean);
}

const COMMAND_DENYLIST = parseList(process.env.CLAWNET_COMMAND_DENYLIST || '');
const COMMAND_RISKYLIST = parseList(process.env.CLAWNET_COMMAND_RISKYLIST || '');

// Delivery guarantees
const ACK_TIMEOUT_MS = parseInt(process.env.CLAWNET_ACK_TIMEOUT_MS || '5000', 10);
const ACK_MAX_RETRIES = parseInt(process.env.CLAWNET_ACK_MAX_RETRIES || '3', 10);

// Multi-tenant
const TENANTS_PATH = process.env.CLAWNET_TENANTS_PATH || '';

function loadTenants() {
    if (!TENANTS_PATH) return null;
    try {
        if (fs.existsSync(TENANTS_PATH)) {
            return JSON.parse(fs.readFileSync(TENANTS_PATH, 'utf8'));
        }
    } catch (e) {
        console.error('Tenants config load error:', e.message);
    }
    return null;
}

module.exports = {
    SECRET_KEY,
    PORT,
    DATA_DIR,
    DB_PATH,
    SETTINGS_PATH,
    SERVER_LOG_PATH,
    TRAFFIC_LOG_PATH,
    COMMAND_DENYLIST,
    COMMAND_RISKYLIST,
    ACK_TIMEOUT_MS,
    ACK_MAX_RETRIES,
    TENANTS_PATH,
    loadTenants,
};
