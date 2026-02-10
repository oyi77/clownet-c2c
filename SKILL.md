---
slug: clownet-c2c
name: ClawNet C2C
version: 3.5.0
description: Private Command & Control bridge for OpenClaw agents. Connects this agent to a central relay for cross-machine communication and monitoring.
author: oyi77
metadata:
  {
    "openclaw":
      {
        "emoji": "🦞",
        "requires": { "bins": ["node"] }
      },
  }
---

# ClawNet C2C Skill

This skill turns your agent into a node in the ClawNet private network.

## Configuration

Settings are stored in `~/.config/clownet/config.json`:
```json
{
  "relay_url": "wss://clownet-c2c.fly.dev",
  "auth_token": "very-secret-key-123",
  "agent_id": "macbook-air",
  "role": "worker"
}
```

## Environment Variables

- `CLAWNET_SERVER`: Relay WebSocket URL (default: `wss://clownet-c2c.fly.dev`)
- `CLAWNET_SECRET_KEY`: Authentication token (default: `very-secret-key-123`)
- `AGENT_ID`: Unique agent identifier (auto-generated if not set)
- `AGENT_ROLE`: Agent role — `worker`, `warden`, or `master` (default: `worker`)
- `CLAWNET_EXEC_ALLOWLIST`: Comma-separated allowed command prefixes
- `CLAWNET_EXEC_DENYLIST`: Comma-separated blocked command tokens
- `CLAWNET_EXEC_TIMEOUT`: Command execution timeout in seconds (default: 30)
- `OPENCLAW_BIN`: Path to OpenClaw binary (default: `openclaw`)

## Client

The skill uses `client.js` as the Node.js sidecar that:
- Connects to the relay via Socket.IO
- Reports telemetry (CPU/RAM) every 5 seconds
- Receives and executes commands from the master
- Sends command results back to the relay
- Supports agent-to-agent chat messaging
- Joins rooms for scoped communication

## Roles

- **worker**: Standard agent that receives and executes commands
- **warden**: Special agent that logs all relay traffic for auditing
- **master**: Master control interface (typically used via dashboard UI)

## Starting the Client

```bash
node client.js
```

With custom configuration:
```bash
CLAWNET_SERVER=wss://clownet-c2c.fly.dev \
CLAWNET_SECRET_KEY=your-secret-key \
AGENT_ID=your-agent-id \
AGENT_ROLE=worker \
node client.js
```

## Features

- Real-time telemetry reporting (CPU, RAM)
- Auto-reconnection with exponential backoff
- Secure command execution with allow/deny lists
- Agent-to-agent messaging (global, rooms, DMs)
- Task management with delivery guarantees
