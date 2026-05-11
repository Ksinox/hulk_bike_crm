#!/usr/bin/env python3
"""
Передеплой preview-окружения (api-preview + web-preview).

Preview-окружение — отдельная копия CRM, привязанная к ветке
`feature/redesign-rental-card-v0.5`. Используется для тестов перед
прод-релизом.

URLs:
  - https://api-preview.104-128-128-96.sslip.io  (API)
  - https://crm-preview.104-128-128-96.sslip.io  (Web)

Использование:
  python scripts/redeploy_preview.py            # api + web
  python scripts/redeploy_preview.py api        # только api
  python scripts/redeploy_preview.py web        # только web

Переменные окружения:
  DOKPLOY_TOKEN — токен (обязательно)
"""
import json
import os
import ssl
import sys
import time
import urllib.request
from urllib.error import HTTPError, URLError

# Preview-домены sslip.io получают LE-сертификат с задержкой. Чтобы
# /health и /version.json проверялись сразу после первого деплоя, не
# валим script-у на SSL ошибке — она исчезнет когда cert выпустится.
_NO_VERIFY_CTX = ssl.create_default_context()
_NO_VERIFY_CTX.check_hostname = False
_NO_VERIFY_CTX.verify_mode = ssl.CERT_NONE


DOKPLOY_BASE = os.environ.get("DOKPLOY_BASE", "http://104.128.128.96:3000")
TOKEN = os.environ.get("DOKPLOY_TOKEN")

PREVIEW_API_APP_ID = "kn-1-nwxlACOqiOnIjJDq"
PREVIEW_WEB_APP_ID = "nOTMp8wvR-co0HGXA5gkZ"
PREVIEW_API_BASE = "https://api-preview.104-128-128-96.sslip.io"
PREVIEW_WEB_BASE = "https://crm-preview.104-128-128-96.sslip.io"


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
        with urllib.request.urlopen(req, timeout=10, context=_NO_VERIFY_CTX) as r:
            return r.status
    except HTTPError as e:
        return e.code
    except URLError:
        return 0


def expected_web_version() -> str:
    here = os.path.dirname(os.path.abspath(__file__))
    version_path = os.path.join(here, "..", "apps", "web", "public", "version.json")
    with open(version_path, "r", encoding="utf-8") as f:
        return json.load(f)["version"]


def fetch_web_version(base: str) -> str | None:
    try:
        req = urllib.request.Request(f"{base}/version.json", method="GET")
        with urllib.request.urlopen(req, timeout=10, context=_NO_VERIFY_CTX) as r:
            return json.loads(r.read().decode("utf-8")).get("version")
    except (HTTPError, URLError, ValueError):
        return None


def deploy_api() -> int:
    log("=== preview API ===")
    log(f"Триггер deploy для {PREVIEW_API_APP_ID} (cleanCache=true)")
    dokploy("/api/application.update", {"applicationId": PREVIEW_API_APP_ID, "cleanCache": True})
    dokploy("/api/application.deploy", {"applicationId": PREVIEW_API_APP_ID})
    log(f"Жду {PREVIEW_API_BASE}/health=200 (до 300s)")
    deadline = time.time() + 300
    last = -1
    while time.time() < deadline:
        code = http_status(f"{PREVIEW_API_BASE}/health")
        if code == 200:
            log("OK: /health=200")
            return 0
        if code != last:
            log(f"  /health={code}")
            last = code
        time.sleep(5)
    log("FAIL: API не поднялся за 5 минут")
    return 1


def deploy_web() -> int:
    log("=== preview WEB ===")
    target = expected_web_version()
    log(f"Цель: web {target} на {PREVIEW_WEB_BASE}")
    dokploy("/api/application.update", {"applicationId": PREVIEW_WEB_APP_ID, "cleanCache": True})
    dokploy("/api/application.deploy", {"applicationId": PREVIEW_WEB_APP_ID})
    log(f"Жду /version.json={target} (до 600s)")
    deadline = time.time() + 600
    last = ""
    while time.time() < deadline:
        v = fetch_web_version(PREVIEW_WEB_BASE) or "(нет ответа)"
        if v == target:
            log(f"OK: задеплоено {v}")
            return 0
        if v != last:
            log(f"  current={v}")
            last = v
        time.sleep(10)
    log(f"FAIL: версия не дошла до {target}")
    return 1


def main() -> int:
    arg = sys.argv[1] if len(sys.argv) > 1 else "all"
    rc = 0
    if arg in ("all", "api"):
        rc |= deploy_api()
    if arg in ("all", "web"):
        rc |= deploy_web()
    return rc


if __name__ == "__main__":
    sys.exit(main())
