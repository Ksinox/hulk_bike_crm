"""Проверка фикса «эпизод просрочки» на preview: воспроизводим прод-кейс.

Сценарий как у аренды 171 на проде:
  • аренда просрочена на 4 дня (ставка 500 ₽/сут → штраф 250 ₽/сут);
  • месяц назад клиент оплатил штрафы на 3 250 ₽ (за ПРОШЛЫЕ просрочки).
Было: штраф 1 000 ₽ съедался старыми оплатами → 0.
Ожидаем после фикса: штраф 1 000 ₽ висит, старые оплаты его не гасят.
"""
import os, sys, io, json, paramiko, urllib.request

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
API = "https://api-preview.104-128-128-96.sslip.io"
PASS = os.environ.get("SHOTBOT_PASS", "")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("104.128.128.96", username="root",
          key_filename=os.path.expanduser("~/.ssh/hulk_deploy"))


def sh(cmd, timeout=120):
    _, o, e = c.exec_command(cmd, timeout=timeout)
    return o.read().decode("utf-8", "replace") + e.read().decode("utf-8", "replace")


pg = sh("docker ps -q --filter name=hulk-postgres-preview | head -n1").strip()


def q(sql):
    esc = sql.replace('"', '\\"')
    return sh(f'docker exec {pg} psql -U hulk -d hulk -tAF"|" -c "{esc}"').strip()


# 1. Берём активную аренду и делаем её просроченной на 4 дня
rid = q("SELECT id FROM rentals WHERE status='active' AND archived_at IS NULL "
        "ORDER BY id DESC LIMIT 1;").splitlines()[0]
print("тестовая аренда:", rid)
q(f"UPDATE rentals SET end_planned_at = now() - interval '4 days', rate=500, "
  f"rate_unit='day' WHERE id={rid};")

# 2. Чистим прошлые записи и кладём «старую» оплату штрафа (месяц назад)
q(f"DELETE FROM debt_entries WHERE rental_id={rid};")
q(f"INSERT INTO debt_entries (rental_id, kind, amount, applied_to_endplanned, "
  f"created_at, created_by_name) VALUES "
  f"({rid}, 'overdue_days_payment', 3000, true, now() - interval '30 days', 'тест'),"
  f"({rid}, 'overdue_fine_payment', 3250, false, now() - interval '30 days', 'тест');")

print("\nзаписи в БД:")
print(q(f"SELECT kind, amount, created_at::date FROM debt_entries WHERE rental_id={rid} ORDER BY id;"))


# 3. Спрашиваем API — как считается долг
def api_json(path, cookie=None, body=None):
    req = urllib.request.Request(API + path)
    if cookie:
        req.add_header("Cookie", cookie)
    if body is not None:
        req.add_header("Content-Type", "application/json")
        req.data = json.dumps(body).encode()
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode()), r.headers


_, headers = api_json("/api/auth/login", body={"login": "shotbot", "password": PASS, "remember": True})
cookie = (headers.get("set-cookie") or "").split(";")[0]

debt, _ = api_json(f"/api/rentals/{rid}/debt", cookie=cookie)
print("\n=== расчёт долга (после фикса) ===")
print("дней просрочки:      ", debt.get("overdueDays"))
print("долг по дням:        ", debt.get("overdueDaysBalance"))
print("начислено штрафа:    ", debt.get("overdueFineCharge"))
print("ШТРАФ К ОПЛАТЕ:      ", debt.get("overdueFineBalance"))
print("итого просрочка:     ", debt.get("overdueBalance"))

ok = debt.get("overdueFineBalance") == 1000
print("\nРЕЗУЛЬТАТ:", "ШТРАФ ВЕРНУЛСЯ ✓" if ok else "НЕ СОШЛОСЬ ✗ (ожидали 1000)")

# 4. Убираем следы теста
q(f"DELETE FROM debt_entries WHERE rental_id={rid} AND created_by_name='тест';")
print("тестовые записи удалены")
c.close()
