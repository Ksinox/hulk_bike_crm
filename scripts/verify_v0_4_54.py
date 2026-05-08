import os, sys, io, paramiko
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("104.128.128.96", username="root", key_filename=os.path.expanduser("~/.ssh/hulk_deploy"))
def sh(cmd):
    _, o, e = c.exec_command(cmd, timeout=120)
    return o.read().decode("utf-8","replace") + e.read().decode("utf-8","replace")

print("=== Web container ===")
print(sh("docker ps --filter name=hulk-web --format '{{.Names}}|{{.Status}}|{{.CreatedAt}}'"))

print("\n=== version.json в web container ===")
cid = sh("docker ps -q --filter name=hulk-web | head -n1").strip()
print(sh(f"docker exec {cid} cat /usr/share/nginx/html/version.json 2>&1"))

print("\n=== Маркеры v0.4.54 в bundle ===")
# Ищем 'Возврат был' в скомпилированном JS
print("'Возврат был' (наш новый текст):")
print(sh(f"docker exec {cid} sh -c 'grep -lr \"Возврат был\" /usr/share/nginx/html 2>&1 | head -3'"))
print("'debtZero' (наша переменная):")
print(sh(f"docker exec {cid} sh -c 'grep -c \"debtZero\\|overdueRelatedDebt\" /usr/share/nginx/html/assets/*.js 2>&1 | head -3'"))

print("\n=== https://crm.hulkbike.ru/version.json через curl с серверного ===")
print(sh("curl -s https://crm.hulkbike.ru/version.json"))

c.close()
