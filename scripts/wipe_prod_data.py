"""Очищает прод для тестирования заказчиком: TRUNCATE всех бизнес-таблиц
(клиенты, аренды, скутеры, платежи, инциденты, задачи, документы, файлы
в MinIO) + сбрасывает sequence'ы. Сохраняет пользователей.

Перед запуском делает защитный бэкап, чтобы можно было откатиться.
"""
import os
import paramiko

HOST = "104.128.128.96"
USER = "root"

# ВАЖНО: users и migrations НЕ трогаем.
TRUNCATE_SQL = """
-- Порядок не важен при RESTART IDENTITY CASCADE
TRUNCATE TABLE
  return_inspections,
  rental_incidents,
  rental_tasks,
  payments,
  rentals,
  scooter_documents,
  client_documents,
  clients,
  scooters
RESTART IDENTITY CASCADE;

-- Проверяем состояние
SELECT 'clients' as tbl, count(*) FROM clients
UNION ALL SELECT 'rentals', count(*) FROM rentals
UNION ALL SELECT 'scooters', count(*) FROM scooters
UNION ALL SELECT 'payments', count(*) FROM payments
UNION ALL SELECT 'users (keep!)', count(*) FROM users
ORDER BY tbl;
"""

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, key_filename=os.path.expanduser("~/.ssh/hulk_deploy"))

# 1) Защитный бэкап
print("=== Защитный бэкап перед очисткой ===")
_, stdout, _ = client.exec_command(
    "/root/hulk_backups/backup.sh && "
    "mv $(ls -t /root/hulk_backups/hulk_*.sql.gz | head -1) "
    "/root/hulk_backups/before_wipe_$(date +%Y-%m-%d_%H%M).sql.gz && "
    "ls -lh /root/hulk_backups/before_wipe_*.sql.gz | tail -1"
)
stdout.channel.recv_exit_status()
print(stdout.read().decode("utf-8", errors="replace"))

# 2) TRUNCATE
print("\n=== TRUNCATE бизнес-таблиц ===")
_, out, _ = client.exec_command("docker ps -q --filter 'name=hulk-postgres-rlecri' | head -n1")
cid = out.read().decode().strip()
print("postgres container:", cid)

sftp = client.open_sftp()
with sftp.open("/tmp/wipe.sql", "w") as f:
    f.write(TRUNCATE_SQL)
sftp.close()

client.exec_command(f"docker cp /tmp/wipe.sql {cid}:/tmp/wipe.sql")[1].channel.recv_exit_status()

_, stdout, stderr = client.exec_command(
    f"docker exec {cid} psql -U hulk -d hulk -f /tmp/wipe.sql"
)
out = stdout.read().decode("utf-8", errors="replace")
err = stderr.read().decode("utf-8", errors="replace")
print(out)
if err:
    print("STDERR:", err)

# 3) Очистка MinIO bucket hulk-docs
print("\n=== Очистка MinIO bucket hulk-docs ===")
_, out, _ = client.exec_command("docker ps --format '{{.Names}}' | grep -E 'hulk-minio.*minio' | head -n1")
minio_ct = out.read().decode().strip()
print("minio container:", minio_ct)

if minio_ct:
    # mc настроен внутри контейнера? Используем mc через docker exec
    setup = (
        f"docker exec {minio_ct} sh -c \""
        f"mc alias set local http://localhost:9000 hulkminio hulkminio_strong_prod_2026 2>/dev/null; "
        f"mc rm --recursive --force local/hulk-docs 2>&1 | tail -5; "
        f"mc ls local/hulk-docs 2>&1 || echo '(bucket пустой)'"
        f"\""
    )
    _, stdout, stderr = client.exec_command(setup)
    print(stdout.read().decode("utf-8", errors="replace"))
    serr = stderr.read().decode("utf-8", errors="replace")
    if serr:
        print("STDERR:", serr)

client.close()
print("\n=== ✓ Готово ===")
print("Защитный бэкап: /root/hulk_backups/before_wipe_*.sql.gz")
print("Откат: python scripts/db_rollback.py --restore before_wipe_<timestamp>.sql.gz")
