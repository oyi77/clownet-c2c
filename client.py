import socketio
import os
import platform
import time
import uuid
import subprocess
import argparse
import sys
import json

# Configuration
DEFAULT_SERVER = "wss://clownet-c2c.fly.dev"
DEFAULT_TOKEN = "very-secret-key-123"
OPENCLAW_BIN = "/Users/paijo/.nvm/versions/node/v22.18.0/bin/openclaw"

parser = argparse.ArgumentParser(description='ClawNet C2C Sidecar v3.7 (Clean Chat)')
parser.add_argument('--url', default=os.getenv('CLAWNET_SERVER', DEFAULT_SERVER))
parser.add_argument('--token', default=os.getenv('CLAWNET_SECRET_KEY', DEFAULT_TOKEN))
parser.add_argument('--id', default=os.getenv('AGENT_ID', f"node-{str(uuid.uuid4())[:4]}"))
parser.add_argument('--role', default="worker")
args = parser.parse_args()

sio = socketio.Client(reconnection=True, reconnection_attempts=0, reconnection_delay=5)

@sio.event
def connect():
    print(f"[*] Connected to HQ as {args.id}")
    report_status()

@sio.event
def disconnect():
    print("[!] Disconnected from HQ")

@sio.on('direct_message')
def on_direct_message(data):
    sender = data.get('from', 'unknown')
    msg = data.get('msg', '')
    print(f"[DM] From {sender}: {msg}")
    
    if sender == 'master-ui':
        process_instruction(msg, sender)

@sio.on('command')
def on_command(data):
    print(f"[CMD] Broadcast ID {data.get('id')}: {data.get('cmd')}")
    process_instruction(data.get('cmd'), 'master-ui', data.get('id'))

def process_instruction(msg, reply_to, task_id=None):
    response = ""
    try:
        if msg.startswith('/exec '):
            shell_cmd = msg.replace('/exec ', '')
            output = subprocess.check_output(shell_cmd, shell=True, stderr=subprocess.STDOUT).decode().strip()
            response = f"EXEC_RESULT:\n```\n{output}\n```"
        else:
            # Use ISOLATED session to avoid locking the main agent
            cmd = [
                OPENCLAW_BIN, "agent", 
                "--session-id", "clownet-sidecar", 
                "--message", msg, 
                "--local", 
                "--json"
            ]
            
            print(f"[*] Asking Isolated Brain: {msg}")
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            if result.returncode == 0:
                try:
                    data = json.loads(result.stdout)
                    # Extract CLEAN text from OpenClaw JSON response
                    if 'payloads' in data and len(data['payloads']) > 0:
                        response = data['payloads'][0].get('text', 'No text response.')
                    elif 'result' in data:
                        response = data['result']
                    else:
                        response = "Thinking..." # Fallback
                except:
                    # If parsing fails, clean up raw output
                    response = result.stdout.strip()
            else:
                response = f"BRAIN_ERROR (Code {result.returncode}): {result.stderr}"

        # Reply
        payload = {'to': reply_to, 'msg': response}
        sio.emit('message', payload)
        
        if task_id:
            sio.emit('task_result', {'id': task_id, 'status': 'SUCCESS', 'output': response})

    except Exception as e:
        error_msg = f"Sidecar Error: {str(e)}"
        print(error_msg)
        sio.emit('message', {'to': reply_to, 'msg': error_msg})
        if task_id:
            sio.emit('task_result', {'id': task_id, 'status': 'FAIL', 'output': error_msg})

def report_status():
    if sio.connected:
        try:
            import psutil
            specs = {'cpu': psutil.cpu_percent(), 'ram': psutil.virtual_memory().percent}
            sio.emit('report', {'agent_id': args.id, 'role': args.role, 'specs': specs})
        except:
            pass

def main():
    print(f"[*] ClawNet Sidecar v3.7 (Clean Chat) launching for {args.id}...")
    while True:
        try:
            sio.connect(args.url, auth={'token': args.token, 'agent_id': args.id, 'role': args.role})
            sio.wait()
        except Exception as e:
            print(f"[!] Connection failed: {e}. Retrying...")
            time.sleep(5)

if __name__ == "__main__":
    main()
