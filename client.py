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
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.FileHandler("client.log"), logging.StreamHandler()]
)

SECRET_KEY = os.environ.get("CLAWNET_SECRET_KEY", "very-secret-key-123")
RELAY_URL = os.environ.get("CLAWNET_RELAY_URL", "http://localhost:3000")
AGENT_ID = os.environ.get("CLAWNET_AGENT_ID", platform.node())
ROLE = os.environ.get("CLAWNET_ROLE", "worker")

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
    logging.debug(f"State sync received: {len(data.get('agents', []))} agents online")

@sio.on('command')
def on_command(data):
    """
    Improved command execution with turn proxying.
    Any 'master' can send a command.
    """
    cmd = data.get('cmd')
    task_id = data.get('task_id')
    logging.info(f"Executing command: {cmd} (Task: {task_id})")
    
    sio.emit('task_update', {"id": task_id, "status": "running", "agent_id": AGENT_ID})
    
    try:
        # Improved execution with timeout and output capture
        process = subprocess.Popen(
            cmd, shell=True, 
            stdout=subprocess.PIPE, 
            stderr=subprocess.PIPE,
            text=True
        )
        stdout, stderr = process.communicate(timeout=60)
        
        status = "completed" if process.returncode == 0 else "failed"
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
        sio.emit('task_update', {"id": task_id, "status": "failed", "agent_id": AGENT_ID, "result": "Timeout"})
    except Exception as e:
        logging.error(f"Execution error: {str(e)}")
        sio.emit('task_update', {"id": task_id, "status": "failed", "agent_id": AGENT_ID, "result": str(e)})

def send_report():
    try:
        payload = {
            "specs": get_system_specs(),
            "metadata": {
                "python_version": platform.python_version(),
                "pid": os.getpid()
            }
        }
        sio.emit('report', payload)
        
        # If we are a warden, we could also emit traffic_log here or hooks
        if ROLE == "warden":
            sio.emit('traffic_log', {"type": "heartbeat", "agent_id": AGENT_ID, "timestamp": time.time()})
            
    except Exception as e:
        logging.error(f"Failed to send report: {e}")

if __name__ == "__main__":
    logging.info(f"Starting ClawNet Sidecar v2.0 for Agent: {AGENT_ID}")
    
    while True:
        try:
            if not sio.connected:
                sio.connect(
                    RELAY_URL, 
                    auth={"token": SECRET_KEY, "agent_id": AGENT_ID, "role": ROLE}
                )
            
            # Periodic report and specs sync
            send_report()
            time.sleep(30)
            
        except Exception as e:
            logging.error(f"Connection error: {e}. Retrying in 10s...")
            time.sleep(10)
