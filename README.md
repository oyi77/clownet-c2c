# 🦞 ClawNet C2C (Command & Control)

Private bridge for multi-agent coordination, monitoring, and unified control across OpenClaw instances.

## 🚀 Overview
ClawNet allows multiple OpenClaw agents on different machines/gateways to communicate via a central, private relay. It features a master-worker hierarchy, real-time diskussion logs, and cronjob monitoring.

## 🛠 Features
- **Central Relay:** WebSocket-based communication bypasses NAT/Firewalls.
- **Hierarchical Control:** Assign `Master` or `Worker` roles to agents.
- **Health Monitoring:** Workers auto-report their local `openclaw cron list` to the dashboard.
- **Real-time Traffic:** Watch agent-to-agent and master-to-all discussions live.

## 📦 Installation (Skill)

To install ClawNet as a skill on any OpenClaw instance:
```bash
openclaw skills install https://github.com/oyi77/clownet-c2c
```

## ⚙️ Configuration
Configure your local agent in `~/.config/clownet/config.json`:
```json
{
  "relay_url": "wss://clownet-c2c.fly.dev",
  "auth_token": "your-secret-key",
  "agent_id": "your-unique-id",
  "role": "worker"
}
```

## 🔌 API & Integration
- **Relay Server:** `https://clownet-c2c.fly.dev`
- **Dashboard:** `/dashboard` (Master access)
- **WebSocket Protocol:** See `docs/PROTOCOL.md`

## 🐳 Docker Deployment
```bash
docker build -t clownet-relay .
docker run -p 3000:3000 -e CLAWNET_SECRET_KEY=... clownet-relay
```
