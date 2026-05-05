import os, sys, io, paramiko
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("104.128.128.96", username="root", key_filename=os.path.expanduser("~/.ssh/hulk_deploy"))

def sh(cmd):
    _, o, e = c.exec_command(cmd, timeout=180)
    return o.read().decode("utf-8","replace") + e.read().decode("utf-8","replace")

# Logs of the most recently failed task (b9en0y71)
print("=== Logs of failed task b9en0y71 ===")
print(sh("docker service logs --no-trunc hulk-api-qbqu4d 2>&1 | grep b9en0y71 | tail -100"))

print("\n=== git checkout state inside hulk-api source dir ===")
src = sh("ls -la /etc/dokploy/applications/hulk-api-qbqu4d/").strip()
print(src)
print(sh("ls -la /etc/dokploy/applications/hulk-api-qbqu4d/code/ 2>&1 | head -20"))
print("\n=== git log в code/ ===")
print(sh("cd /etc/dokploy/applications/hulk-api-qbqu4d/code && git log --oneline -5 2>&1"))

print("\n=== Latest build log file ===")
print(sh("ls -lt /etc/dokploy/logs/hulk-api-qbqu4d/ 2>&1 | head -5"))
log = sh("ls -t /etc/dokploy/logs/hulk-api-qbqu4d/ 2>&1 | head -1").strip()
if log:
    print(f"\n=== {log} (tail -120) ===")
    print(sh(f"tail -120 /etc/dokploy/logs/hulk-api-qbqu4d/{log}"))

c.close()
