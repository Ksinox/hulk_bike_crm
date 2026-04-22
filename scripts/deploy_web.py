import os
import sys
sys.path.insert(0, os.path.dirname(__file__))
from dokploy import api  # noqa

PROJECT_ID = "bDQp-wjTTwvIXcsYLmXW6"
ENV_ID = "vFcGLvfWrzF1L3M3snVG1"

API_PUBLIC_URL = "https://api.104-128-128-96.sslip.io"

res = api("/api/application.create", {
    "name": "hulk-web",
    "appName": "hulk-web",
    "description": "React web (nginx) для Халк Байк",
    "projectId": PROJECT_ID,
    "environmentId": ENV_ID,
})
if not res or "applicationId" not in res:
    print("FAILED create:", res)
    sys.exit(1)
APP_ID = res["applicationId"]
print("applicationId:", APP_ID)

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

res = api("/api/application.saveBuildType", {
    "applicationId": APP_ID,
    "buildType": "dockerfile",
    "dockerfile": "apps/web/Dockerfile",
    "dockerContextPath": ".",
    "dockerBuildStage": "",
    "isStaticSpa": False,
    "herokuVersion": "24",
    "railpackVersion": "",
})
print("saveBuildType:", res and isinstance(res, dict) and res.get("applicationId") or res)

# VITE_API_URL пробрасываем через build args — впекается в бандл
res = api("/api/application.saveEnvironment", {
    "applicationId": APP_ID,
    "env": "",
    "buildArgs": f"VITE_API_URL={API_PUBLIC_URL}",
    "buildSecrets": "",
    "createEnvFile": False,
})
print("saveEnvironment:", res and isinstance(res, dict) and res.get("applicationId") or res)

# Домен web
res = api("/api/domain.create", {
    "host": "crm.104-128-128-96.sslip.io",
    "path": "/",
    "port": 80,
    "https": True,
    "certificateType": "letsencrypt",
    "applicationId": APP_ID,
    "domainType": "application",
})
print("domain:", res if not isinstance(res, dict) else (res.get("domainId") or res))

with open(os.path.join(os.path.dirname(__file__), ".web_app_id"), "w") as f:
    f.write(APP_ID)
