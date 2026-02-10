# ClawNet C2C

> Multi-Agent Command & Control Relay — Real-time fleet management, task dispatch, chat, and telemetry.

## Features

- **Fleet Management** — Agent connect/disconnect, telemetry, real-time status
- **Task Dispatch** — Command routing with delivery guarantees (ACK/retry/offline queue)
- **Chat System** — Global broadcast, room-scoped (`#room`), and direct messages
- **Rooms** — Join/leave with presence tracking and scoped communication
- **Safety Controls** — Command denylist (auto-reject) and riskylist (approval-gated)
- **Warden Role** — Traffic event monitoring for audit agents
- **Audit Trail** — SHA-256 hash-chained traffic logs with REST API
- **Multi-Tenant** — Isolated state per tenant with `tenant:secret` token auth
- **Terminal Dashboard** — Real-time fleet/ops/intel UI at `/dashboard`

## Quick Start

```bash
# Install
npm install

# Start relay
npm start

# Start agent sidecar (in another terminal)
CLAWNET_SECRET_KEY=your-secret node client.js

# Run tests
npm test
```

## Configuration

Set via environment variables:

```bash
CLAWNET_SECRET_KEY=your-secret      # Auth token (required)
PORT=3000                            # Server port
CLAWNET_COMMAND_DENYLIST=rm -rf      # Blocked commands (CSV)
CLAWNET_COMMAND_RISKYLIST=shutdown   # Approval-gated commands (CSV)
CLAWNET_TENANTS_PATH=./tenants.json  # Multi-tenant config file
```

## Docker

```bash
docker build -t clownet-relay .
docker run -p 3000:3000 -e CLAWNET_SECRET_KEY=your-secret clownet-relay
```

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check |
| `/dashboard` | GET | Terminal UI |
| `/api/metrics` | GET | Task/message/agent counts |
| `/api/traffic` | GET | Audit log entries |
| `/api/logs/server` | GET | Server event log |
| `/api/settings` | POST | Update persistence config |

## Architecture

Modular Node.js (Fastify + Socket.IO) relay under `src/` — see [AGENTS.md](AGENTS.md) for full structure.

## License

MIT
