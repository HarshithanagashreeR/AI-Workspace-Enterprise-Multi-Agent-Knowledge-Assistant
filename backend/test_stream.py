import httpx
import json

try:
    # 1. Login to get token
    print("1. Logging in...")
    r = httpx.post("http://localhost:8000/api/auth/login", json={
        "email": "admin@workspace.com", 
        "password": "supersecretpassword"
    })
    r.raise_for_status()
    data = r.json()
    token = data["access_token"]
    print("   Token acquired.")

    # 2. Create conversation
    print("2. Creating conversation...")
    r2 = httpx.post("http://localhost:8000/api/chat/conversations", headers={
        "Authorization": f"Bearer {token}"
    })
    r2.raise_for_status()
    conv = r2.json()
    conv_id = conv["id"]
    print(f"   Created conversation ID: {conv_id}")

    # 3. Query stream
    print("3. Querying stream...")
    with httpx.stream("POST", f"http://localhost:8000/api/chat/conversations/{conv_id}/query", 
                      headers={"Authorization": f"Bearer {token}"}, 
                      json={"content": "Hello, what is in my document library?"},
                      timeout=30.0) as response:
        for line in response.iter_lines():
            if line:
                print(line)
except Exception as e:
    print(f"Test failed: {e}")
