const fs = require('fs');
const config = require('../config');

// Audit event types
const AUDIT_EVENT_TYPES = {
    AUTH_SUCCESS: 'AUTH_SUCCESS',
    AUTH_FAILURE: 'AUTH_FAILURE',
    TOKEN_GENERATED: 'TOKEN_GENERATED',
    TOKEN_REVOKED: 'TOKEN_REVOKED',
};

function logEvent(message) {
    const line = `[${new Date().toISOString()}] ${message}\n`;
    try { fs.appendFileSync(config.SERVER_LOG_PATH, line); } catch (e) { }
}

function logAuditEvent(eventType, metadata = {}) {
    // Sanitize metadata to avoid logging sensitive data
    const sanitized = {
        type: eventType,
        timestamp: new Date().toISOString(),
        ip: metadata.ip || null,
        userAgent: metadata.userAgent || null,
        tenantId: metadata.tenantId || null,
        agentId: metadata.agentId || null,
        reason: metadata.reason || null,
        // Never log: passwords, full tokens, credentials
    };

    const line = JSON.stringify(sanitized) + '\n';
    try { fs.appendFileSync(config.AUDIT_LOG_PATH, line); } catch (e) {
        console.error('Audit log write error:', e.message);
    }
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

function readAuditLogs(limit = 100) {
    try {
        if (!fs.existsSync(config.AUDIT_LOG_PATH)) return [];
        const content = fs.readFileSync(config.AUDIT_LOG_PATH, 'utf8');
        const lines = content.split(/\r?\n/).filter(Boolean);
        const entries = lines.slice(-limit).map(line => {
            try {
                return JSON.parse(line);
            } catch (e) {
                return null;
            }
        }).filter(Boolean);
        return entries.reverse(); // Most recent first
    } catch (e) {
        console.error('Audit log read error:', e.message);
        return [];
    }
}

module.exports = {
    logEvent,
    readLastLines,
    logAuditEvent,
    readAuditLogs,
    AUDIT_EVENT_TYPES,
};
