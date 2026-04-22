import os
import sys
sys.path.insert(0, os.path.dirname(__file__))
from dokploy import api  # noqa

API_APP_ID = "FwVBgT4JUmmsTt5lT14G8"
WEB_APP_ID = "rKNbBZCq6Vf1_0GyLmpM3"

# ===== 1) Добавляем новые домены hulkbike.ru =====
# Старые sslip-домены оставим рядом — будут работать параллельно,
# пока не убедимся что hulkbike.ru стабильно отвечает, потом удалим.

res = api("/api/domain.create", {
    "host": "api.hulkbike.ru",
    "path": "/",
    "port": 4000,
    "https": True,
    "certificateType": "letsencrypt",
    "applicationId": API_APP_ID,
    "domainType": "application",
})
print("api.hulkbike.ru:", res if not isinstance(res, dict) else res.get("domainId"))

res = api("/api/domain.create", {
    "host": "crm.hulkbike.ru",
    "path": "/",
    "port": 80,
    "https": True,
    "certificateType": "letsencrypt",
    "applicationId": WEB_APP_ID,
    "domainType": "application",
})
print("crm.hulkbike.ru:", res if not isinstance(res, dict) else res.get("domainId"))

# ===== 2) CORS_ORIGINS у api: добавляем новый домен =====
env_lines = [
    "NODE_ENV=production",
    "PORT=4000",
    "HOST=0.0.0.0",
    "DATABASE_URL=postgres://hulk:hulk_strong_prod_pw_2026@hulk-postgres-rlecri:5432/hulk",
    "CORS_ORIGINS=https://crm.hulkbike.ru,https://crm.104-128-128-96.sslip.io",
    "S3_ENDPOINT=hulk-minio-1f30mp-minio-1",
    "S3_PORT=9000",
    "S3_USE_SSL=false",
    "S3_ACCESS_KEY=hulkminio",
    "S3_SECRET_KEY=hulkminio_strong_prod_2026",
    "S3_BUCKET=hulk-docs",
]
res = api("/api/application.saveEnvironment", {
    "applicationId": API_APP_ID,
    "env": "\n".join(env_lines),
    "buildArgs": "",
    "buildSecrets": "",
    "createEnvFile": False,
})
print("api env updated:", res and isinstance(res, dict) and res.get("applicationId") or res)

# ===== 3) web: пересборка с новым VITE_API_URL =====
res = api("/api/application.saveEnvironment", {
    "applicationId": WEB_APP_ID,
    "env": "",
    "buildArgs": "VITE_API_URL=https://api.hulkbike.ru",
    "buildSecrets": "",
    "createEnvFile": False,
})
print("web build args updated:", res and isinstance(res, dict) and res.get("applicationId") or res)
