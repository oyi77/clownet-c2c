const { generateToken, invalidateToken } = require('../middleware/auth');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Authentication routes for dashboard
 * - POST /api/auth/token - Generate JWT token
 * - POST /api/auth/logout - Invalidate token (logout)
 */

function register(fastify) {
    /**
     * POST /api/auth/token
     * Generate a JWT token for dashboard access
     * Body: { tenantId?: string } or uses default tenant
     */
    fastify.post('/api/auth/token', async (req, reply) => {
        const { tenantId } = req.body || {};

        // Resolve tenant from request or use default
        let resolvedTenant = tenantId;
        if (!resolvedTenant) {
            // Check for auth token in header for multi-tenant mode
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.substring(7);
                const tenantAuth = require('../auth');
                resolvedTenant = tenantAuth.resolveTenant(token);
            }
        }

        if (!resolvedTenant) {
            resolvedTenant = 'default';
        }

        // Validate tenant exists (if multi-tenant mode)
        const tenants = config.loadTenants();
        if (tenants && !tenants[resolvedTenant]) {
            return reply.status(400).send({ error: 'Invalid tenant' });
        }

        // Generate token with tenant info
        const payload = {
            tenantId: resolvedTenant,
            type: 'dashboard_session',
            createdAt: Date.now(),
        };

        const { token, expiresAt } = generateToken(payload);

        // Log token generation for audit
        logger.event('auth.token_generated', {
            tenantId: resolvedTenant,
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

    /**
     * POST /api/auth/logout
     * Invalidate the current token (logout)
     * Header: Authorization: Bearer <token>
     */
    fastify.post('/api/auth/logout', async (req, reply) => {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return reply.status(401).send({ error: 'Authorization header required' });
        }

        const token = authHeader.substring(7);

        // Invalidate the token
        invalidateToken(token);

        // Log logout for audit
        logger.event('auth.logout', {
            ip: req.ip,
            userAgent: req.headers['user-agent'],
        });

        return reply.send({ message: 'Successfully logged out' });
    });

    /**
     * GET /api/auth/verify
     * Verify if a token is valid (useful for session checks)
     * Header: Authorization: Bearer <token>
     */
    fastify.get('/api/auth/verify', async (req, reply) => {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return reply.status(401).send({ valid: false, error: 'Authorization header required' });
        }

        const token = authHeader.substring(7);
        const { verifyToken } = require('../middleware/auth');
        const decoded = verifyToken(token);

        if (!decoded) {
            return reply.status(401).send({ valid: false, error: 'Invalid or expired token' });
        }

        return reply.send({
            valid: true,
            tenantId: decoded.tenantId,
            createdAt: decoded.createdAt,
        });
    });
}

module.exports = { register };
