import os
import sys
sys.path.insert(0, os.path.dirname(__file__))
from dokploy import api  # noqa

API_DOMAIN_ID = "-wpkxFw2cXvyR7LaatuGl"
WEB_DOMAIN_ID = "qlaawu9su0QI5XomuWXv_"
API_APP_ID = "FwVBgT4JUmmsTt5lT14G8"
WEB_APP_ID = "rKNbBZCq6Vf1_0GyLmpM3"

# Удаляем старые hulkbike.ru записи (с провалившейся выдачей cert'а)
res = api("/api/domain.delete", {"domainId": API_DOMAIN_ID})
print("del api:", res)

res = api("/api/domain.delete", {"domainId": WEB_DOMAIN_ID})
print("del web:", res)

# Создаём заново — Traefik при появлении нового router повторит ACME challenge
res = api("/api/domain.create", {
    "host": "api.hulkbike.ru",
    "path": "/",
    "port": 4000,
    "https": True,
    "certificateType": "letsencrypt",
    "applicationId": API_APP_ID,
    "domainType": "application",
})
print("new api:", res if not isinstance(res, dict) else res.get("domainId"))

res = api("/api/domain.create", {
    "host": "crm.hulkbike.ru",
    "path": "/",
    "port": 80,
    "https": True,
    "certificateType": "letsencrypt",
    "applicationId": WEB_APP_ID,
    "domainType": "application",
})
print("new web:", res if not isinstance(res, dict) else res.get("domainId"))
