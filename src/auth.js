const config = require('./config');

// Resolve tenant from auth token.
// If multi-tenant is configured, token format is "tenant_id:secret".
// Otherwise, validate against SECRET_KEY directly.

function resolveTenant(token) {
    const tenants = config.loadTenants();

    if (tenants) {
        // Multi-tenant mode
        const colonIdx = token ? token.indexOf(':') : -1;
        if (colonIdx === -1) return null;

        const tenantId = token.substring(0, colonIdx);
        const secret = token.substring(colonIdx + 1);

        if (tenants[tenantId] && tenants[tenantId] === secret) {
            return tenantId;
        }
        return null;
    }

    // Single tenant mode
    if (token === config.SECRET_KEY) {
        return 'default';
    }
    return null;
}

module.exports = { resolveTenant };
