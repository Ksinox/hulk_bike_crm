"""Комплексный аудит целостности данных скутер ↔ аренда.

Проверяет 8 инвариантов:
  1. archived_at IS NOT NULL ⇒ status ∈ terminal
  2. Не более одной live-аренды на скутер
  3. baseStatus='rental_pool' ⇒ нет live-аренды на этом скутере
  4. baseStatus='ready' ⇒ нет live-аренды на этом скутере
  5. baseStatus='repair' ⇒ есть открытый repair_job ИЛИ нет (можно вручную)
  6. live-аренда ⇒ скутер существует и не архивный
  7. damage_report без открытого repair_job + scooter в repair = битый flow
  8. parent_rental_id указывает на существующую аренду
"""
import os, sys, io, paramiko
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("104.128.128.96", username="root", key_filename=os.path.expanduser("~/.ssh/hulk_deploy"))
def sh(cmd):
    _, o, e = c.exec_command(cmd, timeout=120)
    return o.read().decode("utf-8","replace") + e.read().decode("utf-8","replace")
pg = sh("docker ps -q --filter name=hulk-postgres-rlecri | head -n1").strip()

def q(label, sql):
    print(f"\n=== {label} ===")
    res = sh(f"docker exec {pg} psql -U hulk -d hulk -c \"{sql}\"")
    print(res)

q("1. Archived с live-статусом (должно быть пусто)",
"""SELECT id, scooter_id, status, archived_at, archived_by FROM rentals
WHERE archived_at IS NOT NULL AND status IN ('active','overdue','returning','new_request','meeting');""")

q("2. Скутер с двумя+ live-арендами (не должно быть)",
"""SELECT scooter_id, COUNT(*) AS live_count, array_agg(id ORDER BY id) AS rental_ids
FROM rentals WHERE archived_at IS NULL AND status IN ('active','overdue','returning')
AND scooter_id IS NOT NULL GROUP BY scooter_id HAVING COUNT(*) > 1;""")

q("3. baseStatus='rental_pool' но скутер занят live-арендой",
"""SELECT s.id, s.name, s.base_status, r.id AS rental_id, r.status
FROM scooters s JOIN rentals r ON r.scooter_id = s.id
WHERE s.base_status = 'rental_pool' AND r.archived_at IS NULL
AND r.status IN ('active','overdue','returning');""")

q("4. baseStatus='repair' но активного repair_job нет",
"""SELECT s.id, s.name, s.base_status FROM scooters s
WHERE s.base_status = 'repair'
AND NOT EXISTS (SELECT 1 FROM repair_jobs rj WHERE rj.scooter_id=s.id AND rj.status='in_progress');""")

q("5. Активный repair_job но скутер НЕ в ремонте",
"""SELECT rj.id AS job_id, rj.scooter_id, s.name, s.base_status FROM repair_jobs rj
JOIN scooters s ON s.id=rj.scooter_id
WHERE rj.status='in_progress' AND s.base_status != 'repair';""")

q("6. Live-аренда на архивном/удалённом скутере",
"""SELECT r.id, r.scooter_id, r.status, s.name, s.archived_at AS scooter_archived
FROM rentals r LEFT JOIN scooters s ON s.id = r.scooter_id
WHERE r.archived_at IS NULL AND r.status IN ('active','overdue','returning')
AND (s.id IS NULL OR s.archived_at IS NOT NULL);""")

q("7. parent_rental_id указывает на несуществующую аренду",
"""SELECT r.id, r.parent_rental_id FROM rentals r
WHERE r.parent_rental_id IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM rentals p WHERE p.id = r.parent_rental_id);""")

q("8. status='completed_damage' или 'problem' БЕЗ damage_report",
"""SELECT r.id, r.status FROM rentals r
WHERE r.status IN ('completed_damage','problem')
AND NOT EXISTS (SELECT 1 FROM damage_reports d WHERE d.rental_id=r.id);""")

q("9. paid=true rent payment без указанного method",
"""SELECT id, rental_id, type, method FROM payments
WHERE paid=true AND method IS NULL LIMIT 5;""")

q("10. damage_report.client_agreement='pending' старше 30 дней (забытые)",
"""SELECT id, rental_id, total, created_at FROM damage_reports
WHERE client_agreement='pending' AND created_at < now() - interval '30 days'
ORDER BY created_at LIMIT 10;""")

q("11. rentals без scooter_id но status=live (как такое может быть)",
"""SELECT id, status, archived_at FROM rentals
WHERE scooter_id IS NULL AND status IN ('active','overdue','returning') AND archived_at IS NULL;""")

q("12. Парк-метрика: сводка по baseStatus",
"""SELECT base_status, COUNT(*) FROM scooters WHERE archived_at IS NULL GROUP BY base_status ORDER BY base_status;""")

c.close()
