import os, sys, io, paramiko
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("104.128.128.96", username="root", key_filename=os.path.expanduser("~/.ssh/hulk_deploy"))
def sh(cmd):
    _, o, e = c.exec_command(cmd, timeout=120)
    return o.read().decode("utf-8","replace") + e.read().decode("utf-8","replace")

pg = sh("docker ps -q --filter name=hulk-postgres-rlecri | head -n1").strip()

print("=== Аренда #51 ===")
print(sh(f"docker exec {pg} psql -U hulk -d hulk -c \"SELECT id, scooter_id, client_id, status, start_at, end_planned_at, end_actual_at, archived_at, archived_by FROM rentals WHERE id=51;\""))

print("\n=== Все live-аренды на скутере 50 ===")
print(sh(f"docker exec {pg} psql -U hulk -d hulk -c \"SELECT id, status, end_planned_at, archived_at FROM rentals WHERE scooter_id=50 AND status IN ('active','overdue','returning') ORDER BY id;\""))

print("\n=== Скутер 50 ===")
print(sh(f"docker exec {pg} psql -U hulk -d hulk -c \"SELECT id, name, base_status FROM scooters WHERE id=50;\""))

c.close()
