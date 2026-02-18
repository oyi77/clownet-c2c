const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');

// In-memory store for invalidated tokens (tokenHash -> expiry timestamp)
// Tokens are added here on logout and checked during verification
const invalidatedTokens = new Map();

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generate a JWT token with 24h expiry
 * @param {Object} payload - Token payload (should include user/tenant info)
 * @returns {Object} { token: string, expiresAt: Date }
 */
function generateToken(payload) {
    const expiresIn = '24h';
    const token = jwt.sign(payload, config.SECRET_KEY, { expiresIn });
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return { token, expiresAt };
}

/**
 * Verify and decode a JWT token
 * @param {string} token - JWT token to verify
 * @returns {Object|null} Decoded payload or null if invalid
 */
function verifyToken(token) {
    try {
        const tokenHash = hashToken(token);

        // Check if token has been invalidated
        if (invalidatedTokens.has(tokenHash)) {
            const invalidUntil = invalidatedTokens.get(tokenHash);
            if (Date.now() < invalidUntil) {
                return null; // Token is invalidated
            }
            // Cleanup expired invalidation record
            invalidatedTokens.delete(tokenHash);
        }

        const decoded = jwt.verify(token, config.SECRET_KEY);
        return decoded;
    } catch (err) {
        return null;
    }
}

/**
 * Invalidate a token (logout) - adds to blocklist until natural expiry
 * @param {string} token - Token to invalidate
 */
function invalidateToken(token) {
    const tokenHash = hashToken(token);

    try {
        // Decode without verification to get expiry
        const decoded = jwt.decode(token);
        if (decoded && decoded.exp) {
            // Store until natural expiry + 1 hour grace period
            const invalidUntil = (decoded.exp * 1000) + (60 * 60 * 1000);
            invalidatedTokens.set(tokenHash, invalidUntil);
        } else {
            // If no expiry, invalidate for 24 hours
            invalidatedTokens.set(tokenHash, Date.now() + 24 * 60 * 60 * 1000);
        }
    } catch (err) {
        // If decode fails, invalidate for 24 hours anyway
        invalidatedTokens.set(tokenHash, Date.now() + 24 * 60 * 60 * 1000);
    }
}

/**
 * Authentication middleware for protected routes
 * Validates JWT token from Authorization header
 */
function authMiddleware(req, reply, done) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.status(401).send({ error: 'Authorization header missing or invalid' });
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

    if (!decoded) {
        return reply.status(401).send({ error: 'Invalid or expired token' });
    }

    // Attach decoded user info to request for downstream handlers
    req.user = decoded;
    done();
}

/**
 * Dashboard authentication middleware
 * Protects dashboard routes with JWT validation
 */
function dashboardAuthMiddleware(req, reply, done) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.status(401).send({ error: 'Authentication required' });
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

    if (!decoded) {
        return reply.status(401).send({ error: 'Invalid or expired session' });
    }

    // Attach user info to request
    req.user = decoded;
    done();
}

// Cleanup expired invalidation entries periodically
setInterval(() => {
    const now = Date.now();
    for (const [tokenHash, invalidUntil] of invalidatedTokens) {
        if (now >= invalidUntil) {
            invalidatedTokens.delete(tokenHash);
        }
    }
}, 60 * 60 * 1000); // Run every hour

module.exports = {
    generateToken,
    verifyToken,
    invalidateToken,
    authMiddleware,
    dashboardAuthMiddleware,
};
