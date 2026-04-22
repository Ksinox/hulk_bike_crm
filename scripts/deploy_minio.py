import os
import sys
sys.path.insert(0, os.path.dirname(__file__))
from dokploy import api  # noqa

COMPOSE_ID = "NyJ24pnTzhxvL9PQ5X08K"

MINIO_YAML = """services:
  minio:
    image: minio/minio:latest
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: hulkminio
      MINIO_ROOT_PASSWORD: hulkminio_strong_prod_2026
    volumes:
      - minio_data:/data
    ports:
      - "9000:9000"
      - "9001:9001"

volumes:
  minio_data:
"""

res = api("/api/compose.update", {
    "composeId": COMPOSE_ID,
    "sourceType": "raw",
    "composeFile": MINIO_YAML,
})
print("update:", res is not None and res.get("composeId"))

res = api("/api/compose.deploy", {"composeId": COMPOSE_ID})
print("deploy result keys:", list(res.keys()) if isinstance(res, dict) else res)
