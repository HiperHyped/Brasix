from __future__ import annotations

import json
import os
import signal
import subprocess
import time
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

from app.ui import create_app

app = create_app()

HOST = "127.0.0.1"
PORT = 8000


def _port_is_open(host: str, port: int) -> bool:
    import socket

    probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    probe.settimeout(0.25)
    try:
        return probe.connect_ex((host, port)) == 0
    finally:
        probe.close()


def _brasix_is_running(host: str, port: int) -> bool:
    if not _port_is_open(host, port):
        return False

    try:
        with urlopen(f"http://{host}:{port}/api/health", timeout=0.75) as response:
            payload = json.loads(response.read().decode("utf-8"))
        return payload.get("service") == "brasix" and payload.get("status") == "ok"
    except (HTTPError, URLError, TimeoutError, OSError, json.JSONDecodeError, UnicodeDecodeError):
        return False


def _listening_pids(port: int) -> list[int]:
    result = subprocess.run(
        ["netstat", "-ano", "-p", "TCP"],
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="ignore",
    )
    pids: list[int] = []
    for raw_line in result.stdout.splitlines():
        parts = raw_line.split()
        if len(parts) < 5:
            continue
        local_address = parts[1]
        state = parts[3]
        pid_text = parts[4]
        if not local_address.endswith(f":{port}") or state.upper() != "LISTENING":
            continue
        if not pid_text.isdigit():
            continue
        pid = int(pid_text)
        if pid > 0 and pid not in pids:
            pids.append(pid)
    return pids


def _terminate_pid(pid: int) -> None:
    if os.name == "nt":
        subprocess.run(["taskkill", "/PID", str(pid), "/F", "/T"], check=False, capture_output=True)
        return
    os.kill(pid, signal.SIGTERM)


def _stop_existing_brasix(host: str, port: int) -> None:
    if not _brasix_is_running(host, port):
        return

    for pid in _listening_pids(port):
        _terminate_pid(pid)

    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        if not _port_is_open(host, port):
            return
        time.sleep(0.1)

    raise RuntimeError(f"Nao foi possivel liberar a porta {port} para reiniciar o Brasix.")
 
if __name__ == "__main__":
    import uvicorn

    if _brasix_is_running(HOST, PORT):
        _stop_existing_brasix(HOST, PORT)

    uvicorn.run(app, host=HOST, port=PORT, reload=False)
