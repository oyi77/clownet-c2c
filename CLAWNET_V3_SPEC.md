# 🏛️ CLAWNET C2C v3.0: THE SOVEREIGN FLEET SPECIFICATION

This document defines the perfected architecture for a multi-agent Command & Control system designed for maximum reliability, auditability, and zero-human intervention.

## 1. ARCHITECTURAL PHILOSOPHY
- **Decoupled Persistence:** The Central Relay is a volatile message switch. Real data persistence is delegated to a "Data Warden" (an agent role) or a direct Supabase/PostgreSQL connection.
- **Hierarchical Sovereignty:** Every agent is an independent entity that "volunteers" its telemetry to the Master via the Relay.
- **Fail-Safe Networking:** Agents use an autonomous sidecar with intelligent retry, heartbeat validation, and local logging.

## 2. CORE COMPONENTS

### A. The V3 Relay (Node.js/Fastify/Socket.io)
- **Engine:** Pure Node.js (Stateless). No native binaries (better-sqlite3 removed) to ensure Docker compatibility on any cloud.
- **State Management:** In-memory "Active State" synced to the `WARDEN` in real-time.
- **Security:** 
    - `CLAWNET_SECRET`: Shared secret for initial handshake.
    - `AGENT_ID` + `SESSION_TOKEN`: Unique identifiers for every connection.
- **Routing:** 
    - `/dashboard`: High-fidelity terminal UI.
    - `/api/v1`: RESTful control plane.
    - `wss://`: Bi-directional event stream.

### B. The Data Warden (Memory Sync)
- **Role:** A designated agent (usually the Master machine) that runs the `warden.py` submodule.
- **Persistence Fallback:** 
    1. `Supabase`: Primary (if URL/KEY present).
    2. `Local JSON`: Secondary (if Supabase fails).
    3. `Volatile`: Tertiary (Memory-only).
- **Function:** Listens to the `system_traffic` event from the relay and executes UPSERT operations to the chosen DB.

### C. The Olympic Sidecar (Python Skill)
- **Intelligence:** Uses the `Olympic Orchestrator` logic (Metis/Prometheus/Momus) to process commands.
- **Telemetry:** Real-time hardware stats (psutil) and OpenClaw Cron snapshots.
- **Execution:** Proxies Master commands to the local OpenClaw binary with full stdout/stderr capture and timeout protection.

## 3. COMMUNICATION PROTOCOL (C2CP v1)
| Event | Direction | Payload |
| :--- | :--- | :--- |
| `connect` | Agent -> Relay | `auth_token`, `agent_metadata`, `system_stats` |
| `report` | Agent -> Relay | `cron_snapshot`, `resource_usage` |
| `dispatch` | Master -> Agent | `task_id`, `command_string`, `timeout` |
| `update` | Agent -> Master | `task_id`, `status`, `output`, `error` |
| `traffic` | Relay -> Warden | `log_event_object` |

## 4. THE "PERFECTION" CHECKLIST (TDD)
- [ ] **Unit Tests:** Handshake validity, Role authorization, Event routing.
- [ ] **Integration Tests:** Master broadcast to 2+ Workers, Warden persistence check.
- [ ] **E2E Tests:** Dashboard UI responsiveness, Task board state transitions.

---
*Authored by: Joko (OpenClaw Main Agent)*
*Verified by: Master (Paijo)*
