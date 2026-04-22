#!/usr/bin/env python3
"""
Выполнить команду на VPS по SSH. Пароль — из env HULK_SSH_PASS (если задан),
иначе — из ключа ~/.ssh/hulk_deploy (когда настроим ключ-авторизацию).

Использование:
  python ssh_run.py "uname -a"
  HULK_SSH_PASS=xxx python ssh_run.py "apt update -y"
"""
import os
import sys
import paramiko

HOST = os.environ.get("HULK_SSH_HOST", "104.128.128.96")
USER = os.environ.get("HULK_SSH_USER", "root")
PORT = int(os.environ.get("HULK_SSH_PORT", "22"))


def run(cmd: str) -> int:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    password = os.environ.get("HULK_SSH_PASS")
    key_file = os.path.expanduser("~/.ssh/hulk_deploy")
    if os.path.exists(key_file) and not password:
        client.connect(HOST, port=PORT, username=USER, key_filename=key_file, timeout=20)
    else:
        client.connect(HOST, port=PORT, username=USER, password=password, timeout=20)
    # get_pty — чтобы sudo/apt и т.п. вели себя адекватно
    stdin, stdout, stderr = client.exec_command(cmd, timeout=600, get_pty=True)
    exit_code = stdout.channel.recv_exit_status()
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    # На Windows stdout может не кодировать часть UTF-8 символов (cp1251).
    # Принудительно кодируем через encode с errors=replace.
    def safe_write(stream, text):
        data = text.encode("utf-8", errors="replace")
        try:
            stream.buffer.write(data)
            stream.buffer.flush()
        except Exception:
            stream.write(text.encode("ascii", errors="replace").decode("ascii"))
    if out:
        safe_write(sys.stdout, out)
    if err:
        safe_write(sys.stderr, err)
    client.close()
    return exit_code


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: ssh_run.py '<command>'", file=sys.stderr)
        sys.exit(2)
    code = run(" ".join(sys.argv[1:]))
    sys.exit(code)
