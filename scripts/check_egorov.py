import os, sys, io, paramiko
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("104.128.128.96", username="root", key_filename=os.path.expanduser("~/.ssh/hulk_deploy"))
def sh(cmd):
    _, o, e = c.exec_command(cmd, timeout=120)
    return o.read().decode("utf-8","replace") + e.read().decode("utf-8","replace")
pg = sh("docker ps -q --filter name=hulk-postgres-rlecri | head -n1").strip()

print("=== Клиент Егоров — ID и депозит ===")
print(sh(f"docker exec {pg} psql -U hulk -d hulk -c \"SELECT id, name, deposit_balance FROM clients WHERE name LIKE '%Егоров%' ORDER BY id;\""))

print("\n=== Аренды Егорова (последние 5) ===")
print(sh(f"docker exec {pg} psql -U hulk -d hulk -c \"SELECT r.id, r.status, r.start_at, r.end_planned_at, r.end_actual_at, r.archived_at, r.sum, r.rate FROM rentals r JOIN clients c ON c.id=r.client_id WHERE c.name LIKE '%Егоров%' ORDER BY r.id DESC LIMIT 5;\""))

print("\n=== debt_entries по последним арендам Егорова ===")
print(sh(f"docker exec {pg} psql -U hulk -d hulk -c \"SELECT de.id, de.rental_id, de.kind, de.amount, de.comment, de.created_at FROM debt_entries de JOIN rentals r ON r.id=de.rental_id JOIN clients c ON c.id=r.client_id WHERE c.name LIKE '%Егоров%' ORDER BY de.id DESC LIMIT 30;\""))

print("\n=== payments по последним арендам Егорова ===")
print(sh(f"docker exec {pg} psql -U hulk -d hulk -c \"SELECT p.id, p.rental_id, p.type, p.amount, p.paid, p.method, p.note, p.created_at FROM payments p JOIN rentals r ON r.id=p.rental_id JOIN clients c ON c.id=r.client_id WHERE c.name LIKE '%Егоров%' ORDER BY p.id DESC LIMIT 30;\""))

c.close()
