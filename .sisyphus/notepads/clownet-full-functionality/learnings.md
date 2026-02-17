# ClawNet Full Functionality - Learnings

## 2026-02-17 Wave 1: Authentication & Security Foundation

### Inherited Wisdom
- Security-critical modules require careful implementation with audit trail
- Token-based auth should use JWT with proper expiry
- Never expose secrets in client-side code
- All auth events should be logged for audit purposes

### Conventions
- Use existing patterns from `src/auth.js` for token resolution
- Follow `src/routes/dashboard.js` for route protection patterns
- Reference `src/config.js` for configuration patterns
- All new modules should export clear interfaces

### Gotchas
- Dashboard currently exposes secret in EJS template (to be fixed in Task 4)
- Client-side auth is currently client-side only (needs server-side validation)
- Token reuse after logout must be prevented
- Sessions must have expiry to prevent indefinite access

### Implementation Notes (Task 3: JWT Auth Middleware)
- Created `src/middleware/auth.js` with JWT session validation
- Created `src/routes/auth.js` with token generation and logout endpoints
- Token expiry set to 24 hours as required
- Invalidated tokens stored in memory with expiry-based cleanup
- Secret key never exposed in responses (only used for signing/verification)
- Logout invalidates tokens server-side to prevent reuse
- All auth events logged for audit trail
- Used `jsonwebtoken` library (HS256 algorithm)
- Followed existing patterns from `src/auth.js` and `src/config.js`

### Implementation Notes (Task 4: Remove Secret Exposure)
- Removed `secret: process.env.CLAWNET_SECRET_KEY` from dashboard route context
- Added `authEnabled: true` to indicate authentication is required
- Removed `const secret = '<%= secret %>'` from client-side code
- Changed token storage from `localStorage` to `sessionStorage` (4 occurrences)
- Implemented API-based token validation via POST `/api/auth/token`
- Token is now obtained server-side and never exposed in template
- Login modal shown by default when no token in sessionStorage
- JWT token stored in sessionStorage after successful authentication
- All authentication flows now use server-side validation
- Verified no "secret" keyword remains in either modified file

### Implementation Notes (Task 5: Audit Logging)
- Extended `src/utils/logger.js` with audit-specific logging functions
- Added audit event types: AUTH_SUCCESS, AUTH_FAILURE, TOKEN_GENERATED, TOKEN_REVOKED
- Created `logAuditEvent()` function with sanitized metadata (IP, userAgent, tenantId, agentId, reason)
- Sensitive data (passwords, full tokens, credentials) explicitly excluded from logs
- Added `readAuditLogs()` function to retrieve audit entries (most recent first)
- Added `AUDIT_LOG_PATH` to `src/config.js` for persistent audit log storage
- Created new endpoint GET `/api/logs/audit` in `src/routes/api.js`
- Audit logs stored in `data/audit.log` for persistence across restarts
- Followed existing patterns from `src/utils/logger.js` and `src/utils/audit.js`
