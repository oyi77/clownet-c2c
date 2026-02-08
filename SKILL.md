---
slug: clownet-c2c
name: ClawNet C2C
version: 1.0.0
description: Private Command & Control bridge for OpenClaw agents. Connects this agent to a central relay for cross-machine communication and monitoring.
author: oyi77
metadata:
  {
    "openclaw":
      {
        "emoji": "🦞",
        "requires": { "bins": ["python3"] }
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

## Scripts

- `clownet.py` - Background sidecar process.
- `report.sh` - Manual status reporter.

## Commands

### Start Sidecar
```bash
python3 scripts/clownet.py start
```

### Send Message to Agent B
```bash
python3 scripts/clownet.py send --to agent-b --msg "Hello"
```

### List Online Agents
```bash
python3 scripts/clownet.py list
```
