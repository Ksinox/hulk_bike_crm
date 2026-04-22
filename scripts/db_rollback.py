"""Откат БД на конкретный бэкап.

Usage:
  python scripts/db_rollback.py --list
      Показать доступные бэкапы на VPS с датами и размерами.

  python scripts/db_rollback.py --backup-now
      Сделать бэкап прямо сейчас (перед рискованным изменением).

  python scripts/db_rollback.py --restore hulk_2026-04-23_0330.sql.gz
      Восстановить БД из указанного файла. ВАЖНО: полностью перезапишет
      текущие данные. Перед восстановлением скрипт автоматически делает
      защитный бэкап 'before_rollback_*'.
"""
import argparse
import os
import sys
import paramiko

HOST = "104.128.128.96"
USER = "root"
BACKUP_DIR = "/root/hulk_backups"


def ssh():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, key_filename=os.path.expanduser("~/.ssh/hulk_deploy"))
    return c


def run(c, cmd, check=True):
    _, stdout, stderr = c.exec_command(cmd)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    if check and code != 0:
        print(f"CMD failed ({code}): {cmd}\nSTDOUT: {out}\nSTDERR: {err}", file=sys.stderr)
        sys.exit(code)
    return out, err, code


def cmd_list(c):
    out, _, _ = run(c, f"ls -lh {BACKUP_DIR}/*.sql.gz 2>/dev/null || echo '(пусто)'")
    print(out)


def cmd_backup_now(c):
    print("Запускаю бэкап…")
    out, _, _ = run(c, f"{BACKUP_DIR}/backup.sh 2>&1 && ls -lh {BACKUP_DIR}/*.sql.gz | tail -5")
    print(out)


def cmd_restore(c, filename):
    if "/" in filename or ".." in filename:
        print("filename не должен содержать / или ..", file=sys.stderr)
        sys.exit(2)

    remote = f"{BACKUP_DIR}/{filename}"
    out, _, code = run(c, f"test -f {remote} && echo ok || echo missing", check=False)
    if "ok" not in out:
        print(f"Файл не найден: {remote}", file=sys.stderr)
        sys.exit(3)

    print(f"!!! ВОССТАНОВЛЕНИЕ из {filename}")
    print("Текущие данные будут ПЕРЕЗАПИСАНЫ. Сначала сделаю защитный бэкап.")
    ans = input("Продолжить? [yes/no]: ").strip().lower()
    if ans != "yes":
        print("Отмена.")
        return

    # Защитный бэкап перед rollback
    safety_name = "before_rollback"
    print("Защитный бэкап…")
    run(c, f"{BACKUP_DIR}/backup.sh && mv $(ls -t {BACKUP_DIR}/hulk_*.sql.gz | head -1) "
           f"{BACKUP_DIR}/{safety_name}_$(date +%Y-%m-%d_%H%M).sql.gz")

    print(f"Восстанавливаю из {filename}…")
    restore_cmd = (
        f"CID=$(docker ps -q --filter 'name=hulk-postgres-rlecri' | head -n1); "
        f"gunzip -c {remote} | docker exec -i $CID psql -U hulk -d hulk -v ON_ERROR_STOP=1"
    )
    out, err, code = run(c, restore_cmd, check=False)
    if code != 0:
        print("ОШИБКА при восстановлении:", err[:2000], file=sys.stderr)
        print("Защитный бэкап сохранён, можно попробовать накатить его обратно.", file=sys.stderr)
        sys.exit(code)

    # Счётчики после восстановления
    check = (
        f"CID=$(docker ps -q --filter 'name=hulk-postgres-rlecri' | head -n1); "
        f"docker exec $CID psql -U hulk -d hulk -t -c "
        f"\"SELECT 'users: '||(SELECT COUNT(*) FROM users) || chr(10) || "
        f"'clients: '||(SELECT COUNT(*) FROM clients) || chr(10) || "
        f"'scooters: '||(SELECT COUNT(*) FROM scooters) || chr(10) || "
        f"'rentals: '||(SELECT COUNT(*) FROM rentals)\""
    )
    out, _, _ = run(c, check)
    print("Восстановление завершено. Состояние БД:")
    print(out)


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--list", action="store_true")
    g.add_argument("--backup-now", action="store_true")
    g.add_argument("--restore", metavar="FILENAME")
    args = ap.parse_args()

    c = ssh()
    try:
        if args.list:
            cmd_list(c)
        elif args.backup_now:
            cmd_backup_now(c)
        elif args.restore:
            cmd_restore(c, args.restore)
    finally:
        c.close()


if __name__ == "__main__":
    main()
