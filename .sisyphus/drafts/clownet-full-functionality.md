# Draft: ClawNet C2C Full Functionality Planning

## Requirements (confirmed)

1. **Implement all coming soon features**:
   - Shared memory module
   - Credentials module
   - File sharing module
   - Orchestration module
   - Roles module
   - Auto-orchestration module

2. **Handle all possible error gracefully**:
   - Comprehensive try/catch in all modules
   - Error boundaries for socket handlers
   - Client-side error recovery
   - User-friendly error messages
   - Error toast notifications

3. **Message/command redirection**:
   - All commands except /exec should be redirected to chat
   - Command responses should appear in chat
   - Command echo in chat history

4. **Interactive shell**:
   - PTY-based shell sessions
   - Bidirectional streaming over Socket.IO
   - Terminal resize support
   - Session management (create, destroy, list)

5. **Client self-healing**:
   - Unlimited reconnection with exponential backoff
   - Offline command queue with persistence
   - Command deduplication on sync
   - Admin shutdown/restart commands

6. **Dashboard access token**:
   - Server-side token validation
   - Remove secret exposure from templates
   - Proper authentication flow
   - Token generation, verification, revocation

7. **Scrollable content sections**:
   - Chat panel scrolling
   - Fleet list scrolling
   - Logs panel scrolling
   - Smooth scroll animations

## Technical Decisions

- **Authentication**: JWT-based with 24h expiry, server-side validation
- **Reconnection**: Custom exponential backoff (1s, 2s, 4s, 8s... max 30s)
- **Shell**: PTY using node-pty library, bidirectional streaming
- **Error handling**: Try/catch everywhere, error events to clients, circuit breaker
- **Scrolling**: CSS overflow-y with fixed headers and smooth behavior

## Research Findings

- Dashboard currently exposes secret in EJS template (security issue)
- Client has basic reconnection but limited to 10 attempts
- Interactive shell not implemented, only /exec command dispatch
- Message redirection partial but incomplete
- All socket modules imported but not fully implemented

## Open Questions

- Should token expiry be configurable?
- Maximum concurrent shell sessions per agent?
- Queue size limit for offline commands?
- Specific styling preferences for scrollbars?

## Scope Boundaries

### INCLUDE:
- All 6 "Coming Soon" modules
- Complete authentication system
- Comprehensive error handling
- Interactive shell functionality
- Client self-healing system
- UI improvements (scrolling, notifications)
- Full test coverage

### EXCLUDE:
- Changes to existing core dispatch/chat/fleet logic (enhance only)
- Database changes (keep JSON file storage)
- Breaking changes to API endpoints

## Test Strategy Decision
- **Infrastructure exists**: YES (existing test runner)
- **Automated tests**: YES (tests-after) - extend existing test suite
- **Framework**: Node.js test runner with Cheerio/Playwright for E2E

## Plan Location
`.sisyphus/plans/clownet-full-functionality.md`
