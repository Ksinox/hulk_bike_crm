import os, sys, io, paramiko

# Заставляем stdout писать UTF-8 (Windows cp1251 ломает emoji/юникод)
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("104.128.128.96", username="root", key_filename=os.path.expanduser("~/.ssh/hulk_deploy"))

def sh(cmd):
    _, o, e = c.exec_command(cmd, timeout=180)
    return o.read().decode("utf-8","replace") + e.read().decode("utf-8","replace")

print("=== API container info ===")
print(sh("docker ps --filter name=hulk-api --format '{{.Names}}|{{.Status}}|{{.Image}}|{{.CreatedAt}}'"))

print("=== Все hulk-api образы (с датами) ===")
print(sh("docker images | grep hulk-api"))

print("=== Service spec image ===")
print(sh("docker service inspect hulk-api-qbqu4d --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'"))

print("=== Последние 5 task'ов сервиса ===")
print(sh("docker service ps hulk-api-qbqu4d --no-trunc 2>&1 | head -10"))

print("=== Что в /etc/dokploy/ для api app FwVBgT4JUmmsTt5lT14G8 ===")
print(sh("ls -la /etc/dokploy/applications/ 2>&1 | head -20"))
print(sh("find /etc/dokploy -maxdepth 4 -name '*FwVBg*' 2>&1 | head -20"))

print("=== Последний build log api ===")
print(sh("ls -lt /etc/dokploy/logs/ 2>&1 | head -10"))

c.close()
