#!/usr/bin/env python3
"""
Восстановление БД из JSON-бэкапа, созданного apps/api/src/services/backup.ts.

Workflow:
  1. Скачать дамп из MinIO (hulk-backups/backups/YYYY-MM-DD.json.gz).
  2. Прогнать миграции — `pnpm --filter api db:migrate` или
     дёрнуть POST /api/_diag/heal на проде.
  3. Запустить этот скрипт — он сделает TRUNCATE + INSERT всех таблиц
     в правильном порядке (FK).

Использование:
  python scripts/restore_from_backup.py path/to/backup.json.gz [--dry-run]

ВАЖНО:
  Восстановление ПЕРЕТИРАЕТ текущие данные в БД (TRUNCATE).
  Использовать только после катастрофы или для миграции на свежий инстанс.
"""
import argparse
import gzip
import json
import os
import sys
from typing import Any

try:
    import psycopg2  # type: ignore
    from psycopg2.extras import Json  # type: ignore
except ImportError:
    print("Нужен psycopg2: pip install psycopg2-binary", file=sys.stderr)
    sys.exit(2)


TABLES_IN_ORDER = [
    "users",
    "scooter_models",
    "equipment_items",
    "scooters",
    "clients",
    "rentals",
    "payments",
    "return_inspections",
    "client_documents",
    "scooter_documents",
    "scooter_maintenance",
    "rental_incidents",
    "rental_tasks",
    "activity_log",
]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("backup_path", help="Путь к .json.gz файлу")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--db-url",
        default=os.environ.get("DATABASE_URL"),
        help="postgres:// строка (по умолчанию DATABASE_URL)",
    )
    args = parser.parse_args()

    if not args.db_url:
        print("DATABASE_URL не задан", file=sys.stderr)
        return 2

    with gzip.open(args.backup_path, "rt", encoding="utf-8") as f:
        payload = json.load(f)

    meta = payload.get("meta", {})
    data: dict[str, list[dict[str, Any]]] = payload.get("data", {})
    print(f"Бэкап от {meta.get('createdAt')} ({meta.get('rows')} строк)")

    if args.dry_run:
        for t in TABLES_IN_ORDER:
            print(f"  {t}: {len(data.get(t, []))} строк")
        return 0

    conn = psycopg2.connect(args.db_url)
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            # TRUNCATE в обратном порядке (учитывает FK через CASCADE)
            for table in reversed(TABLES_IN_ORDER):
                cur.execute(f'TRUNCATE TABLE "{table}" CASCADE')
                print(f"  truncated {table}")

            # INSERT в прямом порядке
            for table in TABLES_IN_ORDER:
                rows = data.get(table, [])
                if not rows:
                    continue
                cols = list(rows[0].keys())
                placeholders = ",".join(["%s"] * len(cols))
                col_list = ",".join(f'"{c}"' for c in cols)
                stmt = f'INSERT INTO "{table}" ({col_list}) VALUES ({placeholders})'
                for row in rows:
                    values = [
                        Json(v) if isinstance(v, (dict, list)) else v
                        for v in (row[c] for c in cols)
                    ]
                    cur.execute(stmt, values)
                print(f"  restored {table}: {len(rows)} строк")
        conn.commit()
        print("✓ Восстановление завершено успешно.")
    except Exception as e:
        conn.rollback()
        print(f"✗ Ошибка, откат: {e}", file=sys.stderr)
        return 1
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
