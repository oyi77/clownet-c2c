import socketio
import os
import platform
import time
import uuid
import subprocess

SERVER_URL = os.getenv('CLAWNET_SERVER', 'http://localhost:3000')
SECRET_KEY = os.getenv('CLAWNET_SECRET_KEY', 'CLAWNET_SECRET_KEY')
AGENT_ID = str(uuid.uuid4())[:8]
HOSTNAME = platform.node()

sio = socketio.Client()

@sio.event
def connect():
    print(f"Connected to server as {AGENT_ID}")

@sio.event
def disconnect():
    print("Disconnected from server")

@sio.on('command')
def on_command(data):
    print(f"Received command: {data}")
    # Run shell command and report back
    try:
        result = subprocess.check_output(data['cmd'], shell=True, stderr=subprocess.STDOUT)
        sio.emit('cmd_result', {'id': data['id'], 'output': result.decode()})
    except Exception as e:
        sio.emit('cmd_result', {'id': data['id'], 'output': str(e)})

def report_cron(name, status):
    if sio.connected:
        sio.emit('cron_report', {'name': name, 'status': status})

def main():
    while True:
        try:
            sio.connect(f"{SERVER_URL}?agentId={AGENT_ID}&hostname={HOSTNAME}", 
                        auth={'token': SECRET_KEY})
            break
        except Exception as e:
            print(f"Connection failed: {e}. Retrying in 5s...")
            time.sleep(5)
    
    # Simple "cron" simulation loop
    try:
        while True:
            # Example: Simulate a cron job running every 60s
            time.sleep(60)
            report_cron("heartbeat_task", "success")
    except KeyboardInterrupt:
        sio.disconnect()

if __name__ == "__main__":
    main()
