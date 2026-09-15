"""Loopback-only desktop launcher with readiness-based browser opening."""

import os
import socket
import threading
import time
import urllib.error
import urllib.request
import webbrowser

import uvicorn

from backend.app.core.config import Settings
from backend.app.main import create_app


def main():
    settings = Settings.from_env()
    port = int(os.getenv("FILEHUB_PORT", os.getenv("FILES_APP_PORT", "8000")))
    if not 1 <= port <= 65535:
        raise SystemExit("FILEHUB_PORT must be between 1 and 65535.")
    with socket.socket() as check:
        try:
            check.bind(("127.0.0.1", port))
        except OSError:
            raise SystemExit(
                f"Port {port} is occupied. Set FILEHUB_PORT to another port; no process was stopped."
            ) from None
    url = f"http://127.0.0.1:{port}"

    def open_when_ready():
        for _ in range(100):
            try:
                with urllib.request.urlopen(f"{url}/api/health", timeout=1) as response:
                    if response.status == 200:
                        webbrowser.open(url)
                        return
            except (urllib.error.URLError, OSError):
                time.sleep(0.2)

    if os.getenv("FILEHUB_OPEN_BROWSER", os.getenv("FILES_APP_OPEN_BROWSER", "true")).lower() == "true":
        threading.Thread(target=open_when_ready, daemon=True).start()
    print(f"FileHub: {url} (Ctrl+C to stop)")
    uvicorn.run(create_app(settings), host="127.0.0.1", port=port, log_level="info")


if __name__ == "__main__":
    main()
