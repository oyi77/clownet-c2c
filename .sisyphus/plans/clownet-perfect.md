# ClawNet C2C Perfect Plan (Agent Chat First)

## TL;DR

Build a production-grade agent chat platform (global + DMs + rooms) with OpenClaw coordination as milestone 1. Ensure at-least-once delivery with dedupe, human-readable handles, presence, and a full REST API, while keeping persistence optional (default in-memory).

**Deliverables**
- C2CP v2 protocol with ACK, retries, dedupe, and reconnect replay
- Chat features: global, DMs, rooms, presence, typing, read receipts (optional)
- Identity: handles + stable agent IDs with uniqueness rules
- REST API v1 (chat, rooms, presence, tasks, logs, settings)
- Optional persistence via Warden or Supabase, default in-memory
- Dashboard upgrades: chat-first UI + OpenClaw task stream
- CLI tool for ops and chat
- Security hardening (standard): per-agent auth + audit logs

**Estimated Effort**: Medium (40-60 hours)
**Parallel Execution**: YES - 4 waves
**Critical Path**: Protocol v2 -> Identity/Auth -> Chat core -> REST API -> UI -> Tests

---

## Context

### Original Request
Perfect ClawNet into an agent chat system (like WhatsApp or mIRC) with OpenClaw coordination as the first milestone.

### Confirmed Requirements
- Scale: 5-20 agents
- Chat topology: global + DMs + rooms
- Identity: human-readable handles + stable agent IDs
- Delivery: at-least-once with dedupe
- Security: standard (per-agent auth + audit logs)
- Persistence: optional (default in-memory)
- Interface: full API + dashboard + CLI

### Research Findings Applied
- Socket.IO default is at-most-once; add ACK + retry for at-least-once
- Use message IDs with dedupe (server + client buffer)
- DM room name uses sorted IDs for stable room keys
- Presence based on connect, disconnecting, and heartbeat

---

## Work Objectives

### Core Objective
Deliver a reliable multi-agent chat platform that also supports OpenClaw task coordination without blocking future expansion beyond OpenClaw.

### Concrete Deliverables
1. C2CP v2 event protocol with ACK, retries, error codes, and replay offsets
2. Chat system (global + DM + room) with message dedupe
3. Identity and handles registry (unique, editable, audited)
4. Presence + typing indicators + basic status
5. REST API v1 for chat, rooms, presence, tasks, logs
6. Optional persistence (Warden/Supabase) with in-memory default
7. Dashboard: chat-first view, task timeline, room management
8. CLI tool for chat + dispatch + logs
9. Security: per-agent auth, audit logs, rate limits

### Must Have
- At-least-once delivery with dedupe
- Global, DM, and room chat
- Handles + agent IDs
- Presence status
- REST API + CLI
- OpenClaw command dispatch embedded in chat

### Must NOT Have (Guardrails)
- No file transfer in v3.3
- No complex RBAC beyond master, warden, worker
- No multi-relay federation
- No WebRTC

### Defaults Applied
- Message retention (in-memory): last 1000 messages per room
- Persistence retention (if enabled): 30 days
- Presence states: online, offline, idle
- Read receipts: not in v3.3
- Handle updates: allowed, must be unique, audit logged

---

## Verification Strategy

**Test Decision**
- Infra exists: perfection-tests.js and test-suite.js
- Automated tests: tests-after
- QA: agent-executed scenarios for each task

All verification must be agent-executable with concrete commands and evidence paths.

---

## Execution Strategy

**Wave 1**
1. Protocol v2 + message model
2. Identity and auth
3. Chat core features (global, DM, room)

**Wave 2**
4. Persistence layer (optional)
5. REST API v1
6. CLI tool

**Wave 3**
7. Dashboard chat-first UI
8. OpenClaw milestone integration
9. Security hardening and audit logs

**Wave 4**
10. Tests and documentation

---

## TODOs

### 1. C2CP v2 Protocol + Message Model

**What to do**
- Define v2 protocol event list: connect, report, chat_send, chat_ack, room_join, room_leave, presence_update, task_dispatch, task_result
- Add ACK and retry semantics for chat and task events
- Define message envelope with id, ts, from_id, from_handle, to_type, to_id, payload, dedupe_key
- Implement replay offsets for reconnect (server-side store + client offset)

**Must NOT do**
- Break existing event names without backward compatibility

**Recommended Agent Profile**
- Category: unspecified-high
- Skills: none
- Skills evaluated but omitted: frontend-ui-ux (not UI work)

**Parallelization**
- Can run in parallel: YES
- Parallel group: Wave 1
- Blocks: tasks 2, 3, 5
- Blocked by: none

**References**
- `server.js` - current event handling
- `client.py` - current command execution
- `views/dashboard.ejs` - current event bindings
- Socket.IO delivery guarantees (doc)

**Acceptance Criteria**
- Protocol spec document added (C2CP v2)
- ACK required for chat_send and task_dispatch
- Message ID and dedupe_key included in all messages

**Agent-Executed QA Scenario**
```
Scenario: At-least-once chat delivery
  Tool: Bash (socket.io test client)
  Preconditions: server running, two agents connected
  Steps:
    1. Send chat_send with id=msg-001 to global
    2. Simulate lost ACK (drop ack in client)
    3. Retry send within 2s
    4. Verify server stores only one message (dedupe)
  Expected Result: message stored once, ACK returned
  Evidence: test client log
```

---

### 2. Identity, Handles, and Auth

**What to do**
- Add handle registry with uniqueness enforcement
- Allow handle update with audit trail
- Add per-agent token auth and roles
- Ensure every message includes agent_id + handle

**Must NOT do**
- Allow duplicate handles

**Recommended Agent Profile**
- Category: unspecified-high
- Skills: none
- Skills evaluated but omitted: frontend-ui-ux

**Parallelization**
- Can run in parallel: YES
- Parallel group: Wave 1
- Blocks: tasks 3, 5, 7
- Blocked by: task 1

**References**
- `server.js` - auth middleware
- `views/dashboard.ejs` - display of agent IDs

**Acceptance Criteria**
- Handle registration endpoint exists
- Duplicate handle registration returns error
- Messages include both handle and id

**Agent-Executed QA Scenario**
```
Scenario: Handle registration and uniqueness
  Tool: Bash (curl)
  Preconditions: server running
  Steps:
    1. POST /api/v1/handles with agent_id=agent-001 and handle=alpha
    2. POST /api/v1/handles with agent_id=agent-002 and handle=alpha
    3. Assert second request fails with conflict
  Expected Result: handles unique
  Evidence: curl output
```

---

### 3. Chat Core Features (Global, DM, Rooms)

**What to do**
- Implement room creation, join, leave
- DM rooms via sorted agent IDs
- Global broadcast room
- Presence and typing events

**Must NOT do**
- Expose private room membership without auth

**Recommended Agent Profile**
- Category: unspecified-high
- Skills: none
- Skills evaluated but omitted: frontend-ui-ux

**Parallelization**
- Can run in parallel: YES
- Parallel group: Wave 1
- Blocks: tasks 5, 7
- Blocked by: tasks 1, 2

**References**
- `server.js` - current chat event
- Socket.IO rooms docs

**Acceptance Criteria**
- DM sends only to two participants
- Room join emits presence update
- Global chat visible to all connected agents

**Agent-Executed QA Scenario**
```
Scenario: DM room isolation
  Tool: Bash (socket.io test client)
  Preconditions: three agents connected
  Steps:
    1. Agent A sends DM to Agent B
    2. Agent C should not receive message
  Expected Result: only B receives
  Evidence: client logs
```

---

### 4. Persistence (Optional)

**What to do**
- Default in-memory store for messages and rooms
- Warden role can persist to JSON or Supabase
- Message replay via stored offsets

**Must NOT do**
- Require Supabase by default

**Recommended Agent Profile**
- Category: unspecified-high
- Skills: none

**Parallelization**
- Can run in parallel: YES
- Parallel group: Wave 2
- Blocks: task 5
- Blocked by: task 3

**References**
- `server.js` - current JSON persistence
- `openapi.yaml` - API spec

**Acceptance Criteria**
- With default config, chat works without persistence
- With Warden configured, messages survive restart

**Agent-Executed QA Scenario**
```
Scenario: Warden persistence
  Tool: Bash (curl)
  Preconditions: Warden enabled
  Steps:
    1. Send 3 chat messages
    2. Restart server
    3. Fetch room history
  Expected Result: messages persist
  Evidence: API output
```

---

### 5. REST API v1

**What to do**
- Add endpoints for rooms, messages, presence, tasks, logs
- Maintain backward compatibility for existing endpoints
- Update openapi.yaml

**Must NOT do**
- Remove existing /api settings or logs

**Recommended Agent Profile**
- Category: unspecified-high
- Skills: none

**Parallelization**
- Can run in parallel: YES
- Parallel group: Wave 2
- Blocks: tasks 6, 7
- Blocked by: tasks 2, 3, 4

**References**
- `openapi.yaml`
- `server.js`

**Acceptance Criteria**
- GET /api/v1/rooms returns room list
- POST /api/v1/messages sends message
- GET /api/v1/rooms/:id/history returns messages

**Agent-Executed QA Scenario**
```
Scenario: Room history endpoint
  Tool: Bash (curl)
  Preconditions: server running
  Steps:
    1. Send message to room alpha
    2. GET /api/v1/rooms/alpha/history
    3. Assert message present
  Expected Result: history returns message
  Evidence: curl output
```

---

### 6. CLI Tool

**What to do**
- Add CLI for login, chat send, room join, task dispatch
- Show presence list and logs

**Must NOT do**
- Require GUI for core ops

**Recommended Agent Profile**
- Category: unspecified-high
- Skills: none

**Parallelization**
- Can run in parallel: YES
- Parallel group: Wave 2
- Blocks: task 10
- Blocked by: task 5

**References**
- `scripts/` (existing patterns)

**Acceptance Criteria**
- CLI can send chat to global
- CLI can dispatch OpenClaw task

**Agent-Executed QA Scenario**
```
Scenario: CLI chat send
  Tool: Bash
  Preconditions: server running
  Steps:
    1. clownet-cli chat --room=global --msg=ping
    2. GET /api/v1/rooms/global/history
    3. Assert latest message contains ping
  Expected Result: chat delivered
  Evidence: CLI output and API output
```

---

### 7. Dashboard Chat-First UI

**What to do**
- Add left sidebar for rooms and DMs
- Add presence list
- Add chat timeline with task events
- Add room management panel

**Must NOT do**
- Break existing Fleet and Ops tabs

**Recommended Agent Profile**
- Category: visual-engineering
- Skills: frontend-ui-ux
- Skills evaluated but omitted: none

**Parallelization**
- Can run in parallel: YES
- Parallel group: Wave 3
- Blocks: task 10
- Blocked by: task 5

**References**
- `views/dashboard.ejs`

**Acceptance Criteria**
- Chat view shows global + DMs + rooms
- Presence visible with online status

**Agent-Executed QA Scenario**
```
Scenario: Chat UI works
  Tool: Playwright
  Preconditions: server running
  Steps:
    1. Open /dashboard
    2. Click room alpha
    3. Send message
    4. Assert message appears in timeline
  Expected Result: chat UI functional
  Evidence: screenshot
```

---

### 8. OpenClaw Milestone Integration

**What to do**
- Add slash command messages that dispatch tasks
- Show task lifecycle as chat events
- Agent execution via client.py

**Must NOT do**
- Break generic chat functionality for non-OpenClaw agents

**Recommended Agent Profile**
- Category: unspecified-high
- Skills: none

**Parallelization**
- Can run in parallel: YES
- Parallel group: Wave 3
- Blocks: task 10
- Blocked by: tasks 3, 5

**References**
- `client.py`
- `server.js`

**Acceptance Criteria**
- Slash command in chat triggers task dispatch
- Task result posts back to chat timeline

**Agent-Executed QA Scenario**
```
Scenario: Chat slash command dispatch
  Tool: Bash (socket.io test client)
  Preconditions: agent connected
  Steps:
    1. Send chat message /status
    2. Verify task_dispatch sent
    3. Verify task_result posts to chat
  Expected Result: task integrated into chat
  Evidence: logs
```

---

### 9. Security Hardening and Audit Logs

**What to do**
- Rate limit API and chat events
- Input validation for chat payloads
- Add audit log for message send, delete, role change

**Must NOT do**
- Allow unauthenticated chat

**Recommended Agent Profile**
- Category: unspecified-high
- Skills: none

**Parallelization**
- Can run in parallel: YES
- Parallel group: Wave 3
- Blocks: task 10
- Blocked by: task 5

**References**
- `server.js`
- OWASP WebSocket security cheat sheet

**Acceptance Criteria**
- Rate limit returns 429 after threshold
- Audit log records all chat_send events

**Agent-Executed QA Scenario**
```
Scenario: Rate limit
  Tool: Bash (wrk)
  Preconditions: server running
  Steps:
    1. wrk -c 1 -d 10 -R 150 http://localhost:3000/api/v1/rooms
    2. Verify 429 responses present
  Expected Result: rate limiting works
  Evidence: wrk output
```

---

### 10. Tests and Documentation

**What to do**
- Extend perfection-tests.js for chat scenarios
- Add OpenAPI v1 for chat endpoints
- Document protocol v2 in PROTOCOL_v2.md

**Recommended Agent Profile**
- Category: quick
- Skills: none

**Parallelization**
- Can run in parallel: NO (final wave)
- Blocked by: tasks 6, 7, 8, 9

**Acceptance Criteria**
- Tests cover DM, room, and global
- OpenAPI has chat endpoints

**Agent-Executed QA Scenario**
```
Scenario: Chat test suite
  Tool: Bash (node)
  Preconditions: server running
  Steps:
    1. node perfection-tests.js
    2. Assert: chat tests pass
  Expected Result: all chat tests pass
  Evidence: test output
```

---

## Commit Strategy

1. feat(protocol): C2CP v2 and message model
2. feat(auth): handles and auth
3. feat(chat): rooms, DMs, presence
4. feat(persist): optional warden storage
5. feat(api): REST v1
6. feat(cli): ops and chat cli
7. feat(ui): chat-first dashboard
8. feat(openclaw): task integration
9. feat(security): rate limits and audit logs
10. test: chat scenarios + docs

---

## Success Criteria

- Any agent can chat globally, via DM, or in rooms
- Messages are delivered at-least-once with dedupe
- Handles are unique and stable with audit trail
- OpenClaw task dispatch works via chat commands
- REST API v1 covers chat, rooms, presence, tasks
- UI shows chat, presence, and tasks in one timeline
- Audit logs capture critical events
