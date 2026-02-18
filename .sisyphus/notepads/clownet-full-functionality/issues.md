# ClawNet Full Functionality - Issues

## 2026-02-17 Wave 1 Issues

### Open Issues
- None yet

### Resolved Issues
- None yet

### Known Blockers
- None

## 2026-02-18 Task 17 Execution Issues

### Resolved
- `lsp_diagnostics` could not run for `.ejs` files because no EJS language server is configured in this environment.
- `npm test` initially failed with server startup timeouts due to stale Node listeners on ports 3334/3335.
- Resolved by identifying listeners via `lsof` and terminating stale PIDs, then rerunning tests to green.

## 2026-02-18 Task 17 Follow-up Issues

### Open
- `npm test` currently fails in this workspace on `v3.5-feature-tests.js` with a shared-memory phase timeout under the active 10-test `tests/run-all.js` suite.

### Resolved
- Dashboard render 500 (`secret is not defined`) was resolved by adding safe secret fallbacks in docs/settings partials.

## 2026-02-18 Task 18 Shared Memory Evidence Issues

### Resolved
- No shared-memory handler changes were required for evidence capture; ACK response shapes already matched `{ success, data?, error? }`.
- Full `npm test` suite was stabilized by pre-killing stale listeners on ports 3334/3335/3338 before running tests.

### Open
- None identified in shared-memory scope.

## 2026-02-18 Task 18 Credentials Scope Issues

### Resolved
- Full `npm test` initially failed from stale listeners causing server startup timeouts; resolved by terminating listeners on test ports before rerunning the suite.
- Credentials v3.5 feature tests initially failed due to ACK schema drift (`data` envelope only); resolved by returning both canonical `data` and legacy top-level credential fields for backward compatibility.

## 2026-02-18 Task 19 Error Toast Notifications

### Resolved
- `lsp_diagnostics` cannot verify `.ejs` files in this environment because no EJS language server is configured; verification proceeded with manual review plus full `npm test` run.

## 2026-02-18 Task 2 Access Token Validation Endpoint

### Resolved
- `POST /api/auth/token` initially returned `404` in RED phase because auth routes existed but were not registered in `src/server.js`.
- Auth token issue/revoke initially returned `500` after route registration due to `logger.event(...)` calls to a non-existent logger API; resolved by switching to `logger.logAuditEvent(...)` with `AUDIT_EVENT_TYPES`.
- Suite stability risk from stale fixed-port listeners remains real; pre-killing ports `3334/3335/3338` before `npm test` produced clean execution.

### Open
- `lsp_diagnostics` reports TypeScript CommonJS conversion hints (`80001`) on changed JS files; these are informational and align with repository-wide CommonJS conventions.

## 2026-02-18 Task: Socket JWT Handshake Fallback

### Resolved
- New Socket.IO JWT handshake test in `tests/auth.test.js` failed in RED phase with `Unauthorized`, confirming middleware gap.
- Full `npm test` initially failed with startup timeouts when stale listeners were present on fixed ports (`3334/3335/3338`); resolved by killing stale listeners before rerunning.

### Open
- None in task scope.

## 2026-02-18 Task 24 Load Testing

### Resolved
- Added dedicated load script at `tests/load/connection-load.js` to avoid depending on external binaries (`k6`/`autocannon`) or package changes.
- Eliminated fixed-port collision risk by using ephemeral server port selection for each load run.
- Ensured full cleanup by disconnecting all sockets and terminating spawned server process with SIGTERM/SIGKILL fallback.

### Open
- Throughput metric is currently ACK completion speed for `latency_ping`; it is good for comparative baselines but not a full end-to-end command execution benchmark.
