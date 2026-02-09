import subprocess
import json

OPENCLAW_BIN = "/Users/paijo/.nvm/versions/node/v22.18.0/bin/openclaw"

def test_brain(msg):
    print(f"[*] Testing Brain with message: '{msg}'")
    try:
        # Use --local flag to force local execution without gateway HTTP dependency
        cmd = [OPENCLAW_BIN, "agent", "--message", msg, "--local", "--json"]
        
        result = subprocess.run(
            cmd, 
            capture_output=True, 
            text=True, 
            check=False # Don't throw error on non-zero exit, capture stderr instead
        )
        
        if result.returncode == 0:
            print("✅ SUCCESS")
            print("Output:", result.stdout[:200])
        else:
            print(f"❌ FAIL (Code {result.returncode})")
            print("Stderr:", result.stderr)

    except Exception as e:
        print(f"💥 CRASH: {e}")

test_brain("hi")
