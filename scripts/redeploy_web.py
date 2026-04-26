#!/usr/bin/env python3
"""
Идемпотентный redeploy WEB через Dokploy с проверкой версии.

Что делает:
  1. Триггерит deploy с cleanCache=True.
  2. Дожидается пока /version.json вернёт ожидаемую версию (она же
     лежит в apps/web/public/version.json — читаем оттуда).

Использование:
  python scripts/redeploy_web.py

Переменные окружения:
  DOKPLOY_TOKEN     — токен Dokploy (обязательно).
  HULK_WEB_APP_ID   — id приложения (по умолчанию prod).
  HULK_WEB_BASE     — публичный URL web (по умолчанию prod).
"""
import json
import os
import sys
import time
import urllib.request
from urllib.error import HTTPError, URLError


DOKPLOY_BASE = os.environ.get("DOKPLOY_BASE", "http://104.128.128.96:3000")
TOKEN = os.environ.get("DOKPLOY_TOKEN")
APP_ID = os.environ.get("HULK_WEB_APP_ID", "rKNbBZCq6Vf1_0GyLmpM3")
WEB_BASE = os.environ.get("HULK_WEB_BASE", "https://crm.hulkbike.ru")
DEPLOY_TIMEOUT = int(os.environ.get("DEPLOY_TIMEOUT", "600"))


def log(msg: str) -> None:
    print(msg, flush=True)


def expected_version() -> str:
    here = os.path.dirname(os.path.abspath(__file__))
    version_path = os.path.join(here, "..", "apps", "web", "public", "version.json")
    with open(version_path, "r", encoding="utf-8") as f:
        return json.load(f)["version"]


def dokploy(path: str, body: dict) -> None:
    if not TOKEN:
        log("ERR: DOKPLOY_TOKEN не задан")
        sys.exit(2)
    req = urllib.request.Request(
        f"{DOKPLOY_BASE}{path}",
        data=json.dumps(body).encode("utf-8"),
        headers={"x-api-key": TOKEN, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            r.read()
    except HTTPError as e:
        log(f"ERR: HTTP {e.code} {path}: {e.read().decode('utf-8', errors='replace')[:300]}")
        sys.exit(3)


def fetch_version() -> str | None:
    try:
        req = urllib.request.Request(f"{WEB_BASE}/version.json", method="GET")
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read().decode("utf-8"))
            return data.get("version")
    except (HTTPError, URLError, ValueError):
        return None


def main() -> int:
    target = expected_version()
    log(f"Цель: web {target} на {WEB_BASE}")
    dokploy("/api/application.update", {"applicationId": APP_ID, "cleanCache": True})
    dokploy("/api/application.deploy", {"applicationId": APP_ID})

    log(f"Жду пока /version.json станет {target} (до {DEPLOY_TIMEOUT}s)")
    deadline = time.time() + DEPLOY_TIMEOUT
    last = ""
    while time.time() < deadline:
        v = fetch_version() or "(нет ответа)"
        if v == target:
            log(f"OK: задеплоено {v}")
            return 0
        if v != last:
            log(f"  current={v}")
            last = v
        time.sleep(10)
    log(f"FAIL: версия не дошла до {target} за {DEPLOY_TIMEOUT}s, осталось {last}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
