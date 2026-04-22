"""Разворачивает на VPS ежедневный pg_dump + retention 14 дней.

На хосте создаётся /root/hulk_backups/ со скриптом backup.sh и cron-джобой
в /etc/cron.d/hulk-db-backup. Дамп пишется в hulk_YYYY-MM-DD_HHMM.sql.gz.

Откат — через scripts/db_rollback.py.
"""
import os
import paramiko

HOST = "104.128.128.96"
USER = "root"

BACKUP_SH = r"""#!/usr/bin/env bash
# Ежедневный бэкап Postgres hulk в /root/hulk_backups/.
# Запускается cron'ом, хранит 14 дней.
set -euo pipefail

BACKUP_DIR=/root/hulk_backups
mkdir -p "$BACKUP_DIR"

CID=$(docker ps -q --filter 'name=hulk-postgres-rlecri' | head -n1)
if [ -z "$CID" ]; then
  echo "$(date -Iseconds) postgres container not found" >&2
  exit 1
fi

TS=$(date +%Y-%m-%d_%H%M)
OUT="$BACKUP_DIR/hulk_${TS}.sql.gz"

# pg_dump с --clean --if-exists чтобы rollback перезаписывал чисто
docker exec "$CID" pg_dump -U hulk -d hulk --clean --if-exists --no-owner --no-privileges \
  | gzip -9 > "$OUT"

# retention: хранить 14 дней
find "$BACKUP_DIR" -name 'hulk_*.sql.gz' -type f -mtime +14 -delete

# логи
SIZE=$(stat -c%s "$OUT")
echo "$(date -Iseconds) backup ok: $OUT ($SIZE bytes)" >> "$BACKUP_DIR/backup.log"
"""

CRON = """# Ежедневный бэкап Postgres hulk-crm в 03:30 МСК
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
30 3 * * * root /root/hulk_backups/backup.sh >> /root/hulk_backups/backup.log 2>&1
"""

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, key_filename=os.path.expanduser("~/.ssh/hulk_deploy"))

sftp = client.open_sftp()
client.exec_command("mkdir -p /root/hulk_backups")[1].channel.recv_exit_status()

with sftp.open("/root/hulk_backups/backup.sh", "w") as f:
    f.write(BACKUP_SH)
client.exec_command("chmod +x /root/hulk_backups/backup.sh")[1].channel.recv_exit_status()

with sftp.open("/etc/cron.d/hulk-db-backup", "w") as f:
    f.write(CRON)
client.exec_command("chmod 644 /etc/cron.d/hulk-db-backup && systemctl reload cron || systemctl restart cron")[1].channel.recv_exit_status()

# разовый запуск прямо сейчас, чтобы был свежий бэкап
print("Запускаю первый бэкап...")
_, stdout, stderr = client.exec_command("/root/hulk_backups/backup.sh 2>&1; ls -lh /root/hulk_backups/*.sql.gz")
print(stdout.read().decode("utf-8", errors="replace"))
err = stderr.read().decode("utf-8", errors="replace")
if err:
    print("STDERR:", err)

sftp.close()
client.close()
print("Готово. Cron настроен: ежедневно 03:30 МСК, retention 14 дней.")
