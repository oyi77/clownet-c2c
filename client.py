import socketio
import os
import platform
import time
import uuid
import subprocess
import argparse
import sys

# Default fallback values
DEFAULT_SERVER = "https://clownet-c2c.fly.dev"
DEFAULT_TOKEN = "very-secret-key-123"

parser = argparse.ArgumentParser(description='ClawNet C2C Client Sidecar')
parser.add_argument('--url', default=os.getenv('CLAWNET_SERVER', DEFAULT_SERVER), help='Relay server URL')
parser.add_argument('--token', default=os.getenv('CLAWNET_SECRET_KEY', DEFAULT_TOKEN), help='Auth secret key')
parser.add_argument('--id', default=os.getenv('AGENT_ID', f"node-{str(uuid.uuid4())[:4]}"), help='Agent ID')
parser.add_argument('--role', default="worker", help='Agent role (master/worker)')
args = parser.parse_args()

sio = socketio.Client()

@sio.event
def connect():
    print(f"[*] Connected to ClawNet Relay as {args.id} ({args.role})")
    # Initial report
    report_status()

@sio.event
def disconnect():
    print("[!] Disconnected from server")

@sio.on('direct_message')
def on_message(data):
    print(f"[#] Message from {data['from']}: {data['msg']}")

def report_status():
    if sio.connected:
        print(f"[*] Sending heartbeat report...")
        # Get actual cron list from OpenClaw if possible
        try:
            cron_list = subprocess.check_output(["openclaw", "cron", "list", "--json"], stderr=subprocess.DEVNULL).decode()
        except:
            cron_list = "No local OpenClaw CLI found or no cronjobs."
        
        sio.emit('report', {
            'agent_id': args.id,
            'role': args.role,
            'cron': cron_list
        })

def main():
    print(f"[*] Connecting to {args.url}...")
    while True:
        try:
            sio.connect(args.url, auth={
                'token': args.token,
                'agent_id': args.id,
                'role': args.role
            })
            break
        except Exception as e:
            print(f"[!] Connection failed: {e}. Retrying in 5s...")
            time.sleep(5)
    
    try:
        while True:
            time.sleep(30) # Heartbeat every 30s for demo
            report_status()
    except KeyboardInterrupt:
        sio.disconnect()

if __name__ == "__main__":
    main()
