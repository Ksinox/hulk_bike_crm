"""Исправляем недостающие поля saveBuildType и saveEnvironment."""
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))
from dokploy import api  # noqa

APP_ID = "FwVBgT4JUmmsTt5lT14G8"

res = api("/api/application.saveBuildType", {
    "applicationId": APP_ID,
    "buildType": "dockerfile",
    "dockerfile": "apps/api/Dockerfile",
    "dockerContextPath": ".",
    "dockerBuildStage": "",
    "isStaticSpa": False,
    "herokuVersion": "24",
    "railpackVersion": "",
})
print("saveBuildType:", res and isinstance(res, dict) and res.get("applicationId") or res)

DATABASE_URL = "postgres://hulk:hulk_strong_prod_pw_2026@hulk-postgres-rlecri:5432/hulk"
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
    "buildSecrets": "",
    "createEnvFile": False,
})
print("saveEnvironment:", res and isinstance(res, dict) and res.get("applicationId") or res)
