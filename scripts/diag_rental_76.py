"""Диагностика залипшей в 'problem' аренды #76 — выгребает данные из проды."""
import os
import paramiko

HOST = "104.128.128.96"
USER = "root"

SQL = """
\\echo === RENTAL CHAIN ===
WITH RECURSIVE chain AS (
  SELECT id, parent_rental_id, status, end_actual_at, scooter_id, client_id, deposit, archived_at
    FROM rentals WHERE id = 76
  UNION ALL
  SELECT r.id, r.parent_rental_id, r.status, r.end_actual_at, r.scooter_id, r.client_id, r.deposit, r.archived_at
    FROM rentals r JOIN chain c ON r.parent_rental_id = c.id OR r.id = c.parent_rental_id
)
SELECT DISTINCT * FROM chain ORDER BY id;

\\echo === DAMAGE REPORTS for rental 76 ===
SELECT id, rental_id, total, deposit_covered, client_agreement, created_at
  FROM damage_reports WHERE rental_id = 76;

\\echo === ALL PAYMENTS for rental 76 ===
SELECT id, rental_id, type, amount, paid, damage_report_id, paid_at, note, created_at
  FROM payments WHERE rental_id = 76 ORDER BY id;

\\echo === DEBT ENTRIES for rental 76 ===
SELECT id, rental_id, kind, amount, comment, created_at
  FROM debt_entries WHERE rental_id = 76 ORDER BY id;

\\echo === Rental row itself ===
SELECT id, status, end_actual_at, archived_at, deposit, rate, total_amount, updated_at
  FROM rentals WHERE id = 76;
"""

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, key_filename=os.path.expanduser("~/.ssh/hulk_deploy"))

_, stdout, _ = client.exec_command("docker ps -q --filter 'name=hulk-postgres-rlecri'")
cid = stdout.read().decode().strip()
print("postgres container:", cid)

sftp = client.open_sftp()
with sftp.open("/tmp/diag76.sql", "w") as f:
    f.write(SQL)
sftp.close()

_, stdout, _ = client.exec_command(f"docker cp /tmp/diag76.sql {cid}:/tmp/diag76.sql")
stdout.channel.recv_exit_status()

_, stdout, stderr = client.exec_command(f"docker exec {cid} psql -U hulk -d hulk -f /tmp/diag76.sql")
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err.strip():
    print("STDERR:", err)

# Also check what API container is currently running and its build hash
_, stdout, _ = client.exec_command(
    "docker ps --filter 'name=hulk-api' --format '{{.Names}} {{.Image}} {{.Status}} {{.CreatedAt}}'"
)
print("=== API container ===")
print(stdout.read().decode("utf-8", errors="replace"))

# Check normalize-status route is in compiled JS inside the API container
_, stdout, _ = client.exec_command(
    "docker ps -q --filter 'name=hulk-api' | head -n1"
)
api_cid = stdout.read().decode().strip()
if api_cid:
    _, stdout, _ = client.exec_command(
        f"docker exec {api_cid} sh -c 'grep -l normalize-status /app/apps/api/dist/routes/rentals.js 2>/dev/null || grep -lr normalize-status /app/dist 2>/dev/null || echo NOT_FOUND'"
    )
    print("=== normalize-status in compiled API ===")
    print(stdout.read().decode("utf-8", errors="replace"))

client.close()
