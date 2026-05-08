import os, sys, io, paramiko
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("104.128.128.96", username="root", key_filename=os.path.expanduser("~/.ssh/hulk_deploy"))
def sh(cmd):
    _, o, e = c.exec_command(cmd, timeout=120)
    return o.read().decode("utf-8","replace") + e.read().decode("utf-8","replace")
pg = sh("docker ps -q --filter name=hulk-postgres-rlecri | head -n1").strip()

print("=== Аренда #0111 — все rent-платежи ===")
print(sh(f"docker exec {pg} psql -U hulk -d hulk -c \"SELECT id, type, amount, paid, paid_at, method, note FROM payments WHERE rental_id=111 AND type='rent' ORDER BY id;\""))

print("\n=== Все аренды где остались дубли rent (после миграции 0035 должно быть 0) ===")
print(sh(f"docker exec {pg} psql -U hulk -d hulk -c \"SELECT pf.rental_id, pf.id AS placeholder_id, pf.amount FROM payments pf JOIN payments pt ON pf.rental_id=pt.rental_id AND pf.type='rent' AND pt.type='rent' AND pf.paid=false AND pt.paid=true AND pf.amount=pt.amount WHERE pf.id != pt.id LIMIT 10;\""))

print("\n=== Сколько вообще paid=false rent-платежей (это нормально, это активные аренды без оплаты) ===")
print(sh(f"docker exec {pg} psql -U hulk -d hulk -c \"SELECT count(*) FROM payments WHERE type='rent' AND paid=false;\""))

c.close()
