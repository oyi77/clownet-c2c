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

## 2026-02-18 Task 17 Decisions

### Decision: Fleet Virtualization Entry Point
- Keep all virtual-scroll hooks in existing fleet partials using `#fleet-scroll-container` + spacer divs, avoiding dashboard-level layout redesign.

### Decision: Fleet Action Resilience
- Use event delegation on `#fleet-grid` for `.agent-actions` so button behavior survives virtualized rerenders.

### Decision: Logs Scroll Contract
- Use a single `#logs-autoscroll-toggle` (default ON) and preserve scroll offsets when disabled.

### Decision: Chat Scroll Policy
- Gate bottom-follow behavior by near-bottom detection snapshot before append; do not force-scroll when the operator is reading older chat history.

## 2026-02-18 Task 18 Decisions

### Decision: Evidence-Only Scope
- Keep Task 18 limited to evidence generation in `.sisyphus/evidence/task-18-shared-memory.json`; do not modify shared-memory handlers or feature tests unless ACK/TTL behavior is incorrect.

### Decision: TTL Proof Shape
- Use a deterministic flow: set key with `ttl: 1`, immediate get/list assertions, wait 1300ms, assert expired get response, then set/delete a fresh key to prove delete success.

## 2026-02-18 Task 19 Decisions

### Decision: Toast API Compatibility
- Keep `showToast(message, type, duration)` as the primary signature and layer new behavior through optional object arguments to avoid touching existing callers.

### Decision: Error Taxonomy
- Standardize error categories to `validation`, `network`, `server`, and `auth`, with optional explicit category override and keyword-based fallback detection.

### Decision: History Persistence Boundary
- Persist only error toasts and skip any toast containing credential-like patterns to satisfy "do not persist secrets" while retaining actionable failure history.
