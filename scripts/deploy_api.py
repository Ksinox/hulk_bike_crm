"""Создаёт api application из репозитория Ksinox/hulk_bike_crm."""
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))
from dokploy import api  # noqa

PROJECT_ID = "bDQp-wjTTwvIXcsYLmXW6"
ENV_ID = "vFcGLvfWrzF1L3M3snVG1"
POSTGRES_HOST = "hulk-postgres-rlecri"  # имя сервиса = имя хоста во внутренней сети Docker Swarm
DATABASE_URL = "postgres://hulk:hulk_strong_prod_pw_2026@hulk-postgres-rlecri:5432/hulk"

# 1) Создать application
res = api("/api/application.create", {
    "name": "hulk-api",
    "appName": "hulk-api",
    "description": "Fastify API для Халк Байк",
    "projectId": PROJECT_ID,
    "environmentId": ENV_ID,
})
if not res or "applicationId" not in res:
    print("FAILED create:", res)
    sys.exit(1)
APP_ID = res["applicationId"]
print("applicationId:", APP_ID)

# 2) Указать публичный git-репо как источник (без GitHub App — просто customGitUrl)
res = api("/api/application.saveGitProvider", {
    "applicationId": APP_ID,
    "sourceType": "git",
    "customGitUrl": "https://github.com/Ksinox/hulk_bike_crm.git",
    "customGitBranch": "main",
    "customGitSSHKeyId": None,
    "customGitBuildPath": "/",
    "watchPaths": [],
    "enableSubmodules": False,
})
print("saveGitProvider:", res and isinstance(res, dict) and res.get("applicationId") or res)

# 3) Указать Dockerfile
res = api("/api/application.saveBuildType", {
    "applicationId": APP_ID,
    "buildType": "dockerfile",
    "dockerfile": "apps/api/Dockerfile",
    "dockerContextPath": ".",
    "dockerBuildStage": "",
    "isStaticSpa": False,
})
print("saveBuildType:", res and isinstance(res, dict) and res.get("applicationId") or res)

# 4) Environment variables
env_lines = [
    "NODE_ENV=production",
    "PORT=4000",
    "HOST=0.0.0.0",
    f"DATABASE_URL={DATABASE_URL}",
    "CORS_ORIGINS=https://crm.104-128-128-96.sslip.io",
    "S3_ENDPOINT=hulk-minio-1f30mp-minio-1",
    "S3_PORT=9000",
    "S3_USE_SSL=false",
    "S3_ACCESS_KEY=hulkminio",
    "S3_SECRET_KEY=hulkminio_strong_prod_2026",
    "S3_BUCKET=hulk-docs",
]
res = api("/api/application.saveEnvironment", {
    "applicationId": APP_ID,
    "env": "\n".join(env_lines),
    "buildArgs": "",
})
print("saveEnvironment:", res and isinstance(res, dict) and res.get("applicationId") or res)

# 5) Pre-deploy команда — прогон миграций перед стартом
res = api("/api/application.update", {
    "applicationId": APP_ID,
    "command": "node dist/db/migrate.js && node dist/index.js",
    "preDeployCommand": "",
})
print("update cmd:", res and isinstance(res, dict) and res.get("applicationId") or res)

# 6) Домен (сразу, Dokploy развернёт — и Let's Encrypt выдаст)
res = api("/api/domain.create", {
    "host": "api.104-128-128-96.sslip.io",
    "path": "/",
    "port": 4000,
    "https": True,
    "certificateType": "letsencrypt",
    "applicationId": APP_ID,
    "domainType": "application",
})
print("domain:", res if not isinstance(res, dict) else (res.get("domainId") or res))

# 7) Сохранить applicationId чтобы deploy запустить отдельно
with open(os.path.join(os.path.dirname(__file__), ".api_app_id"), "w") as f:
    f.write(APP_ID)
