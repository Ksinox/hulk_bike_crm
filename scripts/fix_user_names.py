"""Чинит mojibake в именах юзеров на проде через SQL."""
import paramiko

HOST = "104.128.128.96"
USER = "root"

SQL = """
UPDATE users SET name = 'Руслан' WHERE login = 'ruslan';
UPDATE users SET name = 'Директор' WHERE login = 'director';
UPDATE users SET name = 'Администратор' WHERE login = 'admin';
SELECT login, name, role FROM users ORDER BY id;
"""

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
import os
client.connect(HOST, username=USER, key_filename=os.path.expanduser("~/.ssh/hulk_deploy"))

# Пишем SQL во временный файл в контейнере и выполняем оттуда — так избегаем
# проблем с shell-экранированием UTF-8 в аргументе docker exec.
cid_cmd = "docker ps -q --filter 'name=hulk-postgres-rlecri'"
_, stdout, _ = client.exec_command(cid_cmd)
cid = stdout.read().decode().strip()
print("postgres container:", cid)

# Создаём sql-файл на хосте с UTF-8 payload'ом через SFTP
sftp = client.open_sftp()
with sftp.open("/tmp/fix_names.sql", "w") as f:
    f.write(SQL)
sftp.close()

# Копируем файл в контейнер и выполняем
copy_cmd = f"docker cp /tmp/fix_names.sql {cid}:/tmp/fix_names.sql"
_, stdout, stderr = client.exec_command(copy_cmd)
stdout.channel.recv_exit_status()

exec_cmd = f"docker exec {cid} psql -U hulk -d hulk -f /tmp/fix_names.sql"
_, stdout, stderr = client.exec_command(exec_cmd)
out = stdout.read().decode("utf-8", errors="replace")
err = stderr.read().decode("utf-8", errors="replace")
print(out)
if err:
    print("STDERR:", err)

client.close()
