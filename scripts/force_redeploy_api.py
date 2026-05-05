"""Жёсткий рестарт API: docker service update --force.

Dokploy `application.deploy` иногда отвечает OK без реального обновления
контейнера (наблюдалось: контейнер Up 5h после якобы успешного деплоя,
в dist/ старый код). Этот скрипт идёт через SSH и форсит пересоздание
service-task в Swarm.
"""
import os
import time
import urllib.request
import paramiko

HOST = "104.128.128.96"
USER = "root"
API_BASE = "https://api.hulkbike.ru"


def http_status(url: str) -> int:
    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status
    except Exception as e:
        code = getattr(e, "code", 0)
        return code if isinstance(code, int) else 0


client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, key_filename=os.path.expanduser("~/.ssh/hulk_deploy"))


def sh(cmd: str) -> str:
    _, stdout, stderr = client.exec_command(cmd, timeout=600)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    return out + (("\nERR: " + err) if err.strip() else "")


print("=== Текущие API-сервисы в Swarm ===")
print(sh("docker service ls --filter name=hulk-api"))

# имя service в выводе вроде "hulk-api-qbqu4d"
out = sh("docker service ls --filter name=hulk-api --format '{{.Name}}'")
svc = out.strip().splitlines()[0].strip() if out.strip() else None
if not svc:
    raise SystemExit("API service не найден")

print(f"\n=== docker service update --force {svc} ===")
print(sh(f"docker service update --force --update-parallelism 1 --update-delay 5s {svc}"))

print("\n=== Жду /health=200 (до 180s) ===")
deadline = time.time() + 180
last = -1
while time.time() < deadline:
    code = http_status(f"{API_BASE}/health")
    if code == 200:
        print("/health=200")
        break
    if code != last:
        print(f"  /health={code}")
        last = code
    time.sleep(5)

print("\n=== Проверяем что normalize-status появился в dist/ ===")
api_cid = sh("docker ps -q --filter 'name=hulk-api' | head -n1").strip()
print(f"API container: {api_cid}")
print(
    sh(
        f"docker exec {api_cid} sh -c 'grep -c normalize-status /app/apps/api/dist/routes/rentals.js 2>/dev/null || echo NOT_FOUND'"
    )
)

print("\n=== Дёрнем /debt для аренды 76 (без auth — ожидаем 401, не 404) ===")
print(f"GET /api/rentals/76/debt → {http_status(API_BASE + '/api/rentals/76/debt')}")
print(f"POST /api/rentals/76/normalize-status (через curl, ожидаем 401) →")
print(sh(f"curl -s -o /dev/null -w '%{{http_code}}' -X POST {API_BASE}/api/rentals/76/normalize-status"))

client.close()
