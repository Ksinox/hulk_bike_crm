"""Запускает pnpm db:seed:catalogs внутри контейнера API на проде."""
import os
import paramiko

HOST = "104.128.128.96"
USER = "root"

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, key_filename=os.path.expanduser("~/.ssh/hulk_deploy"))

# Найти контейнер API
_, out, _ = client.exec_command("docker ps --format '{{.Names}}' | grep hulk-api | head -n1")
cid = out.read().decode().strip()
print("api container:", cid)

if cid:
    _, out, err = client.exec_command(
        f"docker exec {cid} sh -c 'cd /app/apps/api && pnpm db:seed:catalogs'"
    )
    print(out.read().decode("utf-8", errors="replace"))
    e = err.read().decode("utf-8", errors="replace")
    if e:
        print("STDERR:", e)

client.close()
