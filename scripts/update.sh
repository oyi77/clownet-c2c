#!/bin/bash
cd "$(dirname "$0")/.."
echo "[*] ClawNet Client Auto-Updater"
echo "[*] Current directory: $(pwd)"

# Check if it's a git repo
if [ ! -d ".git" ]; then
    echo "[!] Not a git repository. Skipping git pull."
else
    echo "[*] Fetching latest changes..."
    git fetch
    LOCAL=$(git rev-parse HEAD 2>/dev/null || echo "")
    REMOTE=$(git rev-parse @{u} 2>/dev/null || echo "")

    if [ -n "$LOCAL" ] && [ "$LOCAL" != "$REMOTE" ]; then
        echo "[+] New version found. Updating..."
        git pull
        npm install --production
        UPDATED=true
    else
        echo "[*] Already up to date."
        UPDATED=false
    fi
fi

# Always ensure the client is running
echo "[*] Ensuring client is running..."
if pgrep -f "node client.js" > /dev/null; then
    echo "[*] Client is already running."
    # If we just pulled changes, we might want to restart it anyway
    if [ "$UPDATED" = "true" ]; then
        echo "[+] Restarting to apply updates..."
        pkill -f "node client.js" || true
        nohup node client.js >> client.log 2>&1 &
    fi
else
    echo "[+] Starting client..."
    nohup node client.js >> client.log 2>&1 &
fi

echo "[+] Operation complete."
