import socketio
import psutil
import platform
import os
import time
import subprocess
import json
import logging
from datetime import datetime

# Setup logging
LOG_FILE = "client.log"
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.FileHandler(LOG_FILE), logging.StreamHandler()]
)

SECRET_KEY = os.environ.get("CLAWNET_SECRET_KEY", "very-secret-key-123")
RELAY_URL = os.environ.get("CLAWNET_RELAY_URL", "wss://clownet-c2c.fly.dev")
AGENT_ID = os.environ.get("CLAWNET_AGENT_ID", platform.node())
ROLE = os.environ.get("CLAWNET_ROLE", "worker")

# Requirement: Absolute path for 'openclaw'
OPENCLAW_PATH = os.path.expanduser("~/.openclaw/bin/openclaw")
if not os.path.exists(OPENCLAW_PATH):
    # Fallback to which
    try:
        OPENCLAW_PATH = subprocess.check_output(["which", "openclaw"], text=True).strip()
    except:
        OPENCLAW_PATH = "openclaw"

logging.info(f"Using OpenClaw path: {OPENCLAW_PATH}")

sio = socketio.Client(reconnection_delay=5, reconnection_delay_max=30)

def get_system_specs():
    return {
        "cpu_percent": psutil.cpu_percent(),
        "ram_percent": psutil.virtual_memory().percent,
        "os": f"{platform.system()} {platform.release()}",
        "boot_time": datetime.fromtimestamp(psutil.boot_time()).isoformat()
    }

@sio.event
def connect():
    logging.info(f"Connected to relay at {RELAY_URL}")
    send_report()

@sio.event
def disconnect():
    logging.warning("Disconnected from relay")

@sio.on('state_sync')
def on_state_sync(data):
    logging.debug(f"State sync received")

@sio.on('message')
def on_message(data):
    """
    Handle broadcasted messages and commands.
    """
    content = data.get('content', '')
    sender_id = data.get('sender_id', 'unknown')
    msg_type = data.get('type', 'chat')
    task_id = data.get('task_id')
    
    logging.info(f"Message from {sender_id}: {content} (Type: {msg_type})")
    
    if msg_type == 'command':
        # Execute the command
        cmd_text = content
        if cmd_text.startswith('/'):
            cmd_text = cmd_text[1:]
        
        logging.info(f"Proxying command to OpenClaw: {cmd_text}")
        sio.emit('task_update', {"id": task_id, "status": "running", "agent_id": AGENT_ID})
        
        try:
            # Construct command: openclaw <cmd>
            full_cmd = f"{OPENCLAW_PATH} {cmd_text}"
            logging.info(f"Executing: {full_cmd}")
            
            process = subprocess.Popen(
                full_cmd, shell=True, 
                stdout=subprocess.PIPE, 
                stderr=subprocess.PIPE,
                text=True
            )
            stdout, stderr = process.communicate(timeout=120)
            
            status = "success" if process.returncode == 0 else "fail"
            result = {"stdout": stdout, "stderr": stderr, "code": process.returncode}
            
            logging.info(f"Command {status} with code {process.returncode}")
            sio.emit('task_update', {
                "id": task_id, 
                "status": status, 
                "agent_id": AGENT_ID,
                "result": result
            })
            
        except subprocess.TimeoutExpired:
            logging.error("Command timed out")
            sio.emit('task_update', {"id": task_id, "status": "fail", "agent_id": AGENT_ID, "result": "Timeout"})
        except Exception as e:
            logging.error(f"Execution error: {str(e)}")
            sio.emit('task_update', {"id": task_id, "status": "fail", "agent_id": AGENT_ID, "result": str(e)})

def send_report():
    try:
        payload = {
            "specs": get_system_specs(),
            "metadata": {
                "python_version": platform.python_version(),
                "pid": os.getpid(),
                "openclaw_path": OPENCLAW_PATH
            }
        }
        sio.emit('report', payload)
        
        if ROLE == "warden":
            sio.emit('traffic_log', {"type": "heartbeat", "agent_id": AGENT_ID, "timestamp": time.time()})
            
    except Exception as e:
        logging.error(f"Failed to send report: {e}")

if __name__ == "__main__":
    logging.info(f"Starting ClawNet Sidecar v2.1 for Agent: {AGENT_ID}")
    
    while True:
        try:
            if not sio.connected:
                sio.connect(
                    RELAY_URL, 
                    auth={"token": SECRET_KEY, "agent_id": AGENT_ID, "role": ROLE},
                    wait_timeout=10
                )
            
            send_report()
            time.sleep(30)
            
        except Exception as e:
            logging.error(f"Connection error: {e}. Retrying in 10s...")
            time.sleep(10)
