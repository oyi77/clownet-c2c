const { generateToken, invalidateToken, verifyToken } = require('../middleware/auth');
const config = require('../config');
const logger = require('../utils/logger');

const tokenRateLimit = new Map();
const TOKEN_WINDOW_MS = 60 * 1000;
const TOKEN_MAX_REQUESTS = 10;

function isTokenRateLimited(ip) {
    const now = Date.now();
    const key = ip || 'unknown';
    const windowStart = now - TOKEN_WINDOW_MS;
    const current = tokenRateLimit.get(key) || [];
    const recent = current.filter((timestamp) => timestamp > windowStart);

    recent.push(now);
    tokenRateLimit.set(key, recent);

    if (recent.length > TOKEN_MAX_REQUESTS) {
        return true;
    }

    return false;
}

function readBearerToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    return authHeader.substring(7);
}

function genericAuthFailure(reply, statusCode) {
    return reply.status(statusCode).send({ error: 'Authentication failed' });
}

function register(fastify) {
    fastify.post('/api/auth/token', async (req, reply) => {
        if (isTokenRateLimited(req.ip)) {
            return genericAuthFailure(reply, 429);
        }

        const { secret } = req.body || {};
        if (typeof secret !== 'string' || secret !== config.SECRET_KEY) {
            return genericAuthFailure(reply, 401);
        }

        const payload = {
            tenantId: 'default',
            type: 'dashboard_session',
            createdAt: Date.now(),
        };

        const { token, expiresAt } = generateToken(payload);

        logger.logAuditEvent(logger.AUDIT_EVENT_TYPES.TOKEN_GENERATED, {
            tenantId: payload.tenantId,
            expiresAt: expiresAt.toISOString(),
            ip: req.ip,
            userAgent: req.headers['user-agent'],
        });

        return reply.send({
            token,
            expiresAt: expiresAt.toISOString(),
            tokenType: 'Bearer',
        });
    });

    fastify.post('/api/auth/verify', async (req, reply) => {
        const token = readBearerToken(req);
        if (!token) {
            return reply.status(401).send({ valid: false });
        }

        const decoded = verifyToken(token);
        if (!decoded) {
            return reply.status(401).send({ valid: false });
        }

        return reply.send({
            valid: true,
            tenantId: decoded.tenantId,
            createdAt: decoded.createdAt,
        });
    });

    async function revokeHandler(req, reply) {
        const token = readBearerToken(req);
        if (!token) {
            return reply.status(401).send({ valid: false });
        }

        invalidateToken(token);

        logger.logAuditEvent(logger.AUDIT_EVENT_TYPES.TOKEN_REVOKED, {
            ip: req.ip,
            userAgent: req.headers['user-agent'],
        });

        return reply.send({ message: 'Successfully logged out' });
    }

    fastify.post('/api/auth/revoke', revokeHandler);
    fastify.post('/api/auth/logout', revokeHandler);
}

module.exports = { register };
