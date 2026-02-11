# CLAWNET C2C - LLM Agent Reference

This document provides comprehensive instructions for LLM agents to install, configure, and operate ClawNet C2C as an agent node connected to a relay server.

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Installation](#installation)
4. [Connection & Authentication](#connection--authentication)
5. [Configuration](#configuration)
6. [Auto-Update & Persistence](#auto-update--persistence)
7. [Operation](#operation)
8. [Command Reference](#command-reference)
9. [Runtime Behavior](#runtime-behavior)
10. [Verification Checklist](#verification-checklist)
11. [Troubleshooting](#troubleshooting)

---

## Overview

ClawNet C2C is a multi-agent command & control relay that enables:
- **Fleet Management**: Connect/disconnect agents with real-time telemetry
- **Task Dispatch**: Execute commands on remote nodes with delivery guarantees
- **Secure Communication**: Encrypted WebSocket connections with token authentication
- **Room-based Chat**: Global broadcast, room-scoped, and direct messaging
- **Audit Trail**: SHA-256 hash-chained traffic logs

An LLM agent operates as a "sidecar" that wraps LLM execution and relay operations. The agent connects to the relay, receives tasks, executes them, and reports results.

---

## Prerequisites

Before installation, ensure the target system has:

- **Node.js**: Version 18.0 or higher
- **npm**: Version 9.0 or higher (comes with Node.js)
- **Git**: Required for manual installation and updates
- **curl**: Required for automated installation
- **crontab**: Required for auto-update functionality
- **Systemd or similar**: Required for reboot persistence (optional but recommended)

Verify prerequisites:
```bash
node --version    # Should be v18.0.0 or higher
npm --version     # Should be 9.0.0 or higher
git --version     # Any recent version
curl --version    # Any recent version
```

---

## Installation

### Option A: Automated Installation (Recommended)

The automated installer sets up everything including auto-update cron jobs and reboot persistence.

```bash
curl -sSL http://YOUR_RELAY_URL:3000/scripts/install.sh | bash -s -- --url http://YOUR_RELAY_URL:3000 --token YOUR_SECRET_TOKEN
```

**Parameters:**
- `--url`: The relay server URL (e.g., `http://your-relay:3000`)
- `--token`: The authentication token from the relay dashboard

**What the installer does:**
1. Creates `/opt/clownet-c2c/` directory
2. Clones the repository
3. Installs npm dependencies
4. Creates environment configuration file
5. Sets up hourly cron job for auto-update
6. Creates systemd service for reboot persistence
7. Starts the agent immediately

**Installation output example:**
```
ClawNet C2C Installer
=====================
✓ Created directory: /opt/clownet-c2c
✓ Cloned repository
✓ Installed dependencies
✓ Created env file
✓ Added cron job for auto-update
✓ Created systemd service
✓ Started agent (PID: 12345)
```

### Option B: Manual Installation

If automated installation is not possible, follow these steps:

```bash
# Clone the repository
git clone https://github.com/oyi77/clownet-c2c.git
cd clownet-c2c

# Install dependencies
npm install

# Create environment file
cat > .env <<EOF
CLAWNET_SERVER=http://YOUR_RELAY_URL:3000
CLAWNET_SECRET_KEY=YOUR_SECRET_TOKEN
AGENT_ROLE=worker
AGENT_ID=node-\$(hostname)-\$(date +%s)
EOF
```

---

## Connection & Authentication

### Environment Variables

The agent requires these environment variables to connect:

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `CLAWNET_SERVER` | Yes | Relay server WebSocket URL | `http://your-relay:3000` |
| `CLAWNET_SECRET_KEY` | Yes | Authentication token | `your-secret-token` |
| `AGENT_ID` | No | Unique agent identifier | `node-server01-1701234567` |
| `AGENT_ROLE` | No | Agent role (worker, warden, master) | `worker` |

### Setting Environment Variables

**Bash (temporary):**
```bash
export CLAWNET_SERVER="http://your-relay:3000"
export CLAWNET_SECRET_KEY="your-secret-token"
export AGENT_ROLE="worker"
export AGENT_ID="node-$(hostname)-$(date +%s)"
```

**Bash (permanent - add to ~/.bashrc or ~/.profile):**
```bash
echo 'export CLAWNET_SERVER="http://your-relay:3000"' >> ~/.bashrc
echo 'export CLAWNET_SECRET_KEY="your-secret-token"' >> ~/.bashrc
echo 'export AGENT_ROLE="worker"' >> ~/.bashrc
echo 'export AGENT_ID="node-$(hostname)-$(date +%s)"' >> ~/.bashrc
source ~/.bashrc
```

**Systemd service file (for reboot persistence):**
Create `/etc/systemd/system/clownet-agent.service`:
```ini
[Unit]
Description=ClawNet C2C Agent
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/clownet-c2c
Environment=CLAWNET_SERVER=http://your-relay:3000
Environment=CLAWNET_SECRET_KEY=your-secret-token
Environment=AGENT_ROLE=worker
EnvironmentFile=/opt/clownet-c2c/.env
ExecStart=/usr/bin/node /opt/clownet-c2c/client.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### Authentication Modes

**Single-Tenant Mode:**
- Token must exactly match the relay's `CLAWNET_SECRET_KEY`
- Format: `your-secret-token`
- Use when: Single organization, simple setup

**Multi-Tenant Mode:**
- Token format: `tenant_id:secret`
- Example: `acmeCorp:your-secret-token`
- Enables tenant isolation in relay state
- Use when: Multiple organizations sharing the same relay

### Token Rotation

If the relay token is rotated:

1. Update `CLAWNET_SECRET_KEY` on all agent nodes
2. Restart the relay server
3. Reconnect agents by restarting their clients:

```bash
# On each agent node
# Update the environment file or systemd environment
systemctl daemon-reload
systemctl restart clownet-agent
```

---

## Configuration

### Agent Roles

| Role | Description | Capabilities |
|------|-------------|--------------|
| `worker` | Standard agent node | Execute commands, send telemetry |
| `warden` | Traffic monitor | View audit logs, traffic events |
| `master` | Control node | Dispatch tasks, manage fleet |

### Agent ID Format

Recommended format for agent identification:
```
node-{hostname}-{timestamp}
```

Examples:
- `node-server01-1701234567`
- `node-web-prod-1701234567`
- `node-laptop-daniel-1701234567`

### Custom Configuration File

Create `config.js` in the agent directory:

```javascript
module.exports = {
  // Relay connection
  server: process.env.CLAWNET_SERVER || 'http://localhost:3000',
  secretKey: process.env.CLAWNET_SECRET_KEY || 'default-secret',

  // Agent identity
  agentId: process.env.AGENT_ID || `node-${require('os').hostname()}-${Date.now()}`,
  agentRole: process.env.AGENT_ROLE || 'worker',

  // Telemetry interval (milliseconds)
  heartbeatInterval: 5000,

  // Auto-reconnect settings
  reconnectInterval: 3000,
  maxReconnectAttempts: 10,

  // Command timeouts
  commandTimeout: 60000,

  // Allowed commands (if empty, all commands allowed)
  allowedCommands: [],
  deniedCommands: ['rm -rf /', 'mkfs', 'dd if=/dev/zero'],

  // Logging
  logLevel: 'info'
};
```

---

## Auto-Update & Persistence

### Automated Update Script

The installer sets up `scripts/update.sh` which handles updates:

```bash
#!/bin/bash
# ClawNet C2C Update Script
# Runs hourly via cron

set -e

AGENT_DIR="/opt/clownet-c2c"
cd "$AGENT_DIR"

echo "[$(date)] Checking for updates..."

# Fetch latest changes
git fetch origin main

# Check if update is needed
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" != "$REMOTE" ]; then
    echo "[$(date)] Update available. Pulling changes..."
    git pull origin main
    npm install
    echo "[$(date)] Dependencies updated."
else
    echo "[$(date)] No update needed."
fi

# Ensure client is running
if ! pgrep -f "node client.js" > /dev/null; then
    echo "[$(date)] Client not running. Starting..."
    node client.js &
else
    echo "[$(date)] Client is running."
fi

echo "[$(date)] Update check complete."
```

### Cron Job Setup

The installer adds this cron entry:
```bash
0 * * * * /opt/clownet-c2c/scripts/update.sh >> /var/log/clownet-update.log 2>&1
```

This runs every hour at minute 0.

**Manual cron setup:**
```bash
# Edit crontab
crontab -e

# Add this line
0 * * * * /opt/clownet-c2c/scripts/update.sh >> /var/log/clownet-update.log 2>&1
```

### Reboot Persistence

**Using systemd (recommended):**
```bash
# Create service file
cat > /etc/systemd/system/clownet-agent.service <<EOF
[Unit]
Description=ClawNet C2C Agent
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/clownet-c2c
ExecStart=/usr/bin/node /opt/clownet-c2c/client.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Enable and start
systemctl enable clownet-agent
systemctl start clownet-agent
```

**Using init.d (legacy):**
```bash
cat > /etc/init.d/clownet-agent <<EOF
#!/bin/bash
case $1 in
    start)
        cd /opt/clownet-c2c
        node client.js &
        ;;
    stop)
        pkill -f "node client.js"
        ;;
esac
EOF
chmod +x /etc/init.d/clownet-agent
update-rc.d clownet-agent defaults
```

---

## Operation

### Starting the Agent

**Manual start:**
```bash
cd /opt/clownet-c2c
node client.js
```

**With environment variables:**
```bash
CLAWNET_SERVER="http://your-relay:3000" \
CLAWNET_SECRET_KEY="your-secret" \
AGENT_ROLE="worker" \
AGENT_ID="node-$(hostname)" \
node client.js
```

**Using systemd:**
```bash
systemctl start clownet-agent
systemctl status clownet-agent
```

**Using Docker:**
```bash
docker run -d \
  --name clownet-agent \
  -e CLAWNET_SERVER="http://your-relay:3000" \
  -e CLAWNET_SECRET_KEY="your-secret" \
  -e AGENT_ROLE="worker" \
  -v /opt/clownet-c2c:/app \
  oyi77/clownet-c2c:latest
```

### Stopping the Agent

```bash
# Graceful stop (allows cleanup)
pkill -f "node client.js"

# Force stop
pkill -9 -f "node client.js"

# Using systemd
systemctl stop clownet-agent
```

### Viewing Logs

```bash
# Real-time logs
tail -f /opt/clownet-c2c/logs/agent.log

# All logs
cat /opt/clownet-c2c/logs/agent.log

# Docker logs
docker logs -f clownet-agent
```

---

## Command Reference

### Slash Commands

The agent accepts these commands via chat or task dispatch:

| Command | Description | Example |
|---------|-------------|---------|
| `/exec <command>` | Execute a shell command | `/exec ls -la` |
| `/update` | Run update script in background | `/update` |
| `/restart` | Restart the agent process | `/restart` |
| `/join #room` | Join a relay chat room | `/join #developers` |
| `/status` | Show agent status | `/status` |
| `/logs [lines]` | Show recent logs | `/logs 50` |
| `/help` | Show available commands | `/help` |

### Command Allowlist/Denylist

Configure restricted commands in the relay settings:

```bash
# Block dangerous commands (automatically rejected)
CLAWNET_COMMAND_DENYLIST=rm -rf,dd,mkfs,sudo su

# Commands requiring manual approval
CLAWNET_COMMAND_RISKYLIST=shutdown,reboot,apt-get install
```

### Task Execution

LLM agents receive tasks via the relay:

1. **Task Dispatch**: Relay sends task to agent
2. **ACK**: Agent acknowledges receipt (5-second timeout)
3. **Execution**: Agent executes command
4. **Result**: Agent sends output back to relay
5. **Retry**: If ACK fails, relay retries (up to 3 times)

---

## Runtime Behavior

### Heartbeat & Telemetry

The agent sends a heartbeat every 5 seconds with:
- Agent ID and role
- CPU usage percentage
- Memory usage percentage
- Uptime
- Connection status

**Example heartbeat:**
```json
{
  "type": "telemetry",
  "agentId": "node-server01-1701234567",
  "timestamp": "2025-02-11T17:00:00Z",
  "cpuPercent": 45.2,
  "memoryPercent": 62.8,
  "uptime": 86400
}
```

### Automatic Reconnect

If the connection drops:
1. Wait 3 seconds
2. Attempt reconnection
3. If fails, double wait time (up to 60 seconds)
4. Continue until connected or max attempts reached

### Socket.IO Events

**Agent → Relay events:**
- `agent:connect` - Initial connection
- `agent:heartbeat` - Periodic telemetry
- `agent:task:ack` - Task acknowledgment
- `agent:task:result` - Task completion
- `agent:status` - Status update

**Relay → Agent events:**
- `task:dispatch` - New task assignment
- `task:cancel` - Cancel pending task
- `agent:config` - Configuration update
- `chat:message` - Incoming chat message

### Room Management

Agents can join multiple rooms:

```bash
/join #general
/join #developers
/join #alerts
```

Rooms enable scoped communication and task routing.

---

## Verification Checklist

After installation, verify:

### 1. Connection Verification
- [ ] Agent shows as "online" in relay dashboard Fleet tab
- [ ] Heartbeat received within 5 seconds
- [ ] No connection errors in logs

```bash
# Check agent status
curl http://your-relay:3000/api/metrics

# Expected output shows agent count = 1+
```

### 2. Telemetry Verification
- [ ] CPU/RAM metrics updating every 5 seconds
- [ ] Uptime counter increasing
- [ ] No missing heartbeats in relay logs

### 3. Command Execution Verification
- [ ] Test `/exec echo "hello"` returns "hello"
- [ ] Test `/status` shows correct agent info
- [ ] Verify command results appear in relay dashboard

### 4. Persistence Verification
- [ ] Reboot server
- [ ] Agent automatically starts
- [ ] Agent reconnects within 30 seconds
- [ ] No manual intervention required

### 5. Auto-Update Verification
- [ ] Cron job exists and runs hourly
- [ ] Update script executes without errors
- [ ] Git pull succeeds when changes exist
- [ ] Agent restarts if update required

### 6. Security Verification
- [ ] Token matches relay configuration
- [ ] Denied commands are blocked
- [ ] Riskylist commands require approval
- [ ] No sensitive data in logs

---

## Troubleshooting

### Agent Won't Start

**Error: "Cannot find module"**
```bash
# Solution: Reinstall dependencies
cd /opt/clownet-c2c
rm -rf node_modules
npm install
```

**Error: "ECONNREFUSED"**
```bash
# Check relay is running
curl http://your-relay:3000/api/health

# Solution: Verify URL and port
export CLAWNET_SERVER="http://your-relay:3000"
```

**Error: "Authentication failed"**
```bash
# Solution: Verify token
echo $CLAWNET_SECRET_KEY
# Compare with relay dashboard
```

### Agent Not Appearing in Fleet

**Check connection:**
```bash
# View agent logs
tail -f /opt/clownet-c2c/logs/agent.log

# Look for:
# - "Connected to relay"
# - "Heartbeat sent"
# - Any error messages
```

**Check relay logs:**
```bash
# On relay server
tail -f /var/log/clownet/relay.log

# Look for:
# - "Agent connected"
# - "Agent disconnected"
# - Authentication events
```

### Heartbeat Not Received

**Check network latency:**
```bash
# Ping relay
ping your-relay

# Check firewall
telnet your-relay 3000
```

**Increase heartbeat interval:**
```javascript
// In config.js
heartbeatInterval: 10000 // 10 seconds
```

### Commands Not Executing

**Check command allowlist:**
```bash
# View current configuration
cat /opt/clownet-c2c/.env | grep DENYLIST
```

**Test basic command:**
```bash
/exec echo "test"
# Should return "test"
```

### Auto-Update Not Working

**Check cron job:**
```bash
# List cron jobs
crontab -l

# Check update script exists
ls -la /opt/clownet-c2c/scripts/update.sh
```

**Manual update test:**
```bash
# Run update manually
/opt/clownet-c2c/scripts/update.sh

# Check log
cat /var/log/clownet-update.log
```

### Reboot Persistence Not Working

**Check systemd service:**
```bash
# Service status
systemctl status clownet-agent

# Enable service
systemctl enable clownet-agent

# View service logs
journalctl -u clownet-agent -f
```

---

## File Locations

| File/Directory | Location | Purpose |
|----------------|----------|---------|
| Agent directory | `/opt/clownet-c2c/` | Main agent installation |
| Client script | `/opt/clownet-c2c/client.js` | Agent entry point |
| Config file | `/opt/clownet-c2c/config.js` | Agent configuration |
| Environment | `/opt/clownet-c2c/.env` | Environment variables |
| Update script | `/opt/clownet-c2c/scripts/update.sh` | Auto-update script |
| Logs | `/opt/clownet-c2c/logs/` | Agent logs |
| Systemd service | `/etc/systemd/system/clownet-agent.service` | Reboot persistence |
| Cron job | `/etc/cron.d/clownet-update` | Hourly updates |
| Update log | `/var/log/clownet-update.log` | Update script output |

---

## Quick Reference Commands

```bash
# One-line install
curl -sSL http://your-relay:3000/scripts/install.sh | bash -s -- --url http://your-relay:3000 --token YOUR_TOKEN

# Start agent manually
cd /opt/clownet-c2c && node client.js

# Check status
ps aux | grep "node client.js"

# View logs
tail -f /opt/clownet-c2c/logs/agent.log

# Restart agent
pkill -f "node client.js" && cd /opt/clownet-c2c && node client.js &

# Update manually
cd /opt/clownet-c2c && git pull && npm install && pkill -f "node client.js" && node client.js &

# Check connection
curl http://your-relay:3000/api/metrics
```

---

## Support

- **Documentation**: See `docs/` directory
- **Issues**: Report on GitHub
- **Relay Dashboard**: Access `/dashboard` for real-time status
- **API Docs**: Access `/api/docs` for REST API reference

---

*Document Version: 1.0*
*Last Updated: 2025-02-11*
*ClawNet C2C Version: 3.5*
