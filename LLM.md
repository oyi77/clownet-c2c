# 🦞 CLAWNET C2C - Agent Installation Guide

This guide is intended for AI agents (LLMs) to understand how to install and configure ClawNet C2C.

---

## Overview

ClawNet C2C is a distributed Command & Control (C2C) system for multi-agent coordination. It enables multiple OpenClaw instances to communicate, share telemetry, and execute commands across different machines through a central relay server.

**Version**: v3.2.0

---

## Installation Methods

### Method 1: OpenClaw Skill Installation (Recommended)

To install ClawNet as a skill on any OpenClaw instance:

```bash
openclaw skills install https://github.com/oyi77/clownet-c2c
```

This will automatically:
- Download the ClawNet repository
- Set up Node.js dependencies (socket.io-client, uuid)
- Configure the sidecar client
- Launch the agent with proper configuration and role assignment

### Method 2: Manual Installation

#### Prerequisites
- Node.js (v18 or higher)
- OpenClaw binary installed and accessible in PATH

#### Steps

1. **Clone the repository:**
```bash
git clone https://github.com/oyi77/clownet-c2c.git
cd clownet-c2c
```

2. **Install Node.js dependencies:**
```bash
npm install
```

3. **Configure your agent:**
Create a configuration file at `~/.config/clownet/config.json` (or set environment variables):

```json
{
  "relay_url": "wss://clownet-c2c.fly.dev",
  "auth_token": "very-secret-key-123",
  "agent_id": "your-agent-id",
  "role": "worker"
}
```

4. **Start the agent sidecar:**
```bash
node client.js
```

With environment variables:
```bash
CLAWNET_SERVER=wss://clownet-c2c.fly.dev \
CLAWNET_SECRET_KEY=your-secret-key \
AGENT_ID=your-agent-id \
AGENT_ROLE=worker \
node client.js
```

---

## Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `CLAWNET_SERVER` | Relay server WebSocket URL | `wss://clownet-c2c.fly.dev` | No |
| `CLAWNET_SECRET_KEY` | Authentication token for relay | `very-secret-key-123` | No |
| `AGENT_ID` | Unique identifier for this agent | Auto-generated | No |
| `AGENT_ROLE` | Role of agent (worker, warden, master) | `worker` | No |
| `CLAWNET_TENANT_ID` | Tenant ID for multi-tenant setup | Empty | No |
| `CLAWNET_EXEC_ALLOWLIST` | Comma-separated allowed command prefixes | Empty (allow all) | No |
| `CLAWNET_EXEC_DENYLIST` | Comma-separated blocked command tokens | Empty | No |
| `CLAWNET_EXEC_TIMEOUT` | Command execution timeout in seconds | 30 | No |
| `OPENCLAW_BIN` | Path to OpenClaw binary | `openclaw` | No |

### Role Assignment

When installing as an OpenClaw skill or configuring manually, you must assign a role to the agent. The role determines how the agent behaves in the ClawNet network:

- **worker** (default):
  - Receives and executes commands from master
  - Reports telemetry (CPU, RAM) every 5 seconds
  - Responds to agent-to-agent chat messages
  - Processes instructions via OpenClaw agent binary

- **warden**:
  - Logs all relay traffic for auditing purposes
  - Can be used for compliance and monitoring
  - Maintains persistent logs of network activity

- **master**:
  - Typically used via dashboard UI
  - Dispatches commands to workers
  - Monitors fleet status and agent health
  - Manages task queue and operations

**Example role assignment:**
```bash
# Worker agent
AGENT_ROLE=worker node client.js

# Warden agent (audit/monitoring)
AGENT_ROLE=warden node client.js

# Master control (usually via dashboard)
AGENT_ROLE=master node client.js
```

### Roles

- **worker**: Standard agent that receives and executes commands
- **warden**: Special agent that logs all relay traffic for auditing
- **master**: Master control interface (typically the dashboard UI)

---

## Starting the Relay Server

If you need to run your own relay server instead of using the default hosted instance:

```bash
npm start
```

This starts the relay on port 3000 (configurable via `PORT` environment variable).

---

## Docker Deployment

For production relay server deployment:

```bash
docker build -t clownet-relay .
docker run -p 3000:3000 \
  -v $(pwd)/data:/data \
  -e CLAWNET_SECRET_KEY=your-secret-key \
  clownet-relay
```

---

## Key Features

1. **Real-time Telemetry**: CPU and RAM usage reported every 5 seconds
2. **Auto-reconnection**: Exponential backoff (5s → 60s) for resilient connection
3. **Command Execution**: Secure shell command execution with allow/deny lists
4. **Chat System**: Encrypted agent-to-agent messaging
5. **Task Management**: Distributed task queue with status tracking
6. **Dashboard UI**: Terminal-style interface for fleet management

---

## Troubleshooting

### Connection Issues
- Verify `CLAWNET_SERVER` URL is correct
- Check that `CLAWNET_SECRET_KEY` matches the relay's secret
- Ensure firewall allows WebSocket connections

### Commands Not Executing
- Check `CLAWNET_EXEC_ALLOWLIST` and `CLAWNET_EXEC_DENYLIST` settings
- Verify `OPENCLAW_BIN` path is correct
- Check logs for error messages

### Telemetry Not Updating
- Verify Node.js version compatibility (v18+)
- Check that client.js process is running
- Review client logs for connection errors

---

## API & Events

### Socket.io Events (C2CP v1)

| Event | Direction | Payload |
|-------|-----------|----------|
| `connect` | Agent → Relay | `auth_token`, `agent_id`, `role`, `specs` |
| `report` | Agent → Relay | `agent_id`, `role`, `specs` (cpu_percent, ram_percent) |
| `dispatch` | Master → Agent | `to`, `cmd` |
| `task_result` | Agent → Master | `id`, `status`, `output` |
| `chat` | Any → All | `from`, `to`, `msg`, `ts` |

---

## Security Notes

- Always use unique, strong `CLAWNET_SECRET_KEY` values in production
- Configure `CLAWNET_EXEC_DENYLIST` to block dangerous commands
- Use HTTPS/WSS for relay connections in production
- Never expose relay server to public internet without proper authentication

---

## Support

- **Dashboard**: `https://clownet-c2c.fly.dev/dashboard`
- **API Docs**: See `openapi.yaml` in repository
- **Issues**: Report via GitHub Issues

---

*Generated for AI agent installation assistance*
