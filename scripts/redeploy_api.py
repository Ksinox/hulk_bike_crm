#!/usr/bin/env python3
"""
Идемпотентный redeploy API через Dokploy с проверкой что код реально
обновился. Решает проблему «Dokploy показал done, но контейнер на
старом коде или упал на миграции».

Что делает:
  1. Триггерит deploy с cleanCache=True.
  2. Дожидается /health=200 (макс 5 минут).
  3. Проверяет «канареечный» маршрут: ожидает 401 (auth-only), не 404.
     401 = код свежий, маршрут зарегистрирован.
     404 = старый контейнер.

Использование:
  HULK_API_BASE=https://api.hulkbike.ru python scripts/redeploy_api.py

Переменные окружения:
  DOKPLOY_TOKEN     — токен Dokploy (обязательно).
  HULK_API_BASE     — публичный URL API (по умолчанию prod).
  HULK_API_APP_ID   — id приложения (по умолчанию prod).
  CANARY_PATH       — путь свежего маршрута (по умолчанию /api/rentals/archived).
  HEALTH_TIMEOUT    — макс ожидание /health=200, секунд (по умолчанию 300).
"""
import json
import os
import sys
import time
import urllib.request
from urllib.error import HTTPError, URLError


DOKPLOY_BASE = os.environ.get("DOKPLOY_BASE", "http://104.128.128.96:3000")
TOKEN = os.environ.get("DOKPLOY_TOKEN")
APP_ID = os.environ.get("HULK_API_APP_ID", "FwVBgT4JUmmsTt5lT14G8")
API_BASE = os.environ.get("HULK_API_BASE", "https://api.hulkbike.ru")
CANARY_PATH = os.environ.get("CANARY_PATH", "/api/_diag/counts")
HEALTH_TIMEOUT = int(os.environ.get("HEALTH_TIMEOUT", "300"))


def log(msg: str) -> None:
    print(msg, flush=True)


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
        body_txt = e.read().decode("utf-8", errors="replace")
        log(f"ERR: HTTP {e.code} {path}: {body_txt[:300]}")
        sys.exit(3)


def http_status(url: str) -> int:
    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status
    except HTTPError as e:
        return e.code
    except URLError:
        return 0


def main() -> int:
    log(f"Триггер deploy для {APP_ID} (cleanCache=true)")
    dokploy("/api/application.update", {"applicationId": APP_ID, "cleanCache": True})
    dokploy("/api/application.deploy", {"applicationId": APP_ID})

    log(f"Жду /health=200 (до {HEALTH_TIMEOUT}s)")
    deadline = time.time() + HEALTH_TIMEOUT
    last = -1
    while time.time() < deadline:
        code = http_status(f"{API_BASE}/health")
        if code == 200:
            log("/health=200")
            break
        if code != last:
            log(f"  /health={code}")
            last = code
        time.sleep(5)
    else:
        log(f"FAIL: /health не поднялся за {HEALTH_TIMEOUT}s. Контейнер падает.")
        log("       Проверь логи в Dokploy UI или перезапусти контейнер вручную.")
        return 1

    log(f"Канарейка: GET {CANARY_PATH}")
    code = http_status(f"{API_BASE}{CANARY_PATH}")
    if code == 401:
        log("OK: канарейка 401 — свежий код задеплоен")
        return 0
    if code == 404:
        log("FAIL: канарейка 404 — Docker layer cache не сбросился, контейнер на старом коде")
        log("      Действие: открой Dokploy UI → hulk-api → Stop, потом Deploy")
        return 1
    log(f"WARN: канарейка вернула {code} (ожидалось 401). Если код свежий — поправь CANARY_PATH.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
