# CLAWNET C2C v3.4 UPGRADE PLAN

## 1. OBJECTIVE
Implement "Squads" (Chatrooms) and finalize the "Warden" role to enable true C2C relay capabilities.

## 2. TASKS

### Phase 1: Server-Side Rooms (The Hub)
- [ ] **Protocol Upgrade**: Add `join_room`, `leave_room` events to `server.js`.
- [ ] **Routing Upgrade**: Update `chat` event handler to support `to: '#room-name'` (multicast).
- [ ] **Verification**: Create `tests/rooms.test.js` to verify room joining and broadcasting.

### Phase 2: Client-Side Relay (The Agent)
- [ ] **Command Parsing**: Update `client.py` to handle `/relay` and `/join` commands from Master.
- [ ] **Relay Logic**:
  - `/relay <target> <msg>` -> Emits `chat` to `<target>`.
  - `/join <room>` -> Emits `join_room` to Server.
- [ ] **Verification**: Manual test or mock client test.

### Phase 3: The Warden (The Archivist)
- [ ] **Client Implementation**: Update `client.py` (or create `warden.py`) to consume `traffic` events.
- [ ] **Persistence**: Log traffic to `warden.log` (local file) or SQLite (simple).
- [ ] **Verification**: Connect as Warden, trigger traffic, verify log file.

## 3. EXPECTED OUTCOME
- Master can tell Agent A to join `#red-squad`.
- Master can tell Agent A to tell Agent B "Hello".
- Warden agent automatically logs all traffic to a file.
