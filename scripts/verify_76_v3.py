import os, sys, io, time, paramiko
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("104.128.128.96", username="root", key_filename=os.path.expanduser("~/.ssh/hulk_deploy"))

def sh(cmd):
    _, o, e = c.exec_command(cmd, timeout=180)
    return o.read().decode("utf-8","replace") + e.read().decode("utf-8","replace")

# Поскольку новый image собран (15:54) с фиксом, но swarm всё ещё крутит
# старый — форсим service update.
print("=== Service tasks ДО force update ===")
print(sh("docker service ps hulk-api-qbqu4d --no-trunc --format '{{.ID}}|{{.Name}}|{{.Image}}|{{.CurrentState}}|{{.Error}}' | head -10"))

print("\n=== docker service update --force с увеличенным monitor для миграций ===")
# update-monitor=120s — даём время миграции и Fastify подняться
print(sh("docker service update --force --update-monitor 120s --update-failure-action continue hulk-api-qbqu4d 2>&1 | tail -20"))

print("\n=== Через 30s — состояние ===")
time.sleep(30)
print(sh("docker service ps hulk-api-qbqu4d --no-trunc --format '{{.ID}}|{{.Name}}|{{.Image}}|{{.CurrentState}}|{{.Error}}' | head -10"))

print("\n=== Логи самого свежего таска ===")
print(sh("docker service logs --tail 80 hulk-api-qbqu4d 2>&1 | tail -80"))

print("\n=== normalize-status в dist текущего контейнера ===")
print(sh("CID=$(docker ps -q --filter name=hulk-api | head -n1); echo \"running CID=$CID\"; docker exec $CID grep -c normalize-status /app/apps/api/dist/routes/rentals.js 2>&1 || echo MISSING"))

print("\n=== Аренда #76 ===")
print(sh("PG=$(docker ps -q --filter name=hulk-postgres-rlecri); docker exec $PG psql -U hulk -d hulk -c \"SELECT id, status, end_actual_at, updated_at FROM rentals WHERE id=76;\""))

c.close()
