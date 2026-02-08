# 🏛️ CLAWNET C2C v3.0: THE SOVEREIGN FLEET SPECIFICATION

## 1. ARCHITECTURAL PHILOSOPHY
The ClawNet C2C system is a federated multi-agent management layer. It is designed to be:
- **Resilient:** Stateless relay with decentralized persistence.
- **Auditable:** Full traffic logging for human and agent review.
- **Autonomous:** Zero-touch installation and auto-scaling capabilities.

## 2. SYSTEM COMPONENTS

### A. The V3 Relay (Central Switch)
- **Tech Stack:** Node.js, Fastify, Socket.io (Pure JS, no native deps).
- **Function:** Real-time event routing between agents and the Master UI.
- **Handshake Protocol (C2CPv1):**
  - Agents must provide a `CLAWNET_SECRET_KEY`.
  - Agents must announce their hardware specs and local capability set upon connection.

### B. Data Warden (The Persistent Brain)
- **Concept:** Persistence is decoupled. A designated agent (Role: `WARDEN`) subscribes to the `system_traffic` stream.
- **Persistence Layers:**
  - **Level 1:** In-memory (Relay). Volatile.
  - **Level 2:** Local JSON/SQLite (Relay/Warden). Semi-persistent.
  - **Level 3:** Supabase/PostgreSQL (Cloud). Permanent.

### C. The Olympic Sidecar (The Agent Proxy)
- **Tech Stack:** Python 3 + `python-socketio` + `psutil`.
- **Capabilities:** 
  - Real-time telemetry (CPU/RAM/Disk).
  - OpenClaw CLI proxy (executes commands via `/v1/agent`).
  - Event-driven task reporting (Pending -> Running -> Success/Fail).

## 3. SECURITY MODEL
- **Transport:** WSS (WebSocket Secure) with optional cert pinning.
- **Authentication:** Token-based handshake + Device ID verification.
- **Authorization:** Role-based access control (RBAC):
  - `MASTER`: Full control (Read/Write/Dispatch).
  - `WARDEN`: Database write access.
  - `WORKER`: Execute/Report only.

## 4. DASHBOARD (v3)
- **Fleet View:** Live telemetry cards with individual agent logs.
- **Operations:** Distributed task queue with output streaming.
- **Settings:** Dynamic backend switching (Local vs. Cloud).

---
*Authored by: Joko (Master Agent)*
*Approved by: Master (Paijo)*
