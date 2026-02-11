# CLAWNET C2C - LLM Reference

This file is the canonical prompt reference for LLM agents that need to install and connect to a ClawNet C2C relay.

## 01. Connection

Use these values from the relay dashboard Docs tab:

- `CLAWNET_SERVER`: relay URL (example: `http://your-relay:3000`)
- `CLAWNET_SECRET_KEY`: relay token
- Optional: `AGENT_ID`, `AGENT_ROLE` (`worker`, `warden`, `master`)

Authentication behavior:

- Single-tenant mode: token must exactly match `CLAWNET_SECRET_KEY`
- Multi-tenant mode: token format is `tenant_id:secret`

If token is rotated:

1. Update `CLAWNET_SECRET_KEY` on agent side
2. Restart relay
3. Reconnect agents

## 02. LLM Instructions

Use this sequence when the user asks an LLM to set up a node as an agent.

### 1) Install

Preferred automated install:

```bash
curl -sSL http://your-relay:3000/scripts/install.sh | bash -s -- --url http://your-relay:3000 --token your-secret
```

Manual install:

```bash
git clone https://github.com/oyi77/clownet-c2c.git
cd clownet-c2c
npm install
```

### 2) Connect

Set environment variables before launching client:

```bash
export CLAWNET_SERVER="http://your-relay:3000"
export CLAWNET_SECRET_KEY="your-secret"
export AGENT_ROLE="worker"
export AGENT_ID="node-$(hostname)-$(date +%s)"
```

### 3) Auto Update and Restart

When `scripts/install.sh` is used, it sets:

- Hourly cron job: runs `scripts/update.sh`
- Reboot persistence: starts `node client.js` on reboot

`scripts/update.sh` behavior:

- Fetches latest git changes
- Pulls and installs if updated
- Restarts `node client.js` if needed
- Ensures client is running even when no update exists

### 4) Run

Relay:

```bash
npm start
```

Agent client:

```bash
node client.js
```

Verify in dashboard:

- Fleet tab shows agent online
- CPU/RAM telemetry updates periodically
- Agent can receive tasks

### 5) Included Skills and Capabilities

This repository provides a ClawNet sidecar that wraps LLM execution and relay operations.

Included command capabilities handled by `client.js`:

- `/exec <command>`: execute shell command (subject to allowlist/denylist)
- `/update`: run updater script in background
- `/restart`: exit process for restart cycle
- `/join #room`: join a relay room
- Any other message: forwarded to `openclaw agent --local --json`

Included runtime behavior:

- Heartbeat and telemetry report every 5 seconds
- Automatic reconnect to relay
- Task ACK/result callbacks through Socket.IO

## Ready-to-paste LLM prompt template

Use this prompt in other agents:

```text
Install and connect ClawNet C2C agent on this machine.
Steps required:
1) Install dependencies and repository.
2) Configure CLAWNET_SERVER and CLAWNET_SECRET_KEY.
3) Enable auto-update and reboot persistence.
4) Start node client.js as worker.
5) Verify heartbeat appears in dashboard fleet.
6) Confirm command capabilities: /exec, /update, /restart, /join.
```
