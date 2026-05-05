"""Проверка что новый код v0.4.34 реально в контейнерах."""
import os, sys, io, paramiko
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("104.128.128.96", username="root", key_filename=os.path.expanduser("~/.ssh/hulk_deploy"))
def sh(cmd):
    _, o, e = c.exec_command(cmd, timeout=120)
    return o.read().decode("utf-8","replace") + e.read().decode("utf-8","replace")

print("=== API container ===")
print(sh("docker ps --filter name=hulk-api --format '{{.Names}}|{{.Status}}'"))

cid = sh("docker ps -q --filter name=hulk-api | head -n1").strip()
print(f"\n=== overdue-scheduler в dist? ===")
print(sh(f"docker exec {cid} grep -c overdueScheduler /app/apps/api/dist/index.js 2>&1 || echo MISSING"))

print(f"\n=== payment_method enum 'deposit' добавлен? ===")
pg = sh("docker ps -q --filter name=hulk-postgres-rlecri | head -n1").strip()
print(sh(f"docker exec {pg} psql -U hulk -d hulk -t -c \"SELECT enumlabel FROM pg_enum WHERE enumtypid='payment_method'::regtype ORDER BY enumsortorder;\""))

print(f"\n=== Миграция 0029 применена ===")
print(sh(f"docker logs --tail 200 {cid} 2>&1 | grep -E '0029|payment_method' | tail -5"))

print(f"\n=== overdue-scheduler стартанул? ===")
print(sh(f"docker logs --tail 200 {cid} 2>&1 | grep -E 'overdue-scheduler' | tail -3"))

c.close()
