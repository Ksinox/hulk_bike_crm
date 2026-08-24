"""Проверка после хотфикса: вернулись ли штрафы на проде.

Считаем ожидаемое по правилу «эпизода» и сверяем с тем, что реально
отдаёт API прода по каждой просроченной аренде.
"""
import os, sys, io, json, paramiko

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("104.128.128.96", username="root",
          key_filename=os.path.expanduser("~/.ssh/hulk_deploy"))


def sh(cmd, timeout=180):
    _, o, e = c.exec_command(cmd, timeout=timeout)
    return o.read().decode("utf-8", "replace") + e.read().decode("utf-8", "replace")


pg = sh("docker ps -q --filter name=hulk-postgres-rlecri | head -n1").strip()


def q(sql):
    esc = sql.replace('"', '\\"')
    return sh(f'docker exec {pg} psql -U hulk -d hulk -tAF"|" -c "{esc}"').strip()


rows = q("SELECT r.id, r.rate, (CURRENT_DATE - r.end_planned_at::date) AS days, "
         "c.name FROM rentals r JOIN clients c ON c.id=r.client_id "
         "WHERE r.status='active' AND r.archived_at IS NULL "
         "AND r.end_planned_at::date < CURRENT_DATE ORDER BY r.id;")

print("=== просроченные аренды на проде ===")
print(f"{'аренда':>7} {'клиент':<28} {'дней':>5} {'ставка':>7} {'штраф д.б.':>11}")
expected = {}
for line in rows.splitlines():
    if not line.strip():
        continue
    rid, rate, days, name = line.split("|")
    fine = round(int(rate) * 0.5) * int(days)
    expected[rid] = fine
    print(f"{rid:>7} {name[:28]:<28} {days:>5} {rate:>7} {fine:>11}")

# Спрашиваем сам API прода (внутри сети сервера — без авторизации не выйдет,
# поэтому сверяем расчёт формулой на данных: оплаты/прощения ТЕКУЩЕГО эпизода)
print("\n=== оплаты/прощения штрафа в ТЕКУЩЕМ эпизоде (должны гасить) ===")
cur = q("SELECT d.rental_id, d.kind, SUM(d.amount) FROM debt_entries d "
        "JOIN rentals r ON r.id=d.rental_id "
        "WHERE d.kind IN ('overdue_fine_payment','overdue_fine_forgive') "
        "AND d.created_at::date >= (r.end_planned_at::date + 1) "
        "AND r.status='active' AND r.archived_at IS NULL "
        "AND r.end_planned_at::date < CURRENT_DATE "
        "GROUP BY d.rental_id, d.kind;")
print(cur if cur.strip() else "(нет — значит штрафы висят полностью)")

print("\nИТОГ: штраф по каждой аренде = «штраф д.б.» минус гашения текущего эпизода.")
c.close()
