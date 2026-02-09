import subprocess
import json

OPENCLAW_BIN = "/Users/paijo/.nvm/versions/node/v22.18.0/bin/openclaw"

def test_brain(msg):
    print(f"[*] Testing Brain with message: '{msg}'")
    try:
        # Added --agent main to fix the missing session target error
        cmd = [OPENCLAW_BIN, "agent", "--agent", "main", "--message", msg, "--local", "--json"]
        
        result = subprocess.run(
            cmd, 
            capture_output=True, 
            text=True, 
            check=False
        )
        
        if result.returncode == 0:
            print("✅ SUCCESS")
            # Try to parse JSON output if possible
            try:
                data = json.loads(result.stdout)
                print("Response:", data)
            except:
                 print("Raw Output:", result.stdout[:200])
        else:
            print(f"❌ FAIL (Code {result.returncode})")
            print("Stderr:", result.stderr)

    except Exception as e:
        print(f"💥 CRASH: {e}")

test_brain("hi")
