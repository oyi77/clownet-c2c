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

## 2026-02-18 Wave 4: Task 17 Scrollable Dashboard Sections

### Implementation Notes (Task 17)
- Converted main dashboard content wrapper to `overflow-hidden min-h-0` so each tab owns scroll behavior independently.
- Intel chat panel now uses `min-h-0`/`overflow-hidden` composition with a dedicated `#chat-box` scroller and fixed header block.
- Chat stick-to-bottom behavior now snapshots near-bottom state before appending; incoming text no longer yanks users who have scrolled up.
- Fleet tab uses dedicated `#fleet-scroll-container` plus top/bottom spacer elements for windowed rendering.
- Fleet rendering now virtualizes at `>= 80` agents with row overscan and stable spacer heights based on row count.
- Fleet card actions now use delegated click handling on `#fleet-grid` so rerenders do not drop handlers.
- Logs tab keeps independent panel scroll containers and auto-scroll toggle behavior with clamp-based scroll restoration when toggle is off.
- Existing visual language/layout was preserved; changes were limited to overflow/min-height structure and scripting behavior.

## 2026-02-18 Task 17 Scope Correction Notes
- Removed chat pending/delivery UI indicators and retained only near-bottom snapshot gating + auto-scroll-to-bottom behavior.
- Reduced fleet script scope to virtualization/windowing + delegated agent-action handling; replaced unrelated pending-client and connection-feed handlers with no-op stubs for compatibility with existing socket bindings.
- Added HTML escaping for fleet string-template interpolations to avoid unsafe rendering when bypassing EJS auto-escape.
- Passed `secret` explicitly into Docs/Settings partial includes from dashboard template to prevent server-side render failures during dashboard tests without touching out-of-scope files.

## 2026-02-18 Task 18 Shared-Memory Timeout Fix
- Root cause was twofold: v3.5 feature tests used Socket.IO `query.secret` auth while server middleware only accepts `handshake.auth.token`, and shared-memory handlers did not consistently invoke ack callbacks with `success` payloads.
- Updated `tests/v3.5-feature-tests.js` client connections to use `auth: { token, agent_id, role }`, added bounded ack helper/timeouts to prevent indefinite waits, and aligned per-feature payload shapes to current socket handlers.
- Updated `src/socket/shared-memory.js` to support callback ack semantics for set/delete and normalized callback responses for set/get/list/delete as `{ success, data|error }`, eliminating the Shared Memory section hang.

## 2026-02-18 Task 18 Shared Memory Evidence
- Reliable evidence capture for socket handlers works best via a dedicated short-lived server process and explicit ACK wrappers with per-event timeouts.
- TTL behavior in `get_shared_memory` expires lazily on read: waiting >1s then calling `get_shared_memory` returns `{ success: false, error: 'Key expired' }` and clears the key.
- Deletion evidence after expiry is most stable when using a fresh key owned by the same `agent_id`, which avoids permission and missing-key ambiguity.

## 2026-02-18 Task 18 Credentials Encryption Scope
- Credentials handlers now use uniform ACK envelopes (`{ success: true, data }` / `{ success: false, error }`) while preserving legacy top-level fields for compatibility with existing v3.5 feature tests.
- Encryption keying is now secret-derived only: AES-256-CBC key is a SHA-256 digest of `CLAWNET_SECRET_KEY`, removing insecure hardcoded fallback keys.
- Credential listings intentionally return metadata only (`service`, `owner`, `sharedWith`, `timestamp`) and exclude plaintext or encrypted blobs.
- Share/revoke handlers now return explicit ACK results (`addedAgents`/`removedAgents`) to make permission changes verifiable in bounded client flows.

## 2026-02-18 Task 18 Roles Evidence
- Roles Socket.IO evidence run confirmed auth must be sent via ; role flow succeeded end-to-end with bounded 2500ms ACK waits.
- Verified sequence:  ->  ->  ->  ->  ->  -> , with post-remove and post-delete checks to prove state cleanup.
- Reliable cleanup pattern: spawn relay on an ephemeral free port and always SIGTERM/SIGKILL-guard the child process in  to avoid stale listener interference.
### Correction (quoted event names)
- Roles Socket.IO evidence run confirmed auth must be sent via handshake.auth.token; role flow succeeded end-to-end with bounded 2500ms ACK waits.
- Verified sequence: create_role -> list_roles -> assign_role_to_agent -> get_agent_roles -> get_agents_by_role -> remove_role_from_agent -> delete_role, with post-remove and post-delete checks to prove state cleanup.
- Reliable cleanup pattern: spawn relay on an ephemeral free port and always SIGTERM/SIGKILL-guard the child process in finally blocks to avoid stale listener interference.
- Full npm test verification can fail nondeterministically when stale listeners already occupy 3334/3335/3338; pre-checking and clearing those ports before running the suite produced a clean 10/10 pass.

## 2026-02-18 Task 18 Orchestration Evidence
- In `report_task_result`, the guard `!payload.taskIndex` treats index `0` as invalid, so direct reporting for the first task is ignored; evidence runs need a workaround when proving `orchestration_completed` without changing production code.
- For reliable verification runs, kill stale `node .../server.js` listeners on fixed test ports before `npm test`, otherwise startup timeout tests can leave additional orphaned listeners and cascade failures.
- 2026-02-18: Task 18 verification gotcha: fixed-port tests (3334/3335/3338) can fail with startup timeout when stale node server.js listeners already occupy those ports; clear listeners before rerunning npm test.

## 2026-02-18 Task 19 Error Toast Notifications
- Backward-compatible `showToast(message, type, duration)` can be extended safely by accepting object-based overrides in `duration` or `options` while preserving existing call sites.
- Toast rendering should avoid `innerHTML`; DOM node creation with `textContent` prevents message/details injection issues in mixed user/server error strings.
- Persisting only sanitized error toasts (with secret/token pattern filtering and truncation) provides usable local history without storing sensitive values.
- Lightweight history UX can live beside `#toast-container` (toggle + panel + clear) with zero backend changes and no dependency additions.

## 2026-02-18 Task 2 Access Token Validation Endpoint
- Auth routes were implemented in `src/routes/auth.js` but were unreachable until `authRoutes.register(fastify)` was added to `src/server.js`.
- `/api/auth/token` now supports secret-only issuance with a per-IP in-memory sliding window (`>10` requests in `60s` => `429`) and a generic error response to avoid signaling secret validity.
- JWT invalidation is now hash-based in `src/middleware/auth.js` (SHA-256 token digest keys) so raw tokens are not retained in memory.
- `POST /api/auth/verify` now returns a strict validity contract (`200 { valid: true, ... }` or `401 { valid: false }`) and revoke flow is available on both `/api/auth/revoke` and `/api/auth/logout`.
- Reliable auth API tests should start an isolated `node server.js` process, wait for `listening`, and clear fixed ports before execution to avoid stale listener flakes.

## 2026-02-18 Task: Socket JWT Handshake Fallback
- Root cause of dashboard Socket.IO `Unauthorized` was middleware in `src/socket/index.js` only accepting legacy tenant tokens via `resolveTenant(token)`.
- Minimal, safe fix is a fallback to `verifyToken(token)` only when legacy resolution fails, then deriving tenant from `decoded.tenantId` (defaulting to `default` when absent).
- TDD regression in `tests/auth.test.js` is stable when it mints a JWT via `POST /api/auth/token` and connects with `socket.io-client` using `auth: { token, agent_id: 'master-ui', role: 'master' }`.
- Fixed-port suite reliability still depends on clearing stale listeners (`3334/3335/3338`) before full `npm test` runs.

## 2026-02-18 Task 13 `/shells` command
- Implementing `/shells` directly in `src/socket/shell.js` via an additional `chat` listener avoids changing global chat routing while preserving existing `/exec` and room/DM behavior.
- Safe parsing pattern is `payload.msg` then `payload.message`, requiring string type checks before command matching to avoid bad-payload crashes.
- Returning shell session listings with `socket.emit('chat_update', ...)` keeps responses requester-local (not broadcast to masters room), satisfying DM-only behavior for command output.
- Tenant isolation remains automatic when listing from the per-tenant `sessions` map captured in `register(io, socket, ctx)`.

## 2026-02-18 Task 24 Load Testing
- Ephemeral port allocation via `http.createServer().listen(0)` avoided stale-listener flakes from fixed test ports and kept load runs isolated.
- For Socket.IO auth consistency under load, every client must send `auth: { token, agent_id, role }`; this allows fleet registration and shell routing checks in one run.
- `latency_ping` ACKs are a low-flake way to benchmark message throughput because the event is always registered in `src/socket/index.js` and returns bounded ack payloads.
- Optional shell validation under load is reliable when one connected worker acks `shell_start` and master sends `shell_stop` cleanup immediately after session creation.
- Evidence capture is most useful when script writes structured JSON with per-check pass flags, error rate, p95 latency, and server RSS delta.

## 2026-02-18 Task 4 Secret Exposure Removal (Dashboard Templates)
- `views/dashboard.ejs` should not derive or thread `locals.secret` into partials; include Docs/Settings partials without secret props to prevent accidental template leakage.
- `views/partials/_docs.ejs` can keep connection guidance by showing only `serverUrl` and moving auth guidance to env-variable instructions, while removing token display/copy UI entirely.
- `views/partials/_settings_tab.ejs` supports token rotation without rendering the current token value; removing the Current Token block eliminates direct secret exposure in DOM.
- Quick grep verification for `locals.secret`, `<%= secret %>`, and `dashboardSecret` across `views/*.ejs` is an effective guardrail before test execution.
- Full `npm test` remained green after template-only changes, confirming dashboard security hardening did not regress existing behavior.
