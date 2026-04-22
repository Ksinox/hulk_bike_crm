import os
import secrets
import sys
sys.path.insert(0, os.path.dirname(__file__))
from dokploy import api  # noqa

API_APP_ID = "FwVBgT4JUmmsTt5lT14G8"

# Стабильный JWT secret — сгенерируем один раз, потом читаем из .state
state_file = os.path.join(os.path.dirname(__file__), ".jwt_secret")
if os.path.exists(state_file):
    with open(state_file) as f:
        jwt_secret = f.read().strip()
else:
    jwt_secret = secrets.token_urlsafe(64)
    with open(state_file, "w") as f:
        f.write(jwt_secret)

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
    f"JWT_SECRET={jwt_secret}",
    "CREATOR_UNLOCK_SEQUENCE=ksinox",
    # Пароли для seed:users. Нужны только при разовом запуске скрипта.
    "SEED_CREATOR_PASSWORD=Ksinox147",
    "SEED_DIRECTOR_PASSWORD=GreatHulk2026",
    "SEED_ADMIN_PASSWORD=Adminbike01",
]

res = api("/api/application.saveEnvironment", {
    "applicationId": API_APP_ID,
    "env": "\n".join(env_lines),
    "buildArgs": "",
    "buildSecrets": "",
    "createEnvFile": False,
})
print("env updated:", res and isinstance(res, dict) and res.get("applicationId") or res)
print("JWT_SECRET length:", len(jwt_secret), "chars")
