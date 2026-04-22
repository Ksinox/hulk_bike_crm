#!/usr/bin/env python3
"""Минимальный клиент Dokploy API для нашего деплоя."""
import json
import os
import sys
import urllib.request


BASE = "http://104.128.128.96:3000"
TOKEN = os.environ.get("DOKPLOY_TOKEN")
if not TOKEN:
    print("set DOKPLOY_TOKEN env var", file=sys.stderr)
    sys.exit(2)


def api(path, body=None, method="POST"):
    url = f"{BASE}{path}"
    headers = {"x-api-key": TOKEN, "Content-Type": "application/json"}
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=900) as r:
            raw = r.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8")
        try:
            sys.stderr.buffer.write(f"HTTP {e.code} {path}: ".encode("utf-8"))
            sys.stderr.buffer.write(raw[:800].encode("utf-8"))
            sys.stderr.buffer.write(b"\n")
            sys.stderr.buffer.flush()
        except Exception:
            pass
        return None
    try:
        return json.loads(raw)
    except Exception:
        return raw


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "call":
        path = sys.argv[2]
        body = json.loads(sys.argv[3]) if len(sys.argv) > 3 else None
        res = api(path, body)
        print(json.dumps(res, ensure_ascii=False, indent=2))
    else:
        print("usage: dokploy.py call /api/path.method '<json body>'")
