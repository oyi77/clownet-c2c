import socketio
import psutil
import platform
import os
import time
import subprocess
import json
import logging
from datetime import datetime
import random

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
OPENCLAW_PATH = os.environ.get("OPENCLAW_BIN_PATH", "openclaw")

logging.info(f"Using OpenClaw path: {OPENCLAW_PATH}")

sio = socketio.Client(reconnection=True, reconnection_delay=5, reconnection_delay_max=30)

def get_system_specs():
    return {
        "cpu_percent": psutil.cpu_percent(),
        "ram_percent": psutil.virtual_memory().percent,
        "os": f"{platform.system()} {platform.release()}",
        "boot_time": datetime.fromtimestamp(psutil.boot_time()).isoformat()
    }

def get_active_sessions():
    try:
        # Run 'openclaw sessions list --json'
        cmd = f"{OPENCLAW_PATH} sessions list --json"
        result = subprocess.check_output(cmd, shell=True, text=True)
        sessions = json.loads(result)
        return sessions
    except Exception as e:
        # Only log warning if not just command not found, to avoid spam
        # logging.warning(f"Failed to get active sessions: {e}")
        return []

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
        if task_id:
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
            if task_id:
                sio.emit('task_update', {
                    "id": task_id, 
                    "status": status, 
                    "agent_id": AGENT_ID,
                    "result": result
                })
            
        except subprocess.TimeoutExpired:
            logging.error("Command timed out")
            if task_id:
                sio.emit('task_update', {"id": task_id, "status": "fail", "agent_id": AGENT_ID, "result": "Timeout"})
        except Exception as e:
            logging.error(f"Execution error: {str(e)}")
            if task_id:
                sio.emit('task_update', {"id": task_id, "status": "fail", "agent_id": AGENT_ID, "result": str(e)})

def send_report():
    try:
        payload = {
            "specs": get_system_specs(),
            "metadata": {
                "python_version": platform.python_version(),
                "pid": os.getpid(),
                "openclaw_path": OPENCLAW_PATH
            },
            "sessions": get_active_sessions()
        }
        sio.emit('report', payload)
        
        if ROLE == "warden":
            sio.emit('traffic_log', {"type": "heartbeat", "agent_id": AGENT_ID, "timestamp": time.time()})
            
    except Exception as e:
        logging.error(f"Failed to send report: {e}")

def main_loop():
    retry_delay = 5
    max_delay = 60
    
    while True:
        try:
            logging.info(f"Starting ClawNet Sidecar v3.2 for Agent: {AGENT_ID}")
            if not sio.connected:
                sio.connect(
                    RELAY_URL, 
                    auth={"token": SECRET_KEY, "agent_id": AGENT_ID, "role": ROLE},
                    wait_timeout=10
                )
            
            # Main heartbeat loop
            while True:
                if not sio.connected:
                    break # Break inner loop to trigger reconnection logic
                
                send_report()
                time.sleep(30)
                
        except Exception as e:
            logging.error(f"Crash in main loop: {e}")
        
        # Exponential backoff for reconnection/restart
        logging.info(f"Restarting in {retry_delay} seconds...")
        time.sleep(retry_delay)
        retry_delay = min(retry_delay * 2, max_delay)

if __name__ == "__main__":
    try:
        main_loop()
    except KeyboardInterrupt:
        logging.info("Stopping Sidecar...")
