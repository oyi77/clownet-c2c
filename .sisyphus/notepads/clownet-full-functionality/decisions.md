# ClawNet Full Functionality - Decisions

## 2026-02-17 Wave 1 Decisions

### Decision: JWT-based Authentication
- Use JWT tokens with 24-hour expiry for dashboard authentication
- Store valid tokens in memory with metadata for revocation capability
- Tokens validated server-side on every dashboard request

### Decision: Audit Logging
- All authentication attempts (success/failure) logged
- Token generation, verification, and revocation events logged
- Security event types: AUTH_SUCCESS, AUTH_FAILURE, TOKEN_GENERATED, TOKEN_REVOKED
- Metadata includes IP address, user agent, timestamp

### Decision: Secret Exposure Prevention
- Remove `secret: process.env.CLAWNET_SECRET_KEY` from dashboard EJS context
- Use API-based token validation instead of secret exposure
- Store token in sessionStorage (not localStorage) for additional security
