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

print("\n=== Sprint 3 канарейки в dist ===")
markers = [
    "invalid_status_transition",   # 3.6 PATCH whitelist
    "damage_pending",              # 3.2 DELETE gating
    "unpaid_extras",               # 3.7 complete block
    "mixedForgive",                # 3.8 mixed split
    "revert-police",               # 3.1 revert from police (web)
]
for m in markers:
    found = sh(f"docker exec {cid} grep -rl --include='*.js' '{m}' /app/apps/api/dist/ 2>/dev/null | head -1").strip()
    print(f"  {m}: {'OK' if found else 'MISSING'}")

print("\n=== overdue-scheduler работает ===")
print(sh(f"docker logs --tail 300 {cid} 2>&1 | grep -E 'overdue-scheduler' | tail -5"))

print("\n=== аренда #76 в проде (была залипшая) ===")
pg = sh("docker ps -q --filter name=hulk-postgres-rlecri | head -n1").strip()
print(sh(f"docker exec {pg} psql -U hulk -d hulk -c \"SELECT id, status, end_actual_at, archived_at FROM rentals WHERE id IN (61, 67, 76, 79);\""))

print("\n=== payments последние с method=deposit ===")
print(sh(f"docker exec {pg} psql -U hulk -d hulk -c \"SELECT id, rental_id, type, amount, method FROM payments WHERE method='deposit' ORDER BY id DESC LIMIT 5;\""))

c.close()
