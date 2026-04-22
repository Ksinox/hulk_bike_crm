import os
import sys
sys.path.insert(0, os.path.dirname(__file__))
from dokploy import api  # noqa

PROJECT_ID = "bDQp-wjTTwvIXcsYLmXW6"
API_APP_ID = "FwVBgT4JUmmsTt5lT14G8"
WEB_APP_ID = "rKNbBZCq6Vf1_0GyLmpM3"
COMPOSE_ID = "NyJ24pnTzhxvL9PQ5X08K"
POSTGRES_ID = "gABBWGug4cllA4yaIBMp2"

r = api("/api/project.update", {
    "projectId": PROJECT_ID,
    "name": "hulk-bike-crm",
    "description": "CRM для Халк Байк — прокат скутеров",
    "env": "",
})
print("project:", r and isinstance(r, dict) and r.get("name"))

r = api("/api/application.update", {
    "applicationId": API_APP_ID,
    "description": "Fastify API для Халк Байк",
})
print("api app:", r and isinstance(r, dict) and r.get("applicationId"))

r = api("/api/application.update", {
    "applicationId": WEB_APP_ID,
    "description": "React web (nginx) для Халк Байк",
})
print("web app:", r and isinstance(r, dict) and r.get("applicationId"))

r = api("/api/compose.update", {
    "composeId": COMPOSE_ID,
    "description": "Object Storage для документов",
})
print("minio compose:", r and isinstance(r, dict) and r.get("composeId"))

r = api("/api/postgres.update", {
    "postgresId": POSTGRES_ID,
    "description": "Postgres 16 для Халк Байк CRM",
})
print("postgres:", r and isinstance(r, dict) and r.get("postgresId"))
