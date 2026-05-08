import os, sys, io, paramiko
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("104.128.128.96", username="root", key_filename=os.path.expanduser("~/.ssh/hulk_deploy"))
def sh(cmd):
    _, o, e = c.exec_command(cmd, timeout=120)
    return o.read().decode("utf-8","replace") + e.read().decode("utf-8","replace")

cid = sh("docker ps -q --filter name=hulk-api | head -n1").strip()
print("=== API container ===")
print(sh("docker ps --filter name=hulk-api --format '{{.Names}}|{{.Status}}|{{.CreatedAt}}'"))

print("\n=== debt-aggregate endpoint в dist? ===")
print(sh(f"docker exec {cid} grep -c 'debt-aggregate' /app/apps/api/dist/routes/rentals.js 2>&1"))

print("\n=== Web /version.json ===")
print(sh("curl -s https://crm.hulkbike.ru/version.json"))

# Симулируем запрос через psql — собираем агрегат вручную
print("\n=== Долг по аренде #79 (Егоров) — расчёт по той же формуле что в endpoint ===")
pg = sh("docker ps -q --filter name=hulk-postgres-rlecri | head -n1").strip()
print(sh(f"""docker exec {pg} psql -U hulk -d hulk -c "
WITH r AS (
  SELECT 79 AS rental_id, 500 AS rate, 'day' AS rate_unit,
         '2026-05-04 18:03:00+00'::timestamptz AS end_planned_at
),
od AS (
  SELECT GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (CURRENT_DATE - end_planned_at::date)) / 86400))::int AS overdue_days FROM r
),
charges AS (
  SELECT (SELECT rate FROM r) * (SELECT overdue_days FROM od) AS days_charge,
         ROUND((SELECT rate FROM r) * 0.5)::int * (SELECT overdue_days FROM od) AS fine_charge
),
e AS (
  SELECT
    COALESCE(SUM(CASE WHEN kind='overdue_days_forgive' THEN amount END),0) AS days_forgive,
    COALESCE(SUM(CASE WHEN kind='overdue_fine_forgive' THEN amount END),0) AS fine_forgive,
    COALESCE(SUM(CASE WHEN kind='overdue_days_payment' THEN amount END),0) AS days_pay,
    COALESCE(SUM(CASE WHEN kind='overdue_fine_payment' THEN amount END),0) AS fine_pay
  FROM debt_entries WHERE rental_id = 79
)
SELECT
  od.overdue_days,
  charges.days_charge,
  charges.fine_charge,
  e.days_forgive, e.days_pay, e.fine_forgive, e.fine_pay,
  GREATEST(0, charges.days_charge - e.days_forgive - e.days_pay) AS days_balance,
  GREATEST(0, charges.fine_charge - e.fine_forgive - e.fine_pay) AS fine_balance
FROM od, charges, e;
" """))

c.close()
