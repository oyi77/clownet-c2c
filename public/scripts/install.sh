#!/bin/bash
# ClawNet C2C Agent Installer
set -e

echo "🦞 [ClawNet] Starting installation..."

# 1. Detect Node.js
if command -v node &>/dev/null; then
    echo "[*] Node.js detected: $(node -v)"
else
    echo "[!] Error: Node.js is required for ClawNet client."
    exit 1
fi

# 2. Install dependencies
echo "[*] Installing dependencies..."
npm install --production

# 3. Setup auto-update script
echo "[*] Setting up auto-update script..."
cat > scripts/update.sh << 'EOF'
#!/bin/bash
cd "$(dirname "$0")/.."
echo "[*] Checking for updates..."
git fetch
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse @{u})

if [ "$LOCAL" != "$REMOTE" ]; then
    echo "[+] New version found. Updating..."
    git pull
    npm install --production
    echo "[+] Restarting client..."
    pkill -f "node client.js" || true
    nohup node client.js >> client.log 2>&1 &
    echo "[+] Update complete."
else
    echo "[*] Already up to date."
fi
EOF
chmod +x scripts/update.sh

# 4. Add to crontab for hourly updates and reboot persistence
(crontab -l 2>/dev/null | grep -v "scripts/update.sh" | grep -v "node client.js" || true; 
 echo "0 * * * * $(pwd)/scripts/update.sh"
 echo "@reboot cd $(pwd) && nohup node client.js >> client.log 2>&1 &") | crontab -

# 5. Start the client
echo "[*] Launching ClawNet client in background..."
pkill -f "node client.js" || true
nohup node client.js >> client.log 2>&1 &

echo "✅ [ClawNet] Installation complete. Agent is now active."
echo "💡 Hint: Client logs are available in $(pwd)/client.log"

