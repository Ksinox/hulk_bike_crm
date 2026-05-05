import os, sys, io, paramiko, urllib.request
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("104.128.128.96", username="root", key_filename=os.path.expanduser("~/.ssh/hulk_deploy"))
def sh(cmd):
    _, o, e = c.exec_command(cmd, timeout=120)
    return o.read().decode("utf-8","replace") + e.read().decode("utf-8","replace")

cid = sh("docker ps -q --filter name=hulk-api | head -n1").strip()

print("=== Список файлов в /app/apps/api/dist/ ===")
print(sh(f"docker exec {cid} ls /app/apps/api/dist/routes/ 2>&1"))

print("\n=== Поиск маркеров через find+grep -l ===")
for marker in ["invalid_status_transition", "damage_pending", "unpaid_extras", "mixedForgive"]:
    res = sh(f"docker exec {cid} sh -c \"grep -rln '{marker}' /app/apps/api/dist 2>/dev/null | head -3\"")
    print(f"  {marker}: {res.strip() or 'MISSING'}")

print("\n=== Rentals.js — должен содержать damage_pending, invalid_status_transition ===")
print(sh(f"docker exec {cid} sh -c \"grep -c 'damage_pending\\|invalid_status_transition\\|unpaid_extras\\|mixedForgive' /app/apps/api/dist/routes/rentals.js\""))

print("\n=== Канарейка по версии файла (должна быть свежая) ===")
print(sh(f"docker exec {cid} stat /app/apps/api/dist/routes/rentals.js 2>&1 | grep -E 'Modify|Size'"))

c.close()
