import requests
import json

BASE_URL = "http://127.0.0.1:18789"

endpoints = [
    ("/v1/agent", "POST", {"message": "hi"}),
    ("/agent", "POST", {"message": "hi"}),
    ("/api/agent", "POST", {"message": "hi"}),
    ("/v1/chat/completions", "POST", {"messages": [{"role": "user", "content": "hi"}], "model": "gpt-3.5-turbo"})
]

print(f"[*] Testing Local Gateway API at {BASE_URL}...")

for ep, method, payload in endpoints:
    url = f"{BASE_URL}{ep}"
    try:
        if method == "POST":
            res = requests.post(url, json=payload, timeout=2)
        print(f"[{method}] {ep} -> {res.status_code}")
        if res.status_code == 200:
            print(f"   SUCCESS! Response: {res.text[:100]}...")
            break
    except Exception as e:
        print(f"[{method}] {ep} -> ERROR: {e}")
