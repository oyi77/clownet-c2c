# ClawNet C2C v3.5 — Full Functionality Work Plan

## TL;DR

> **Quick Summary**: Implement comprehensive enhancements to ClawNet C2C to achieve full production readiness including all "Coming Soon" features, robust error handling, message redirection system, interactive shell capability, client self-healing, proper dashboard authentication, and scrollable content sections.
> 
> **Deliverables**: 
> - Fully functional dashboard with access token authentication
> - Interactive shell with real-time input/output streaming
> - Client self-healing with automatic reconnection and graceful degradation
> - Comprehensive error handling across all modules
> - Message/command redirection system (excluding /exec commands)
> - Scrollable content sections in dashboard UI
> - All "Coming Soon" features implemented
> 
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Auth middleware → Dashboard security → Shell system → Error handling → Client healing → UI refinements

---

## Context

### Original Request
User requested a concrete plan to achieve full functionality for ClawNet C2C with these requirements:
1. Implement all "Coming Soon" features
2. Handle all possible errors gracefully
3. Redirect all messages and commands into chat (except /exec)
4. Make interactive shell working
5. Client self-healing capability (never truly off unless admin says so)
6. Dashboard should request access token
7. Content section should be scrollable

### Interview Summary

**Key Discussions**:
- Current system uses Socket.IO for real-time communication
- Dashboard currently shows access code modal but doesn't properly validate server-side
- Client has basic reconnection logic but needs enhancement for true self-healing
- Interactive shell concept is referenced in code but not fully implemented
- Error handling exists at module level but needs comprehensive coverage

**Research Findings**:
- Dashboard authentication is client-side only (secret exposed in EJS template)
- Client reconnection uses Socket.IO native reconnection but limited to 10 attempts
- No interactive shell implementation found - only command dispatch via /exec
- Message redirection logic partially exists in chat.js but incomplete
- "Coming Soon" features need to be identified from UI elements

### Metis Review

**Identified Gaps (addressed)**:
- Dashboard authentication needs server-side validation
- Client reconnection should be unlimited with exponential backoff
- Interactive shell requires bidirectional streaming
- All error scenarios need try/catch with graceful degradation
- Content scrolling needs CSS overflow handling in dashboard

---

## Work Objectives

### Core Objective
Transform ClawNet C2C from functional prototype to production-ready system with complete feature set, robust error handling, self-healing infrastructure, and polished user experience.

### Concrete Deliverables
- `.sisyphus/plans/clownet-full-functionality.md` (this plan)
- Modified `src/routes/dashboard.js` with server-side token validation
- Modified `client.js` with self-healing and interactive shell capabilities
- New `src/socket/shell.js` module for interactive shell support
- New `src/socket/redirection.js` module for message/command routing
- Enhanced error handling across all modules
- Updated dashboard EJS templates with scrollable sections
- Comprehensive test suite covering all new functionality

### Definition of Done
- [ ] Dashboard requires valid access token (server-side validated)
- [ ] Client automatically reconnects with exponential backoff (unlimited retries)
- [ ] Interactive shell enables real-time bidirectional command execution
- [ ] All commands (except /exec) redirect through chat system
- [ ] All error scenarios handled gracefully with user feedback
- [ ] Dashboard content sections scroll properly
- [ ] All "Coming Soon" UI elements implemented with functionality
- [ ] All existing tests pass
- [ ] New tests added for self-healing, shell, and error handling

### Must Have
- Server-side dashboard authentication with access token
- Unlimited client reconnection with exponential backoff
- Interactive shell with PTY support
- Comprehensive error boundaries in all modules
- Message/command redirection pipeline
- Scrollable dashboard content areas

### Must NOT Have (Guardrails)
- No client-side-only authentication (secret hardcoded in template)
- No hard limits on reconnection attempts (except explicit admin shutdown)
- No blocking operations without timeout handling
- No unhandled promise rejections
- No memory leaks from event listeners
- No exposure of sensitive data in client-side code

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (existing test runner)
- **Automated tests**: Tests-after (existing tests should pass, new tests for new features)
- **Framework**: Node.js test runner with Cheerio for E2E

### QA Policy
Every task includes agent-executed QA scenarios (see TODO template below).
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

| Deliverable Type | Verification Tool | Method |
|------------------|-------------------|--------|
| Backend modules | Bash (Node.js REPL) | Import modules, test functions, verify exports |
| Client sidecar | Bash (Node.js) | Run client, verify connection, test reconnection |
| Dashboard auth | Playwright | Navigate dashboard, verify login required, test token validation |
| Interactive shell | interactive_bash | Start shell session, send commands, validate output |
| UI scroll | Playwright | Open dashboard, verify scrollable areas, test scrolling |

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — Authentication + Security):
├── Task 1: Server-side dashboard authentication middleware [quick]
├── Task 2: Access token validation API endpoint [quick]
├── Task 3: Enhanced security audit logging [quick]
└── Task 4: Remove secret exposure from dashboard template [quick]

Wave 2 (Client Self-Healing — Resilience):
├── Task 5: Unlimited reconnection with exponential backoff [unspecified-high]
├── Task 6: Graceful degradation mode for offline operation [unspecified-high]
├── Task 7: Client health monitoring and heartbeat improvements [quick]
├── Task 8: Admin shutdown command with proper cleanup [quick]
└── Task 9: Offline command queue with sync on reconnect [unspecified-high]

Wave 3 (Interactive Shell + Redirection):
├── Task 10: PTY-based interactive shell server module [deep]
├── Task 11: Bidirectional shell stream over Socket.IO [unspecified-high]
├── Task 12: Message/command redirection pipeline [unspecified-high]
├── Task 13: Shell session management and cleanup [unspecified-high]
└── Task 14: Command output streaming to chat [quick]

Wave 4 (Error Handling + UI):
├── Task 15: Comprehensive error boundary in server modules [unspecified-high]
├── Task 16: Client error handling with recovery [unspecified-high]
├── Task 17: Scrollable content sections in dashboard [visual-engineering]
├── Task 18: "Coming Soon" feature implementations [unspecified-high]
└── Task 19: Error toast notifications in UI [quick]

Wave 5 (Integration + Testing):
├── Task 20: Integration tests for auth flow [unspecified-high]
├── Task 21: Integration tests for client healing [unspecified-high]
├── Task 22: Integration tests for shell functionality [unspecified-high]
├── Task 23: E2E tests for dashboard workflows [visual-engineering]
└── Task 24: Load testing for concurrent connections [deep]
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|------------|--------|------|
| 1-4 | — | 5-24 | 1 |
| 5-9 | 4 | 10-24 | 2 |
| 10-14 | 9 | 15-24 | 3 |
| 15-19 | 14 | 20-24 | 4 |
| 20-24 | 19 | — | 5 |

### Agent Dispatch Summary

| Wave | # Parallel | Tasks → Agent Category |
|------|------------|----------------------|
| 1 | **4** | T1-T4 → `quick` |
| 2 | **5** | T5-T6 → `unspecified-high`, T7-T9 → `quick`, T9 → `unspecified-high` |
| 3 | **5** | T10 → `deep`, T11 → `unspecified-high`, T12 → `unspecified-high`, T13 → `unspecified-high`, T14 → `quick` |
| 4 | **5** | T15 → `unspecified-high`, T16 → `unspecified-high`, T17 → `visual-engineering`, T18 → `unspecified-high`, T19 → `quick` |
| 5 | **5** | T20-T21 → `unspecified-high`, T22 → `unspecified-high`, T23 → `visual-engineering`, T24 → `deep` |

---

## TODOs

- [ ] 1. Server-side dashboard authentication middleware

  **What to do**:
  - Create `src/middleware/auth.js` with JWT-based session validation
  - Add token generation endpoint: POST `/api/auth/token`
  - Add token validation middleware for dashboard routes
  - Implement session management with expiry
  - Add logout endpoint to invalidate tokens

  **Must NOT do**:
  - Do not expose secret key in any response
  - Do not allow token reuse after logout
  - Do not create sessions without expiry

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Security-critical module requiring careful implementation
  - **Skills**: [`git-master`]
    - `git-master`: Track changes for security audit trail

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Tasks 5-24 (all other work)
  - **Blocked By**: None

  **References**:
  - `src/auth.js:1-32` - Existing token resolution logic to build upon
  - `src/routes/dashboard.js:1-27` - Dashboard route to protect
  - `src/config.js:1-57` - Configuration patterns

  **Acceptance Criteria**:
  - [ ] Token generation creates valid JWT with 24h expiry
  - [ ] Dashboard route rejects requests without valid token
  - [ ] Token validation returns 401 for expired/invalid tokens
  - [ ] Logout invalidates token server-side

  **QA Scenarios**:
  ```
  Scenario: Token generation creates valid session
    Tool: Bash (Node.js REPL)
    Preconditions: Server running
    Steps:
      1. curl -X POST http://localhost:3000/api/auth/token -H "Content-Type: application/json" -d '{"secret": "very-secret-key-123"}'
      2. Extract token from response
      3. curl -b "token=<token>" http://localhost:3000/dashboard -w "%{http_code}"
    Expected Result: Token response includes JWT, dashboard returns 200
    Evidence: .sisyphus/evidence/task-1-token-generation.json

  Scenario: Invalid token rejected
    Tool: Bash (Node.js REPL)
    Preconditions: Server running
    Steps:
      1. curl -b "token=invalid-token" http://localhost:3000/dashboard -w "%{http_code}"
    Expected Result: HTTP 401 unauthorized
    Evidence: .sisyphus/evidence/task-1-invalid-token.json
  ```

  **Commit**: YES
  - Message: `feat(auth): add server-side dashboard authentication middleware`
  - Files: `src/middleware/auth.js`, `src/routes/auth.js`

---

- [ ] 2. Access token validation API endpoint

  **What to do**:
  - Create `src/routes/auth.js` with authentication endpoints
  - POST `/api/auth/token` - Generate access token from secret
  - POST `/api/auth/verify` - Validate token without side effects
  - POST `/api/auth/revoke` - Invalidate token (logout)
  - Add rate limiting to prevent brute force attacks
  - Store valid tokens in memory with metadata

  **Must NOT do**:
  - Do not allow token generation without secret
  - Do not store tokens in plaintext (use hash)
  - Do not reveal whether secret is valid or invalid in error messages

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward endpoint implementation
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `git-master`: Not needed for simple endpoint

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Tasks 5-24
  - **Blocked By**: None

  **References**:
  - `src/routes/api.js:1-50` - API route patterns
  - `src/auth.js:1-32` - Token resolution patterns

  **Acceptance Criteria**:
  - [ ] POST `/api/auth/token` returns JWT on valid secret
  - [ ] POST `/api/auth/verify` returns {valid: true/false}
  - [ ] POST `/api/auth/revoke` removes token from valid set
  - [ ] Rate limiting blocks >10 requests/minute from IP

  **QA Scenarios**:
  ```
  Scenario: Token endpoints function correctly
    Tool: Bash (Node.js REPL)
    Preconditions: Server running
    Steps:
      1. TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/token -H "Content-Type: application/json" -d '{"secret":"very-secret-key-123"}' | jq -r '.token')
      2. curl -s -X POST http://localhost:3000/api/auth/verify -H "Content-Type: application/json" -d "{\"token\":\"$TOKEN\"}"
      3. curl -s -X POST http://localhost:3000/api/auth/revoke -H "Content-Type: application/json" -d "{\"token\":\"$TOKEN\"}"
      4. curl -s -X POST http://localhost:3000/api/auth/verify -H "Content-Type: application/json" -d "{\"token\":\"$TOKEN\"}"
    Expected Result: Token verified, then revoked, then invalid
    Evidence: .sisyphus/evidence/task-2-auth-flow.json
  ```

  **Commit**: YES
  - Message: `feat(auth): add authentication API endpoints`
  - Files: `src/routes/auth.js`

---

- [ ] 3. Enhanced security audit logging

  **What to do**:
  - Extend `src/utils/logger.js` with audit-specific logging
  - Log all authentication attempts (success/failure)
  - Log token generation, verification, and revocation events
  - Add security event types: AUTH_SUCCESS, AUTH_FAILURE, TOKEN_GENERATED, TOKEN_REVOKED
  - Include metadata: IP address, user agent, timestamp

  **Must NOT do**:
  - Do not log sensitive data (passwords, full tokens)
  - Do not create performance bottlenecks in logging path
  - Do not lose audit logs on server restart

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple extension of existing logger
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `git-master`: Not needed for logging enhancement

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Tasks 5-24
  - **Blocked By**: None

  **References**:
  - `src/utils/logger.js:1-50` - Existing logger implementation

  **Acceptance Criteria**:
  - [ ] Auth events logged with type, IP, timestamp
  - [ ] Failed auth attempts logged with reason
  - [ ] Audit log accessible via `/api/logs/audit` endpoint

  **QA Scenarios**:
  ```
  Scenario: Security events logged correctly
    Tool: Bash (Node.js REPL)
    Preconditions: Server running, logger implemented
    Steps:
      1. curl -X POST http://localhost:3000/api/auth/token -H "Content-Type: application/json" -d '{"secret":"wrong-secret"}'
      2. curl -X POST http://localhost:3000/api/auth/token -H "Content-Type: application/json" -d '{"secret":"very-secret-key-123"}'
      3. curl http://localhost:3000/api/logs/audit
    Expected Result: Both attempts logged, correct secret shows success
    Evidence: .sisyphus/evidence/task-3-audit-log.json
  ```

  **Commit**: YES
  - Message: `feat(audit): add security audit logging`
  - Files: `src/utils/logger.js`

---

- [ ] 4. Remove secret exposure from dashboard template

  **What to do**:
  - Remove `secret: process.env.CLAWNET_SECRET_KEY` from dashboard EJS context
  - Modify dashboard route to require authentication
  - Update `_scripts_core.ejs` to use API-based token validation
  - Show login modal on unauthenticated access
  - Store token in sessionStorage instead of exposing secret

  **Must NOT do**:
  - Do not pass secret to client-side under any circumstances
  - Do not allow dashboard access without proper authentication
  - Do not cache authenticated state in localStorage (use sessionStorage)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple security improvement
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `git-master`: Not needed for template update

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: Tasks 5-24
  - **Blocked By**: None

  **References**:
  - `views/partials/_scripts_core.ejs:83-168` - Client-side auth logic
  - `src/routes/dashboard.js:1-27` - Dashboard route

  **Acceptance Criteria**:
  - [ ] Dashboard view source shows no secret key
  - [ ] Login modal appears immediately on dashboard load
  - [ ] Token stored in sessionStorage, not localStorage

  **QA Scenarios**:
  ```
  Scenario: Dashboard secret not exposed
    Tool: Playwright
    Preconditions: Server running
    Steps:
      1. Navigate to http://localhost:3000/dashboard
      2. View page source
      3. Search for "very-secret-key-123" or "CLAWNET_SECRET"
    Expected Result: No secret found in page source
    Evidence: .sisyphus/evidence/task-4-no-secret.png

  Scenario: Login required before access
    Tool: Playwright
    Preconditions: Server running, no existing session
    Steps:
      1. Clear all storage
      2. Navigate to http://localhost:3000/dashboard
      3. Check if login modal is visible
    Expected Result: Login modal visible immediately
    Evidence: .sisyphus/evidence/task-4-login-required.png
  ```

  **Commit**: YES
  - Message: `fix(security): remove secret exposure from dashboard template`
  - Files: `src/routes/dashboard.js`, `views/partials/_scripts_core.ejs`

---

- [ ] 5. Unlimited reconnection with exponential backoff

  **What to do**:
  - Modify `client.js` reconnection configuration:
    - Remove `reconnectionAttempts: 10` limit
    - Implement custom exponential backoff: 1s, 2s, 4s, 8s, max 30s
    - Add reconnection state tracking
    - Emit reconnection events to server for monitoring
  - Add connection quality metrics (ping, latency)
  - Implement jitter to prevent thundering herd

  **Must NOT do**:
  - Do not spam server with reconnection attempts
  - Do not block indefinitely on reconnect (cap at reasonable max)
  - Do not lose commands during reconnection window

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Complex reconnection logic with state management
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `git-master`: Track client.js changes

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Wave 1)
  - **Parallel Group**: Wave 2 (with Tasks 6, 7, 8, 9)
  - **Blocks**: Tasks 10-24
  - **Blocked By**: Tasks 1-4

  **References**:
  - `client.js:32-38` - Socket.IO connection configuration
  - `client.js:105-109` - Heartbeat implementation

  **Acceptance Criteria**:
  - [ ] Client reconnects indefinitely until admin shutdown
  - [ ] Backoff follows exponential pattern: 1s, 2s, 4s, 8s... max 30s
  - [ ] Reconnection status logged and visible to admin
  - [ ] Commands queued during disconnection delivered on reconnect

  **QA Scenarios**:
  ```
  Scenario: Unlimited reconnection with exponential backoff
    Tool: interactive_bash (tmux)
    Preconditions: Server running, client connected
    Steps:
      1. Start client in tmux session
      2. Kill server temporarily (30 seconds)
      3. Restart server
      4. Monitor client reconnection timing
    Expected Result: Client reconnects after server restart with escalating backoff
    Evidence: .sisyphus/evidence/task-5-reconnection.log

  Scenario: Reconnection state visible
    Tool: Bash (curl)
    Preconditions: Client running, connected
    Steps:
      1. tail -f client logs during reconnection
    Expected Result: Log shows backoff progression
    Evidence: .sisyphus/evidence/task-5-backoff-sequence.log
  ```

  **Commit**: YES
  - Message: `feat(client): implement unlimited reconnection with exponential backoff`
  - Files: `client.js`

---

- [ ] 6. Graceful degradation mode for offline operation

  **What to do**:
  - Implement offline mode when server unavailable
  - Queue all commands in localStorage with persistence
  - Sync queued commands when connection restored
  - Show offline indicator in client output
  - Implement command deduplication on sync

  **Must NOT do**:
  - Do not lose commands when client restarts offline
  - Do not execute queued commands twice on reconnect
  - Do not block client shutdown when offline queue exists

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Offline data persistence and sync logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Wave 1)
  - **Parallel Group**: Wave 2 (with Tasks 5, 7, 8, 9)
  - **Blocks**: Tasks 10-24
  - **Blocked By**: Tasks 1-4

  **References**:
  - `src/socket/dispatch.js:10-11` - Offline queue concept
  - `client.js:40-54` - Command handling patterns

  **Acceptance Criteria**:
  - [ ] Commands queued when offline persist across client restarts
  - [ ] Commands sync to server when connection restored
  - [ ] Duplicate commands detected and skipped
  - [ ] Offline/online status visible to user

  **QA Scenarios**:
  ```
  Scenario: Offline command queue persistence
    Tool: interactive_bash (tmux)
    Preconditions: Client started, server stopped
    Steps:
      1. Send command via client while server down
      2. Check localStorage for queued command
      3. Restart server
      4. Verify command delivered and response received
    Expected Result: Command delivered after server restart
    Evidence: .sisyphus/evidence/task-6-offline-queue.json

  Scenario: Command deduplication
    Tool: interactive_bash (tmux)
    Preconditions: Client connected, server running
    Steps:
      1. Queue multiple identical commands offline
      2. Restore connection
      3. Check server task log
    Expected Result: Only one command executed
    Evidence: .sisyphus/evidence/task-6-deduplication.json
  ```

  **Commit**: YES
  - Message: `feat(client): implement offline mode with command queue and sync`
  - Files: `client.js`

---

- [ ] 7. Client health monitoring and heartbeat improvements

  **What to do**:
  - Enhance status report with more metrics (disk, network, process info)
  - Add health check endpoint in client: `/health` for self-diagnosis
  - Implement graceful shutdown handler for SIGTERM/SIGINT
  - Add memory usage monitoring with warning threshold
  - Report client version and capability negotiation

  **Must NOT do**:
  - Do not expose internal paths or sensitive system info
  - Do not block main event loop with health checks
  - Do not ignore shutdown signals

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Incremental enhancement to existing reporting
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Wave 1)
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 8, 9)
  - **Blocks**: Tasks 10-24
  - **Blocked By**: Tasks 1-4

  **References**:
  - `client.js:86-109` - Status reporting and heartbeat

  **Acceptance Criteria**:
  - [ ] Status report includes memory, disk, network metrics
  - [ ] Client responds to SIGTERM with graceful shutdown
  - [ ] Health check accessible via `curl http://localhost:9229/health` (if enabled)
  - [ ] Warning logged when memory exceeds 80%

  **QA Scenarios**:
  ```
  Scenario: Enhanced status reporting
    Tool: Bash (Node.js REPL)
    Preconditions: Client running
    Steps:
      1. Trigger /status command on client
      2. Parse response for memory, disk, network info
    Expected Result: Status includes all enhanced metrics
    Evidence: .sisyphus/evidence/task-7-enhanced-status.json

  Scenario: Graceful shutdown handling
    Tool: interactive_bash (tmux)
    Preconditions: Client running
    Steps:
      1. Send SIGTERM to client process
      2. Monitor shutdown sequence in logs
    Expected Result: Client closes connections, saves state, exits cleanly
    Evidence: .sisyphus/evidence/task-7-shutdown.log
  ```

  **Commit**: YES
  - Message: `feat(client): enhance health monitoring and graceful shutdown`
  - Files: `client.js`

---

- [ ] 8. Admin shutdown command with proper cleanup

  **What to do**:
  - Implement `/shutdown` command for admin-initiated client stop
  - Add confirmation requirement for shutdown (prevent accidental)
  - Perform cleanup before exit: save state, close connections, notify server
  - Add `/restart` command with automatic restart (using process.exec)
  - Log shutdown/restart events to server audit trail

  **Must NOT do**:
  - Do not allow non-admin users to shutdown clients
  - Do not shutdown without saving state first
  - Do not leave dangling connections on shutdown

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Command implementation with cleanup logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Wave 1)
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 7, 9)
  - **Blocks**: Tasks 10-24
  - **Blocked By**: Tasks 1-4

  **References**:
  - `client.js:208-212` - Existing restart logic

  **Acceptance Criteria**:
  - [ ] `/shutdown` command requires confirmation
  - [ ] Cleanup performed before process exit
  - [ ] Server notified of shutdown event
  - [ ] `/restart` command works reliably

  **QA Scenarios**:
  ```
  Scenario: Admin shutdown with cleanup
    Tool: interactive_bash (tmux)
    Preconditions: Client running, connected
    Steps:
      1. Send /shutdown command via chat
      2. Monitor client shutdown sequence
      3. Check server audit log for shutdown event
    Expected Result: Client cleans up and exits gracefully
    Evidence: .sisyphus/evidence/task-8-shutdown.log

  Scenario: Restart command
    Tool: interactive_bash (tmux)
    Preconditions: Client running
    Steps:
      1. Send /restart command
      2. Wait for new client process to start
      3. Verify connection established
    Expected Result: Client restarts and reconnects
    Evidence: .sisyphus/evidence/task-8-restart.log
  ```

  **Commit**: YES
  - Message: `feat(client): implement admin shutdown with proper cleanup`
  - Files: `client.js`

---

- [ ] 9. Offline command queue with sync on reconnect

  **What to do**:
  - Implement persistent command queue using localStorage
  - Track queue state: pending, sent, acknowledged, failed
  - Implement automatic sync when connection restored
  - Add command timeout with retry logic
  - Provide queue status via `/queue` command

  **Must NOT do**:
  - Do not lose commands on client restart
  - Do not block on slow commands (implement timeout)
  - Do not expose queue details to unauthorized users

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Complex queue management and sync logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Wave 1)
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 7, 8)
  - **Blocks**: Tasks 10-24
  - **Blocked By**: Tasks 1-4

  **References**:
  - `client.js:40-54` - Command deduplication pattern
  - `src/socket/dispatch.js:10-11` - Server-side offline queue

  **Acceptance Criteria**:
  - [ ] Commands survive client restart when offline
  - [ ] Queue syncs automatically on reconnect
  - [ ] Failed commands retry 3 times then marked failed
  - [ ] `/queue` command shows pending commands

  **QA Scenarios**:
  ```
  Scenario: Queue survives client restart
    Tool: interactive_bash (tmux)
    Preconditions: Client offline with queued commands
    Steps:
      1. Kill client process
      2. Restart client
      3. Connect to server
      4. Verify queued commands delivered
    Expected Result: Commands delivered after restart
    Evidence: .sisyphus/evidence/task-9-queue-survival.json

  Scenario: Command retry on timeout
    Tool: Bash (Node.js REPL)
    Preconditions: Client connected
    Steps:
      1. Send long-running command with short timeout
      2. Verify retry behavior
    Expected Result: Command retried then marked failed
    Evidence: .sisyphus/evidence/task-9-retry.json
  ```

  **Commit**: YES
  - Message: `feat(client): implement persistent offline command queue with sync`
  - Files: `client.js`

---

- [ ] 10. PTY-based interactive shell server module

  **What to do**:
  - Create `src/socket/shell.js` for interactive shell management
  - Use `node-pty` library for PTY support (add to dependencies)
  - Implement shell session creation/destruction
  - Handle window resize events
  - Implement proper cleanup on disconnect

  **Must NOT do**:
  - Do not allow unlimited concurrent shell sessions (cap per agent)
  - Do not expose PTY to unauthenticated connections
  - Do not allow shell access without proper authorization

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex PTY management and socket integration
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Wave 2)
  - **Parallel Group**: Wave 3 (with Tasks 11, 12, 13, 14)
  - **Blocks**: Tasks 15-24
  - **Blocked By**: Tasks 1-9

  **References**:
  - `src/socket/index.js:1-98` - Socket setup patterns
  - `src/socket/chat.js:1-50` - Message handling patterns

  **Acceptance Criteria**:
  - [ ] PTY shell created on demand
  - [ ] Shell session limits enforced (max 5 per agent)
  - [ ] Resize events forwarded to PTY
  - [ ] Proper cleanup on disconnect

  **QA Scenarios**:
  ```
  Scenario: Shell session creation
    Tool: Bash (Node.js REPL)
    Preconditions: Server running
    Steps:
      1. Create shell session via Socket.IO event
      2. Send test command "echo hello"
      3. Receive output
    Expected Result: Shell responds to commands
    Evidence: .sisyphus/evidence/task-10-shell-creation.log

  Scenario: Shell limits enforced
    Tool: Bash (Node.js REPL)
    Preconditions: Agent with existing shells
    Steps:
      1. Attempt to create 6th shell session
    Expected Result: 6th session rejected
    Evidence: .sisyphus/evidence/task-10-shell-limit.json
  ```

  **Commit**: YES
  - Message: `feat(shell): implement PTY-based interactive shell server`
  - Files: `src/socket/shell.js`, `package.json` (add node-pty)

---

- [ ] 11. Bidirectional shell stream over Socket.IO

  **What to do**:
  - Implement `shell_input` event for sending commands to PTY
  - Implement `shell_output` event for streaming PTY output
  - Add `shell_resize` event for terminal dimensions
  - Implement flow control to prevent backpressure issues
  - Add binary data handling for proper encoding

  **Must NOT do**:
  - Do not block main socket event loop with shell I/O
  - Do not lose output data on slow clients
  - Do not allow command injection through shell input

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Real-time data streaming and flow control
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Wave 2)
  - **Parallel Group**: Wave 3 (with Tasks 10, 12, 13, 14)
  - **Blocks**: Tasks 15-24
  - **Blocked By**: Tasks 1-9

  **References**:
  - `src/socket/chat.js:12-46` - Socket event patterns
  - `src/socket/dispatch.js:29-81` - Command dispatch patterns

  **Acceptance Criteria**:
  - [ ] Commands sent via `shell_input` execute in PTY
  - [ ] Output streamed via `shell_output` events
  - [ ] Terminal resize updates PTY dimensions
  - [ ] No data loss under normal conditions

  **QA Scenarios**:
  ```
  Scenario: Bidirectional shell communication
    Tool: interactive_bash (tmux)
    Preconditions: Shell session active
    Steps:
      1. Send "ls -la" via shell_input
      2. Receive output via shell_output
    Expected Result: Directory listing received correctly
    Evidence: .sisyphus/evidence/task-11-shell-stream.json

  Scenario: Terminal resize propagation
    Tool: Bash (Node.js REPL)
    Preconditions: Shell session active
    Steps:
      1. Send shell_resize with new dimensions
      2. Verify PTY dimensions updated
    Expected Result: Resize event handled
    Evidence: .sisyphus/evidence/task-11-resize.json
  ```

  **Commit**: YES
  - Message: `feat(shell): implement bidirectional shell streaming over Socket.IO`
  - Files: `src/socket/shell.js`

---

- [ ] 12. Message/command redirection pipeline

  **What to do**:
  - Create `src/socket/redirection.js` module
  - Intercept all messages before processing
  - Route non-/exec commands through chat system
  - Implement command aliasing and expansion
  - Add message transformation pipeline (markdown, formatting)

  **Must NOT do**:
  - Do not intercept /exec commands (bypass redirection)
  - Do not modify commands without explicit user intent
  - Do not create infinite redirect loops

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Message routing and transformation logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Wave 2)
  - **Parallel Group**: Wave 3 (with Tasks 10, 11, 13, 14)
  - **Blocks**: Tasks 15-24
  - **Blocked By**: Tasks 1-9

  **References**:
  - `src/socket/chat.js:12-46` - Message handling patterns
  - `src/socket/dispatch.js:29-81` - Command dispatch patterns

  **Acceptance Criteria**:
  - [ ] All commands except /exec appear in chat history
  - [ ] Command responses sent back via chat
  - [ ] Alias expansion works correctly
  - [ ] No /exec commands leak into chat

  **QA Scenarios**:
  ```
  Scenario: Command redirection to chat
    Tool: Bash (Node.js REPL)
    Preconditions: Server running, client connected
    Steps:
      1. Send /status command from master-ui
      2. Check chat history for command and response
    Expected Result: Both command and response in chat
    Evidence: .sisyphus/evidence/task-12-redirection.json

  Scenario: /exec bypasses redirection
    Tool: Bash (Node.js REPL)
    Preconditions: Server running, client connected
    Steps:
      1. Send /exec echo test command
      2. Check chat history
    Expected Result: /exec command NOT in chat (direct execution only)
    Evidence: .sisyphus/evidence/task-12-exec-bypass.json
  ```

  **Commit**: YES
  - Message: `feat(redirection): implement message/command redirection pipeline`
  - Files: `src/socket/redirection.js`, `src/socket/index.js` (register handler)

---

- [ ] 13. Shell session management and cleanup

  **What to do**:
  - Implement session lifecycle management (create, resume, destroy)
  - Add session timeout (inactive shells close after 1 hour)
  - Implement session persistence (reconnect to existing shell)
  - Add session listing command (`/shells` shows active sessions)
  - Clean up zombie PTY processes

  **Must NOT do**:
  - Do not leak PTY processes on client disconnect
  - Do not allow session hijacking (validate ownership)
  - Do not persist shells across server restart

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Session state management and cleanup
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Wave 2)
  - **Parallel Group**: Wave 3 (with Tasks 10, 11, 12, 14)
  - **Blocks**: Tasks 15-24
  - **Blocked By**: Tasks 1-9

  **References**:
  - `src/socket/rooms.js:1-50` - Session management patterns
  - `src/socket/fleet.js:1-61` - Agent state management

  **Acceptance Criteria**:
  - [ ] Shell sessions have 1-hour inactivity timeout
  - [ ] `/shells` lists active sessions
  - [ ] PTY processes cleaned up on disconnect
  - [ ] Session ownership enforced

  **QA Scenarios**:
  ```
  Scenario: Shell session timeout
    Tool: Bash (Node.js REPL)
    Preconditions: Shell session inactive for >1 hour
    Steps:
      1. Wait for timeout
      2. Attempt to send input to shell
    Expected Result: Shell closed, error returned
    Evidence: .sisyphus/evidence/task-13-timeout.json

  Scenario: Session listing
    Tool: Bash (Node.js REPL)
    Preconditions: Multiple shell sessions active
    Steps:
      1. Send /shells command
      2. Parse response
    Expected Result: List of all active shells with metadata
    Evidence: .sisyphus/evidence/task-13-session-list.json
  ```

  **Commit**: YES
  - Message: `feat(shell): implement shell session management and cleanup`
  - Files: `src/socket/shell.js`

---

- [ ] 14. Command output streaming to chat

  **What to do**:
  - Redirect shell output to chat messages
  - Implement output buffering (send complete lines)
  - Add markdown formatting for command output
  - Implement output pagination for long results
  - Add special handling for error output (red coloring)

  **Must NOT do**:
  - Do not flood chat with tiny output chunks
  - Do not truncate output without indication
  - Do not mix outputs from concurrent commands

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Output formatting and streaming
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `git-master`: Not needed for output formatting

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Wave 2)
  - **Parallel Group**: Wave 3 (with Tasks 10, 11, 12, 13)
  - **Blocks**: Tasks 15-24
  - **Blocked By**: Tasks 1-9

  **References**:
  - `src/socket/chat.js:12-46` - Chat message patterns
  - `client.js:146-159` - Response sending patterns

  **Acceptance Criteria**:
  - [ ] Shell output appears in chat as formatted messages
  - [ ] Long outputs paginated or scrollable
  - [ ] Errors shown with visual distinction
  - [ ] Command echo shown in chat before output

  **QA Scenarios**:
  ```
  Scenario: Shell output in chat
    Tool: Playwright
    Preconditions: Dashboard connected, shell session active
    Steps:
      1. Send command through shell
      2. Check chat panel for output
    Expected Result: Output appears as chat message
    Evidence: .sisyphus/evidence/task-14-output-chat.png

  Scenario: Error output distinction
    Tool: Playwright
    Preconditions: Shell session active
    Steps:
      1. Send command that produces error
      2. Check visual appearance of error message
    Expected Result: Error shown with red/error styling
    Evidence: .sisyphus/evidence/task-14-error-output.png
  ```

  **Commit**: YES
  - Message: `feat(shell): implement command output streaming to chat`
  - Files: `src/socket/shell.js`, `src/socket/chat.js`

---

- [ ] 15. Comprehensive error boundary in server modules

  **What to do**:
  - Wrap all socket event handlers in try/catch
  - Implement error event emission for client consumption
  - Add error logging with context (stack trace, event data)
  - Implement circuit breaker pattern for failing operations
  - Add health check endpoint with component status

  **Must NOT do**:
  - Do not crash server on any error
  - Do not expose stack traces to clients
  - Do not ignore errors silently

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: System-wide error handling coverage
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Wave 3)
  - **Parallel Group**: Wave 4 (with Tasks 16, 17, 18, 19)
  - **Blocks**: Tasks 20-24
  - **Blocked By**: Tasks 1-14

  **References**:
  - `src/socket/index.js:38-92` - Socket connection handler
  - `src/socket/chat.js:12-46` - Chat handler

  **Acceptance Criteria**:
  - [ ] No unhandled promise rejections in server logs
  - [ ] Errors reported to connected clients via event
  - [ ] Circuit breaker triggers on repeated failures
  - [ ] Health endpoint shows all components operational

  **QA Scenarios**:
  ```
  Scenario: Error boundary catches exceptions
    Tool: Bash (Node.js REPL)
    Preconditions: Server running
    Steps:
      1. Send malformed event data to various handlers
      2. Check server logs for error handling
    Expected Result: Errors caught and logged, no crash
    Evidence: .sisyphus/evidence/task-15-error-boundary.json

  Scenario: Client receives error notification
    Tool: Playwright
    Preconditions: Dashboard connected
    Steps:
      1. Trigger error condition
      2. Watch for error toast/notification
    Expected Result: User notified of error
    Evidence: .sisyphus/evidence/task-15-client-notification.png
  ```

  **Commit**: YES
  - Message: `fix(error): add comprehensive error boundaries across all server modules`
  - Files: `src/socket/*.js` (all modules)

---

- [ ] 16. Client error handling with recovery

  **What to do**:
  - Wrap all client event handlers in try/catch
  - Implement error recovery: retry failed operations
  - Add error reporting to server (for admin visibility)
  - Implement command timeout with graceful failure
  - Add connection error detection and automatic recovery

  **Must NOT do**:
  - Do not crash client on any error
  - Do not lose command state on error
  - Do not hide errors from admin

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Client resilience and recovery patterns
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Wave 3)
  - **Parallel Group**: Wave 4 (with Tasks 15, 17, 18, 19)
  - **Blocks**: Tasks 20-24
  - **Blocked By**: Tasks 1-14

  **References**:
  - `client.js:275-315` - Event handlers
  - `client.js:161-273` - Instruction processing

  **Acceptance Criteria**:
  - [ ] No unhandled exceptions in client
  - [ ] Errors reported to server for admin visibility
  - [ ] Failed commands logged with error details
  - [ ] Client continues operating after errors

  **QA Scenarios**:
  ```
  Scenario: Client handles errors gracefully
    Tool: interactive_bash (tmux)
    Preconditions: Client running
    Steps:
      1. Trigger various error conditions (bad command, network issues)
      2. Monitor client behavior
    Expected Result: Client continues running, reports errors
    Evidence: .sisyphus/evidence/task-16-client-errors.log

  Scenario: Error recovery after failure
    Tool: interactive_bash (tmux)
    Preconditions: Client running, connected
    Steps:
      1. Simulate error condition
      2. Verify client still functional
      3. Test subsequent commands
    Expected Result: Commands work after recovery
    Evidence: .sisyphus/evidence/task-16-recovery.json
  ```

  **Commit**: YES
  - message: `fix(client): implement comprehensive error handling with recovery`
  - Files: `client.js`

---

- [ ] 17. Scrollable content sections in dashboard

  **What to do**:
  - Update dashboard CSS to enable overflow scrolling
  - Make chat panel scrollable with fixed header
  - Make fleet list scrollable with virtual scrolling for large fleets
  - Make logs panel scrollable with auto-scroll toggle
  - Implement smooth scrolling animations

  **Must NOT do**:
  - Do not break existing layout on small screens
  - Do not lose chat history when scrolling
  - Do not create scroll jank or performance issues

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI/CSS improvements
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Scroll behavior and layout optimization

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Wave 3)
  - **Parallel Group**: Wave 4 (with Tasks 15, 16, 18, 19)
  - **Blocks**: Tasks 20-24
  - **Blocked By**: Tasks 1-14

  **References**:
  - `views/dashboard.ejs:1-76` - Dashboard structure
  - `views/partials/_fleet_tab.ejs` - Fleet list UI
  - `views/partials/_ops_tab.ejs` - Operations panel

  **Acceptance Criteria**:
  - [ ] Chat panel scrolls with new messages at bottom
  - [ ] Fleet list scrolls independently
  - [ ] Logs panel scrolls with auto-scroll option
  - [ ] Scroll behavior smooth on all browsers

  **QA Scenarios**:
  ```
  Scenario: Chat panel scrolling
    Tool: Playwright
    Preconditions: Dashboard open with chat history
    Steps:
      1. Scroll chat panel
      2. Verify scroll behavior
      3. Send new message
    Expected Result: Chat scrolls, new messages visible
    Evidence: .sisyphus/evidence/task-17-chat-scroll.mp4

  Scenario: Fleet list scrolling
    Tool: Playwright
    Preconditions: Dashboard open, many agents connected
    Steps:
      1. Scroll fleet list
      2. Verify lazy loading
    Expected Result: List scrolls smoothly, loads efficiently
    Evidence: .sisyphus/evidence/task-17-fleet-scroll.mp4
  ```

  **Commit**: YES
  - Message: `feat(ui): implement scrollable content sections in dashboard`
  - Files: `views/partials/*.ejs` (update CSS classes)

---

- [ ] 18. "Coming Soon" feature implementations

  **What to do**:
  - Identify all "Coming Soon" UI elements in dashboard
  - Implement shared memory module: `src/socket/shared-memory.js` (already imported but unused)
  - Implement credentials module: `src/socket/credentials.js` (already imported but unused)
  - Implement file sharing module: `src/socket/file-sharing.js` (already imported but unused)
  - Implement orchestration module: `src/socket/orchestration.js` (already imported but unused)
  - Implement roles module: `src/socket/roles.js` (already imported but unused)
  - Implement auto-orchestration module: `src/socket/auto-orchestration.js` (already imported but unused)

  **Must NOT do**:
  - Do not implement features that don't match UI expectations
  - Do not create security vulnerabilities in new modules
  - Do not break existing functionality

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple modules to implement with consistent patterns
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Wave 3)
  - **Parallel Group**: Wave 4 (with Tasks 15, 16, 17, 19)
  - **Blocks**: Tasks 20-24
  - **Blocked By**: Tasks 1-14

  **References**:
  - `src/socket/index.js:8-15` - Module imports
  - `src/state.js:13-25` - State schema for each module

  **Acceptance Criteria**:
  - [ ] Shared memory: Key-value store with TTL support
  - [ ] Credentials: Encrypted credential storage and retrieval
  - [ ] File sharing: Binary file transfer via Socket.IO
  - [ ] Orchestration: Multi-agent task orchestration
  - [ ] Roles: Role-based access control
  - [ ] Auto-orchestration: Automatic load balancing

  **QA Scenarios**:
  ```
  Scenario: Shared memory operations
    Tool: Bash (Node.js REPL)
    Preconditions: Server running
    Steps:
      1. Set shared memory value with TTL
      2. Get value before expiry
      3. Wait for expiry and verify deletion
    Expected Result: Value stored, retrievable, auto-deleted after TTL
    Evidence: .sisyphus/evidence/task-18-shared-memory.json

  Scenario: File sharing transfer
    Tool: Playwright + Bash
    Preconditions: Dashboard open, two agents connected
    Steps:
      1. Agent A initiates file transfer to Agent B
      2. Agent B receives file
    Expected Result: File transferred successfully
    Evidence: .sisyphus/evidence/task-18-file-transfer.json
  ```

  **Commit**: YES
  - Message: `feat(features): implement all "Coming Soon" modules`
  - Files: `src/socket/shared-memory.js`, `src/socket/credentials.js`, `src/socket/file-sharing.js`, `src/socket/orchestration.js`, `src/socket/roles.js`, `src/socket/auto-orchestration.js`

---

- [ ] 19. Error toast notifications in UI

  **What to do**:
  - Enhance existing toast notification system
  - Add error type detection (validation, network, server, auth)
  - Implement retry action for actionable errors
  - Add error details expansion for advanced users
  - Persist errors in localStorage for later review

  **Must NOT do**:
  - Do not show sensitive error details to unauthorized users
  - Do not spam user with duplicate notifications
  - Do not block UI with blocking error dialogs

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: UI enhancement to existing system
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Toast design and behavior

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Wave 3)
  - **Parallel Group**: Wave 4 (with Tasks 15, 16, 17, 18)
  - **Blocks**: Tasks 20-24
  - **Blocked By**: Tasks 1-14

  **References**:
  - `views/partials/_scripts_core.ejs:11-25` - Existing toast system

  **Acceptance Criteria**:
  - [ ] Errors display as red toast notifications
  - [ ] Network errors show retry button
  - [ ] Server errors include correlation ID
  - [ ] Errors accessible via notification history

  **QA Scenarios**:
  ```
  Scenario: Error toast display
    Tool: Playwright
    Preconditions: Dashboard open
    Steps:
      1. Trigger error condition
      2. Observe toast notification
    Expected Result: Error toast appears with appropriate styling
    Evidence: .sisyphus/evidence/task-19-error-toast.png

  Scenario: Retry action on network error
    Tool: Playwright
    Preconditions: Dashboard open, simulate network error
    Steps:
      1. Trigger network error
      2. Observe retry button on toast
      3. Click retry
    Expected Result: Toast shows retry, action executes
    Evidence: .sisyphus/evidence/task-19-retry-toast.png
  ```

  **Commit**: YES
  - Message: `feat(ui): enhance error toast notifications with retry actions`
  - Files: `views/partials/_scripts_core.ejs`, `views/partials/_toast.ejs`

---

- [ ] 20. Integration tests for auth flow

  **What to do**:
  - Create `tests/auth.test.js` with test cases:
    - Token generation with valid secret
    - Token generation with invalid secret
    - Token verification (valid/invalid/expired)
    - Token revocation
    - Dashboard access with/without token
    - Rate limiting enforcement
  - Mock Socket.IO client for testing

  **Must NOT do**:
  - Do not test production secrets
  - Do not create tests that depend on external services
  - Do not leave test data in production

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Comprehensive test coverage for auth system
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `git-master`: Not needed for tests

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Wave 4)
  - **Parallel Group**: Wave 5 (with Tasks 21, 22, 23, 24)
  - **Blocked By**: Tasks 1-19

  **References**:
  - `tests/run-all.js` - Existing test runner
  - `tests/*.js` - Existing test patterns

  **Acceptance Criteria**:
  - [ ] All auth test cases pass
  - [ ] Test coverage >90% for auth module
  - [ ] Tests run in <10 seconds

  **QA Scenarios**:
  ```
  Scenario: Auth test suite execution
    Tool: Bash (npm test)
    Preconditions: All previous tasks complete
    Steps:
      1. npm test
      2. Check auth.test.js results
    Expected Result: All auth tests pass
    Evidence: .sisyphus/evidence/task-20-auth-tests.json
  ```

  **Commit**: YES
  - Message: `test(auth): add integration tests for authentication flow`
  - Files: `tests/auth.test.js`

---

- [ ] 21. Integration tests for client healing

  **What to do**:
  - Create `tests/client-healing.test.js` with test cases:
    - Reconnection with exponential backoff
    - Offline command queue persistence
    - Command deduplication on sync
    - Graceful shutdown and restart
    - Offline/online status transitions
  - Implement mock server for testing

  **Must NOT do**:
  - Do not create tests that require actual network latency
  - Do not test against production server
  - Do not create flaky tests

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Complex test scenarios for client resilience
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Wave 4)
  - **Parallel Group**: Wave 5 (with Tasks 20, 22, 23, 24)
  - **Blocked By**: Tasks 1-19

  **References**:
  - `tests/run-all.js` - Existing test runner
  - `tests/*.js` - Existing test patterns

  **Acceptance Criteria**:
  - [ ] All healing test cases pass
  - [ ] Test coverage >90% for client module
  - [ ] Tests run in <30 seconds (including mock server setup)

  **QA Scenarios**:
  ```
  Scenario: Client healing test suite execution
    Tool: Bash (npm test)
    Preconditions: All previous tasks complete
    Steps:
      1. npm test
      2. Check client-healing.test.js results
    Expected Result: All healing tests pass
    Evidence: .sisyphus/evidence/task-21-healing-tests.json
  ```

  **Commit**: YES
  - Message: `test(client): add integration tests for client self-healing`
  - Files: `tests/client-healing.test.js`

---

- [ ] 22. Integration tests for shell functionality

  **What to do**:
  - Create `tests/shell.test.js` with test cases:
    - Shell session creation and destruction
    - Command execution and output streaming
    - Terminal resize handling
    - Session limits enforcement
    - Concurrent shell sessions
    - Shell output redirection to chat
  - Implement PTY mocking for headless testing

  **Must NOT do**:
  - Do not run actual shell commands in tests
  - Do not create tests that hang on PTY operations
  - Do not test against real PTY in CI

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Complex testing for PTY interactions
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Wave 4)
  - **Parallel Group**: Wave 5 (with Tasks 20, 21, 23, 24)
  - **Blocked By**: Tasks 1-19

  **References**:
  - `tests/run-all.js` - Existing test runner
  - `tests/*.js` - Existing test patterns

  **Acceptance Criteria**:
  - [ ] All shell test cases pass
  - [ ] Test coverage >85% for shell module
  - [ ] Tests run in <30 seconds

  **QA Scenarios**:
  ```
  Scenario: Shell test suite execution
    Tool: Bash (npm test)
    Preconditions: All previous tasks complete
    Steps:
      1. npm test
      2. Check shell.test.js results
    Expected Result: All shell tests pass
    Evidence: .sisyphus/evidence/task-22-shell-tests.json
  ```

  **Commit**: YES
  - Message: `test(shell): add integration tests for interactive shell`
  - Files: `tests/shell.test.js`

---

- [ ] 23. E2E tests for dashboard workflows

  **What to do**:
  - Create `tests/e2e/dashboard.spec.js` with Playwright tests:
    - Login flow with valid/invalid tokens
    - Dashboard access after authentication
    - Fleet management workflow
    - Chat message sending and receiving
    - Shell session creation from UI
    - Error scenarios and recovery
  - Implement page object pattern for maintainability

  **Must NOT do**:
  - Do not take screenshots in tests (slow)
  - Do not create brittle selectors
  - Do not test without proper cleanup

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: End-to-end browser testing
  - **Skills**: [`playwright`]
    - `playwright`: Browser automation for E2E tests

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Wave 4)
  - **Parallel Group**: Wave 5 (with Tasks 20, 21, 22, 24)
  - **Blocked By**: Tasks 1-19

  **References**:
  - `tests/run-all.js` - Existing test runner
  - `tests/*.js` - Existing test patterns

  **Acceptance Criteria**:
  - [ ] All E2E test cases pass
  - [ ] Tests cover main user workflows
  - [ ] Tests run in <60 seconds

  **QA Scenarios**:
  ```
  Scenario: Dashboard E2E test execution
    Tool: Playwright
    Preconditions: All previous tasks complete, server running
    Steps:
      1. npm test
      2. Check e2e/dashboard.spec.js results
    Expected Result: All E2E tests pass
    Evidence: .sisyphus/evidence/task-23-e2e-tests.json
  ```

  **Commit**: YES
  - Message: `test(e2e): add end-to-end tests for dashboard workflows`
  - Files: `tests/e2e/dashboard.spec.js`

---

- [ ] 24. Load testing for concurrent connections

  **What to do**:
  - Create `tests/load/connection-load.js` with k6 or autocannon:
    - Test 100 concurrent client connections
    - Test 1000 messages/second throughput
    - Test shell session creation under load
    - Measure and report: latency, error rate, memory usage
  - Create load test scenarios for peak loads
  - Document performance baselines

  **Must NOT do**:
  - Do not run load tests against production
  - Do not create tests that cause denial of service
  - Do not exceed reasonable resource usage

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Performance testing and optimization
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `git-master`: Not needed for load testing

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Wave 4)
  - **Parallel Group**: Wave 5 (with Tasks 20, 21, 22, 23)
  - **Blocked By**: Tasks 1-19

  **References**:
  - `tests/run-all.js` - Existing test runner
  - `src/socket/index.js:38-92` - Connection handling

  **Acceptance Criteria**:
  - [ ] Server handles 100 concurrent connections
  - [ ] Latency <100ms at 1000 msg/s
  - [ ] Error rate <0.1% under load
  - [ ] Memory usage stable over time

  **QA Scenarios**:
  ```
  Scenario: Load test execution
    Tool: Bash
    Preconditions: All previous tasks complete, dedicated test environment
    Steps:
      1. Start server in test mode
      2. Run load test script
      3. Collect metrics
    Expected Result: Performance meets targets
    Evidence: .sisyphus/evidence/task-24-load-test.json
  ```

  **Commit**: YES
  - Message: `test(load): add load testing for concurrent connections`
  - Files: `tests/load/connection-load.js`

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `node --check` on all JS files. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
  Output: `Syntax [PASS/FAIL] | Quality [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill if UI)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (features working together, not isolation). Test edge cases: empty state, invalid input, rapid actions. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `feat(auth): add server-side dashboard authentication middleware` | `src/middleware/auth.js`, `src/routes/auth.js` | npm test |
| 2 | `feat(auth): add authentication API endpoints` | `src/routes/auth.js` | npm test |
| 3 | `feat(audit): add security audit logging` | `src/utils/logger.js` | npm test |
| 4 | `fix(security): remove secret exposure from dashboard template` | `src/routes/dashboard.js`, `views/partials/_scripts_core.ejs` | npm test |
| 5-9 | `feat(client): implement self-healing and offline mode` | `client.js` | npm test |
| 10-14 | `feat(shell): implement interactive shell with Socket.IO streaming` | `src/socket/shell.js`, `src/socket/redirection.js` | npm test |
| 15-16 | `fix(error): implement comprehensive error handling` | `src/socket/*.js`, `client.js` | npm test |
| 17-19 | `feat(ui): improve dashboard UX with scrolling and notifications` | `views/partials/*.ejs` | npm test |
| 18 | `feat(features): implement all "Coming Soon" modules` | `src/socket/shared-memory.js`, `src/socket/credentials.js`, `src/socket/file-sharing.js`, `src/socket/orchestration.js`, `src/socket/roles.js`, `src/socket/auto-orchestration.js` | npm test |
| 20-24 | `test: add comprehensive test coverage` | `tests/*.test.js`, `tests/e2e/*.spec.js`, `tests/load/*.js` | npm test |

---

## Success Criteria

### Verification Commands
```bash
# Start server
npm start

# Start client (in another terminal)
node client.js

# Run all tests
npm test

# Test authentication
curl -X POST http://localhost:3000/api/auth/token -H "Content-Type: application/json" -d '{"secret":"very-secret-key-123"}'

# Test dashboard requires auth
curl -I http://localhost:3000/dashboard

# Test interactive shell
# (via Socket.IO shell session)

# Test client self-healing
# (kill server, restart, observe client reconnection)
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] All evidence files captured
- [ ] No security vulnerabilities identified
- [ ] Performance meets targets
- [ ] Documentation updated
