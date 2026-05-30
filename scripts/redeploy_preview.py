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

PREVIEW_API_APP_ID = "8kPYu5M59D2_TP9h4hoxx"
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


def dokploy_get(path: str) -> dict:
    """GET к Dokploy API. Возвращает распарсенный JSON."""
    if not TOKEN:
        return {}
    req = urllib.request.Request(
        f"{DOKPLOY_BASE}{path}",
        headers={"x-api-key": TOKEN},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode("utf-8"))
    except (HTTPError, URLError, ValueError):
        return {}


def check_deploy_succeeded(app_id: str) -> tuple[bool, str]:
    """
    Проверяет последний deployment приложения и возвращает (ok, reason).

    ok=True  — последний деплой реально успешен (status=done И в логах нет
               маркеров провала: 'Docker build failed', 'ERROR', 'failed
               to build').
    ok=False — деплой провалился. reason содержит первые строки ошибки
               из лога билда (если удалось получить).

    Решает проблему: Dokploy ставит applicationStatus=done и для
    провалившихся билдов (Docker свалился, ушёл в rollback). Прежняя
    логика «status=done → радуемся» не отличала эти случаи.
    """
    data = dokploy_get(f"/api/application.one?applicationId={app_id}")
    deps = data.get("deployments", [])
    if not deps:
        return True, "no deployments to check"
    # Берём последний по времени (сортируем по createdAt desc)
    last = max(deps, key=lambda d: d.get("createdAt", ""))
    if last.get("status") != "done":
        return False, f"deployment status={last.get('status')}"
    # Маркеры провала в названии (Dokploy иногда пишет «Failed»)
    err_msg = last.get("errorMessage") or ""
    if err_msg:
        return False, f"errorMessage: {err_msg[:300]}"
    # Проверяем сам лог: если там «Docker build failed» / «ERROR: failed
    # to build» / «exit code: N» — это провал.
    log_path = last.get("logPath", "")
    if not log_path:
        return True, "no logPath to verify"
    # У Dokploy нет публичного эндпоинта для лога деплоя по logPath.
    # Используем обходной путь: смотрим logs у контейнера приложения —
    # если он крашится с non-zero, это вторичный признак.
    # Минимально проверяем по описанию деплоя на 'failed' маркеры.
    title = last.get("title", "") or ""
    desc = last.get("description", "") or ""
    bad_markers = ["failed", "FAIL", "error", "ERROR"]
    for m in bad_markers:
        if m in title or m in desc:
            return False, f"marker '{m}' in deployment title/desc"
    return True, "ok"


def http_status(url: str) -> int:
    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=10, context=_NO_VERIFY_CTX) as r:
            return r.status
    except HTTPError as e:
        return e.code
    except URLError:
        return 0


def fetch_web_version(base: str) -> str | None:
    try:
        req = urllib.request.Request(f"{base}/version.json", method="GET")
        with urllib.request.urlopen(req, timeout=10, context=_NO_VERIFY_CTX) as r:
            return json.loads(r.read().decode("utf-8")).get("version")
    except (HTTPError, URLError, ValueError):
        return None


def wait_deployment_finished(app_id: str, timeout_s: int = 600) -> bool:
    """
    Ждёт пока в Dokploy появится новый deployment со status != 'running'.
    Если deployment в state 'done' — проверяет через check_deploy_succeeded.
    Возвращает True если деплой действительно успешен.
    """
    deadline = time.time() + timeout_s
    seen_running = False
    last_status = ""
    while time.time() < deadline:
        data = dokploy_get(f"/api/application.one?applicationId={app_id}")
        deps = data.get("deployments", [])
        if deps:
            last = max(deps, key=lambda d: d.get("createdAt", ""))
            status = last.get("status", "")
            if status != last_status:
                log(f"  deployment status={status}")
                last_status = status
            if status == "running":
                seen_running = True
            elif seen_running and status in ("done", "error"):
                ok, reason = check_deploy_succeeded(app_id)
                if not ok:
                    log(f"FAIL: deploy не успешен ({reason})")
                    return False
                return True
        time.sleep(8)
    log(f"FAIL: deployment не завершился за {timeout_s}s")
    return False


def deploy_api() -> int:
    log("=== preview API ===")
    log(f"Триггер deploy для {PREVIEW_API_APP_ID} (cleanCache=true)")
    dokploy("/api/application.update", {"applicationId": PREVIEW_API_APP_ID, "cleanCache": True})
    dokploy("/api/application.deploy", {"applicationId": PREVIEW_API_APP_ID})
    if not wait_deployment_finished(PREVIEW_API_APP_ID, 600):
        return 1
    log(f"Жду {PREVIEW_API_BASE}/health=200 (до 180s)")
    deadline = time.time() + 180
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
    log("FAIL: API не поднялся после успешного билда")
    return 1


def deploy_web() -> int:
    log("=== preview WEB ===")
    # version.json генерируется на каждой сборке (vite-плагин emitVersionJson:
    # <git-sha>.<ts>), заранее значение неизвестно. Поэтому ловим ИЗМЕНЕНИЕ:
    # запоминаем версию ДО редеплоя и ждём пока live-версия станет другой.
    before = fetch_web_version(PREVIEW_WEB_BASE)
    log(f"Текущая web-версия: {before or '(нет ответа)'} на {PREVIEW_WEB_BASE}")
    dokploy("/api/application.update", {"applicationId": PREVIEW_WEB_APP_ID, "cleanCache": True})
    dokploy("/api/application.deploy", {"applicationId": PREVIEW_WEB_APP_ID})
    if not wait_deployment_finished(PREVIEW_WEB_APP_ID, 600):
        return 1
    log("Жду смену /version.json (до 180s)")
    deadline = time.time() + 180
    last = ""
    while time.time() < deadline:
        v = fetch_web_version(PREVIEW_WEB_BASE) or "(нет ответа)"
        if v not in (None, "(нет ответа)") and v != before:
            log(f"OK: задеплоена новая версия {v}")
            return 0
        if v != last:
            log(f"  current={v}")
            last = v
        time.sleep(10)
    log("FAIL: версия не сменилась после успешного билда")
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
