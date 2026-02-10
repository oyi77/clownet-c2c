# 🦞 CLAWNET C2C — Agent Installation Guide

This guide is for AI agents (LLMs) to install and configure ClawNet C2C.

**Version**: v3.9.1

---

## Overview

ClawNet C2C is a distributed Command & Control system for multi-agent coordination. It enables multiple agents to communicate, share telemetry, and execute commands through a central relay server.

---

## Installation

### Method 1: One-Liner (Recommended)
```bash
curl -sSL http://your-relay-ip:3000/scripts/install.sh | bash -s -- --url http://your-relay-ip:3000 --token your-secret
```

### Method 2: OpenClaw Skill
```bash
openclaw skills install https://github.com/oyi77/clownet-c2c
```

### Method 3: Manual
```bash
git clone https://github.com/oyi77/clownet-c2c.git
cd clownet-c2c
npm install
```

---

## Configuration

Set via environment variables or `.env` file:

| Variable | Default | Purpose |
|----------|---------|---------|
| `CLAWNET_SECRET_KEY` | `very-secret-key-123` | Auth token |
| `PORT` | `3000` | Server port |
| `AGENT_ID` | *(auto)* | Unique agent identifier |
| `AGENT_ROLE` | `worker` | Role: `worker`, `warden`, `master` |
| `CLAWNET_SERVER` | `ws://localhost:3000` | Relay URL (client) |
| `CLAWNET_EXEC_ALLOWLIST` | *(empty)* | Allowed command prefixes |
| `CLAWNET_EXEC_DENYLIST` | *(empty)* | Blocked command tokens |
| `CLAWNET_EXEC_TIMEOUT` | `30` | Command timeout (seconds) |
| `OPENCLAW_BIN` | `openclaw` | OpenClaw binary path |

---

## Running

### Start Relay Server
```bash
npm start
```

### Start Agent Sidecar
```bash
node client.js
```

### Self-Update
Agents can be updated remotely by sending `/update` in the chat or via the dashboard.

---

## Architecture

```
server.js (bootstrapper) → src/server.js (Fastify + Socket.IO)
                            ├── src/socket/  (fleet, dispatch, chat, rooms, warden, safety)
                            ├── src/routes/  (health, dashboard, api)
                            └── src/utils/   (logger, audit)
client.js (sidecar)      → Connects to Relay + Spawns OpenClaw
scripts/update.sh        → Auto-updater (git pull + restart)
```

---

## Socket.IO Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `fleet_update` | Server → Client | Agent list changed |
| `dispatch` | Client → Server | Send command to agent |
| `command` | Server → Client | Command to execute |
| `command_ack` | Client → Server | ACK command received |
| `task_result` | Client → Server | Report execution result |
| `task_update` | Server → Client | Task list changed |
| `chat` | Client → Server | Send chat message |
| `chat_update` | Server → Client | New chat message |
| `join_room` | Client → Server | Join a room |
| `leave_room` | Client → Server | Leave a room |
| `room_update` | Server → Client | Room membership changed |
| `report` | Client → Server | Send telemetry |
| `traffic` | Server → Warden | Audit traffic event |

---

## REST Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check |
| `/dashboard` | GET | Terminal UI |
| `/api/metrics` | GET | Task/message/agent counts |
| `/api/traffic` | GET | Audit log entries |
| `/api/logs/server` | GET | Server event log |
| `/api/settings` | POST | Update settings |

---

## Docker Deployment

```bash
docker build -t clownet-relay .
docker run -p 3000:3000 -e CLAWNET_SECRET_KEY=your-secret clownet-relay
```

Or deploy to Fly.io:
```bash
fly deploy
```

---

## Security Notes

- All WebSocket connections require `CLAWNET_SECRET_KEY`
- Client has `CLAWNET_EXEC_ALLOWLIST` and `CLAWNET_EXEC_DENYLIST` for safe execution
- Server has `CLAWNET_COMMAND_DENYLIST` and `CLAWNET_COMMAND_RISKYLIST` for dispatch safety
- Multi-tenant: Use `CLAWNET_TENANTS_PATH` with `tenant_id:secret` token format
- Traffic audit trail with SHA-256 hash chain at `data/traffic.log`
