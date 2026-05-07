import os, sys, io, paramiko
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("104.128.128.96", username="root", key_filename=os.path.expanduser("~/.ssh/hulk_deploy"))
def sh(cmd):
    _, o, e = c.exec_command(cmd, timeout=120)
    return o.read().decode("utf-8","replace") + e.read().decode("utf-8","replace")
pg = sh("docker ps -q --filter name=hulk-postgres-rlecri | head -n1").strip()

print("=== Скутер по имени 'Jog #50' ===")
print(sh(f"docker exec {pg} psql -U hulk -d hulk -c \"SELECT id, name, base_status FROM scooters WHERE name='Jog #50';\""))

print("\n=== ВСЕ аренды на этот скутер ===")
print(sh(f"docker exec {pg} psql -U hulk -d hulk -c \"SELECT r.id, r.scooter_id, r.client_id, r.status, r.archived_at, r.archived_by, r.start_at, r.end_planned_at FROM rentals r JOIN scooters s ON s.id=r.scooter_id WHERE s.name='Jog #50' ORDER BY r.id;\""))

print("\n=== Архивные с status=active/overdue (по всем скутерам) — это инвариант-bust ===")
print(sh(f"docker exec {pg} psql -U hulk -d hulk -c \"SELECT id, scooter_id, status, archived_at, archived_by FROM rentals WHERE archived_at IS NOT NULL AND status IN ('active','overdue','returning') ORDER BY id;\""))

c.close()
