import os, sys, io, paramiko
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("104.128.128.96", username="root", key_filename=os.path.expanduser("~/.ssh/hulk_deploy"))
def sh(cmd):
    _, o, e = c.exec_command(cmd, timeout=120)
    return o.read().decode("utf-8","replace") + e.read().decode("utf-8","replace")

cid = sh("docker ps -q --filter name=hulk-api | head -n1").strip()
print("=== API container ===")
print(sh("docker ps --filter name=hulk-api --format '{{.Names}}|{{.Status}}'"))

print("\n=== Sprint 4 канарейки ===")
markers = [
    "assertFinancialRole",
    "user_deactivated",
    "model_in_use",
    "rentals_one_open_per_scooter_idx",
]
for m in markers:
    res = sh(f"docker exec {cid} sh -c \"grep -rln '{m}' /app/apps/api/dist 2>/dev/null | head -1\"")
    print(f"  {m}: {res.strip() or 'MISSING'}")

print("\n=== Миграция 0030 применена ===")
print(sh(f"docker logs --tail 200 {cid} 2>&1 | grep '0030' | tail -5"))

print("\n=== Partial unique index в БД ===")
pg = sh("docker ps -q --filter name=hulk-postgres-rlecri | head -n1").strip()
print(sh(f"docker exec {pg} psql -U hulk -d hulk -c \"SELECT indexname, indexdef FROM pg_indexes WHERE indexname='rentals_one_open_per_scooter_idx';\""))

c.close()
