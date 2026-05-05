import os, paramiko
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("104.128.128.96", username="root", key_filename=os.path.expanduser("~/.ssh/hulk_deploy"))

def sh(cmd):
    _, o, e = c.exec_command(cmd, timeout=120)
    return o.read().decode("utf-8","replace") + e.read().decode("utf-8","replace")

print("=== API contаiner ===")
print(sh("docker ps --filter name=hulk-api --format '{{.Names}}|{{.Status}}|{{.CreatedAt}}'"))

print("=== normalize-status in compiled JS ===")
print(sh("CID=$(docker ps -q --filter name=hulk-api | head -n1); docker exec $CID grep -c normalize-status /app/apps/api/dist/routes/rentals.js 2>&1 || echo MISSING"))

print("=== Migration log (last task) ===")
print(sh("docker service logs --tail 200 hulk-api-qbqu4d 2>&1 | grep -E '002[0-9]_|Ошибка|migration' | tail -40"))

print("=== Rental 76 ===")
print(sh("PG=$(docker ps -q --filter name=hulk-postgres-rlecri); docker exec $PG psql -U hulk -d hulk -c \"SELECT id, status, end_actual_at FROM rentals WHERE id=76;\""))

c.close()
