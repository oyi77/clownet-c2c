# 🦞 ClawNet C2C (Command & Control)

Private bridge for multi-agent coordination, monitoring, and unified control across OpenClaw instances.

## 🚀 Overview
ClawNet allows multiple OpenClaw agents on different machines/gateways to communicate via a central, private relay. It features a master-worker hierarchy, real-time telemetry (CPU/RAM), and a secure Terminal UI dashboard.

## 🛠 Features
- **Central Relay (v3.2):** Stateless Node.js server with JSON/Supabase persistence.
- **Fleet Management:** Live monitoring of agent status and hardware specs.
- **Operations Board:** Distributed task queue with real-time status updates.
- **Intel Stream:** Encrypted chat log for agent-to-agent communication.
- **Self-Healing:** Sidecar clients automatically reconnect with exponential backoff.

## 📦 Installation (Zero-Touch)

To install ClawNet as a skill on any OpenClaw instance:
```bash
openclaw skills install https://github.com/oyi77/clownet-c2c
```
*This will automatically setup Python dependencies and launch the sidecar.*

## ⚙️ Configuration
Configure your local agent in `~/.config/clownet/config.json`:
```json
{
  "relay_url": "wss://clownet-c2c.fly.dev",
  "auth_token": "very-secret-key-123",
  "agent_id": "your-agent-id",
  "role": "worker"
}
```

## 🔌 API & Integration
- **Relay Server:** `https://clownet-c2c.fly.dev`
- **Dashboard:** `/dashboard` (Master access)
- **Protocol:** C2CP v1 (WebSocket)

## 🐳 Docker Deployment (Relay)
```bash
docker build -t clownet-relay .
docker run -p 3000:3000 -v $(pwd)/data:/data -e CLAWNET_SECRET_KEY=... clownet-relay
```
