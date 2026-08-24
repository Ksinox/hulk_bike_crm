"""Диагностика: почему на проде пропали штрафы за просрочку (24.08.2026)."""
import os, sys, io, paramiko

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("104.128.128.96", username="root",
          key_filename=os.path.expanduser("~/.ssh/hulk_deploy"))


def sh(cmd, timeout=120):
    _, o, e = c.exec_command(cmd, timeout=timeout)
    return o.read().decode("utf-8", "replace") + e.read().decode("utf-8", "replace")


pg = sh("docker ps -q --filter name=hulk-postgres-rlecri | head -n1").strip()
print("postgres container:", pg or "НЕ НАЙДЕН")


def q(sql, title):
    print(f"\n=== {title} ===")
    print(sh(f'docker exec {pg} psql -U hulk -d hulk -c "{sql}"'))


# 1. Свежие записи долговых операций — что появилось за сутки
q("SELECT kind, COUNT(*), MIN(created_at) AS first, MAX(created_at) AS last "
  "FROM debt_entries WHERE created_at > now() - interval '3 days' "
  "GROUP BY kind ORDER BY 2 DESC;",
  "debt_entries за 3 дня по типам")

# 2. Все прощения/оплаты штрафа за сутки — кто и когда
q("SELECT id, rental_id, kind, amount, applied_to_end_planned, created_at, created_by "
  "FROM debt_entries WHERE kind LIKE '%fine%' "
  "AND created_at > now() - interval '2 days' ORDER BY created_at DESC LIMIT 40;",
  "операции по штрафам за 2 суток")

# 3. Активные просроченные аренды — что сейчас с расчётом
q("SELECT r.id, r.rate, r.rate_unit, r.end_planned_at::date AS end_planned, "
  "(CURRENT_DATE - r.end_planned_at::date) AS overdue_days "
  "FROM rentals r WHERE r.status='active' AND r.archived_at IS NULL "
  "AND r.end_planned_at::date < CURRENT_DATE ORDER BY r.id;",
  "просроченные активные аренды")

# 4. Их долговые записи
q("SELECT rental_id, kind, SUM(amount) AS total, COUNT(*) AS cnt "
  "FROM debt_entries WHERE rental_id IN ("
  "SELECT id FROM rentals WHERE status='active' AND archived_at IS NULL "
  "AND end_planned_at::date < CURRENT_DATE) "
  "GROUP BY rental_id, kind ORDER BY rental_id, kind;",
  "долговые записи просроченных аренд")

# 5. Журнал за сутки — массовые действия
q("SELECT action, COUNT(*) FROM activity_log "
  "WHERE created_at > now() - interval '2 days' GROUP BY action ORDER BY 2 DESC LIMIT 25;",
  "журнал действий за 2 суток")

c.close()
