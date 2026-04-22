import os
import sys
sys.path.insert(0, os.path.dirname(__file__))
from dokploy import api  # noqa

APP_ID = "FwVBgT4JUmmsTt5lT14G8"

# Убираем command (пусть отработает CMD из Dockerfile = node dist/index.js).
# Миграции пока применим разово вручную после деплоя — оставим command пустым.
res = api("/api/application.update", {
    "applicationId": APP_ID,
    "command": "",
})
print("update:", res and isinstance(res, dict) and res.get("applicationId") or res)

res = api("/api/application.deploy", {
    "applicationId": APP_ID,
    "description": "clean command, use Dockerfile CMD",
})
print("deploy:", res)
