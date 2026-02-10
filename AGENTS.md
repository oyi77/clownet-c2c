# ClawNet C2C — Agent Knowledge Base

> ClawNet C2C v3.5 — Multi-Agent Command & Control Relay

## Directory Structure

```
clownet-c2c/
├── server.js            # Bootstrapper (requires src/server.js)
├── client.js            # Agent sidecar (connects to relay)
├── package.json         # v3.5.0, scripts: start, test
├── src/                 # Core modular source
│   ├── server.js        # Fastify + Socket.IO bootstrap
│   ├── config.js        # Env vars, paths, safety lists
│   ├── state.js         # Multi-tenant in-memory state
│   ├── persistence.js   # JSON file I/O
│   ├── auth.js          # Token auth (single + multi-tenant)
│   ├── routes/          # HTTP endpoints
│   │   ├── health.js    # GET /
│   │   ├── dashboard.js # GET /dashboard
│   │   └── api.js       # /api/metrics, /api/traffic, etc.
│   ├── socket/          # WebSocket handlers
│   │   ├── index.js     # Socket.IO setup + auth middleware
│   │   ├── fleet.js     # Agent connect/disconnect/report
│   │   ├── dispatch.js  # Task dispatch + delivery guarantees
│   │   ├── chat.js      # Global/room/DM chat
│   │   ├── rooms.js     # Room join/leave
│   │   ├── warden.js    # Traffic events to wardens
│   │   └── safety.js    # Command denylist/riskylist
│   └── utils/
│       ├── logger.js    # Event logging
│       └── audit.js     # Traffic audit + SHA-256 hash chain
├── views/               # EJS templates
├── public/              # Static assets
├── tests/               # 9 JS test files + runner
├── docs/                # OpenAPI spec, SQL schema
├── scripts/             # Install scripts
├── .legacy/             # Archived stale test scripts
├── Dockerfile           # Docker deployment
└── fly.toml             # Fly.io config
```

## Code Conventions
- **No TypeScript** — plain Node.js (CommonJS `require`)
- **Env-first config** — all config via environment variables
- **Modular architecture** — each feature isolated in its own module
- **Multi-tenant state** — `state.getTenantState(tenantId)` for isolation
- **Socket events** over REST for real-time operations

## Key Commands
```bash
npm start            # Start relay server
npm test             # Run all 9 test files
node client.js       # Start agent sidecar
```

## Environment Variables
| Variable | Default | Purpose |
|----------|---------|---------|
| `CLAWNET_SECRET_KEY` | `very-secret-key-123` | Auth token |
| `PORT` | `3000` | Server port |
| `CLAWNET_COMMAND_DENYLIST` | *(empty)* | CSV of blocked command tokens |
| `CLAWNET_COMMAND_RISKYLIST` | *(empty)* | CSV of approval-gated tokens |
| `CLAWNET_TENANTS_PATH` | *(empty)* | Path to tenants JSON file |
| `CLAWNET_ACK_TIMEOUT_MS` | `5000` | ACK timeout for delivery |
| `CLAWNET_ACK_MAX_RETRIES` | `3` | Max delivery retries |

## Anti-Patterns to Avoid
- Don't add logic to root `server.js` — it's a bootstrapper only
- Don't bypass `state.getTenantState()` — always use it for tenant isolation
- Don't emit events directly — use `emitToTenant()` from `fleet.js`
- Don't hardcode ports in tests — use env var `PORT`
