import os
import sys
sys.path.insert(0, os.path.dirname(__file__))
from dokploy import api  # noqa

# Для каждого сервиса есть вызов general — загружаем текущее состояние и шлём
# то же самое, только с поправленным description.

def patch_description(kind: str, ident_key: str, ident_val: str, desc: str):
    cur = api(f"/api/{kind}.one?{ident_key}={ident_val}", method="GET")
    if not isinstance(cur, dict):
        print(f"{kind}: GET failed", cur)
        return
    body = {
        ident_key: ident_val,
        "name": cur.get("name"),
        "description": desc,
    }
    # update — универсальный метод, требует минимум полей; попробуем только
    # description + name + id, вернёт 400 если чего-то не хватает
    res = api(f"/api/{kind}.update", body)
    print(f"{kind}:", res and isinstance(res, dict) and (res.get(ident_key) or res.get("name")))


patch_description("application", "applicationId", "FwVBgT4JUmmsTt5lT14G8", "Fastify API для Халк Байк")
patch_description("application", "applicationId", "rKNbBZCq6Vf1_0GyLmpM3", "React web (nginx) для Халк Байк")
patch_description("postgres",    "postgresId",    "gABBWGug4cllA4yaIBMp2", "Postgres 16 для Халк Байк CRM")
