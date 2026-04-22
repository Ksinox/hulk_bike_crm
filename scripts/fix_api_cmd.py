import os
import sys
sys.path.insert(0, os.path.dirname(__file__))
from dokploy import api  # noqa

APP_ID = "FwVBgT4JUmmsTt5lT14G8"

res = api("/api/application.update", {
    "applicationId": APP_ID,
    "command": 'sh -c "node dist/db/migrate.js && node dist/index.js"',
})
print("update:", res and isinstance(res, dict) and res.get("applicationId") or res)

res = api("/api/application.deploy", {
    "applicationId": APP_ID,
    "description": "fix command shell",
})
print("deploy:", res)
