import os
import socket
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.request
from contextlib import redirect_stdout
from io import StringIO
from unittest.mock import patch

import pytest

from backend.app.cli import main as bootstrap_main
from backend.app.core.config import PROJECT_ROOT


@pytest.fixture
def startup_env(tmp_path):
    return {
        **os.environ,
        "DATABASE_PATH": str(tmp_path / "database/users.db"),
        "FILES_ROOT": str(tmp_path / "files"),
        "SECRET_KEY": "startup-test-secret-" * 4,
        "FILES_APP_OPEN_BROWSER": "false",
        "PYTHONIOENCODING": "utf-8",
    }


def bootstrap(env):
    # Windows getpass reads the console directly, so substitute only the input boundary.
    output = StringIO()
    with (
        patch.dict(os.environ, env),
        patch.object(sys, "argv", ["cli", "bootstrap"]),
        patch("builtins.input", return_value="admin"),
        patch("getpass.getpass", return_value="Startup-password-123"),
        redirect_stdout(output),
    ):
        bootstrap_main()
    return subprocess.CompletedProcess(args=["bootstrap"], returncode=0, stdout=output.getvalue(), stderr="")


def test_bootstrap_does_not_disclose_password_or_replace_existing_user(startup_env):
    first = bootstrap(startup_env)
    assert first.returncode == 0, first.stderr
    assert "Startup-password-123" not in first.stdout + first.stderr
    with sqlite3.connect(startup_env["DATABASE_PATH"]) as db:
        before = db.execute("SELECT id, username, hashed_password FROM users").fetchall()
    second = bootstrap(startup_env)
    assert second.returncode == 0
    with sqlite3.connect(startup_env["DATABASE_PATH"]) as db:
        assert db.execute("SELECT id, username, hashed_password FROM users").fetchall() == before


def test_launcher_reports_occupied_port_without_stopping_service(startup_env):
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        listener.listen()
        result = subprocess.run(
            [sys.executable, "-m", "backend.app.launcher"],
            cwd=PROJECT_ROOT,
            env={**startup_env, "FILES_APP_PORT": str(listener.getsockname()[1])},
            capture_output=True,
            text=True,
            timeout=15,
        )
        assert result.returncode != 0
        assert "is occupied" in result.stderr
        assert listener.getsockname()[1] > 0


@pytest.mark.parametrize("new_settings", [False, True])
def test_launcher_settings_compatibility_and_precedence(startup_env, new_settings):
    from backend.app.launcher import main

    env = {**startup_env, "FILES_APP_PORT": "8001", "FILES_APP_OPEN_BROWSER": "false"}
    if new_settings:
        env.update(FILEHUB_PORT="8002", FILEHUB_OPEN_BROWSER="true")
    with (
        patch.dict(os.environ, env, clear=True),
        patch("backend.app.launcher.socket.socket"),
        patch("backend.app.launcher.threading.Thread") as thread,
        patch("backend.app.launcher.uvicorn.run") as run,
    ):
        main()
    assert run.call_args.kwargs["port"] == (8002 if new_settings else 8001)
    assert thread.called == new_settings


@pytest.mark.skipif(os.name != "nt", reason="Windows BAT launcher")
@pytest.mark.parametrize("script", ["start_files_app.bat", "start_filehub.bat"])
def test_windows_bat_serves_new_frontend_with_isolated_database(startup_env, script):
    assert bootstrap(startup_env).returncode == 0
    with socket.socket() as check:
        check.bind(("127.0.0.1", 0))
        port = check.getsockname()[1]
    process = subprocess.Popen(
        [os.environ.get("COMSPEC", "cmd.exe"), "/d", "/c", script],
        cwd=PROJECT_ROOT,
        env={**startup_env, "FILES_APP_PORT": str(port)},
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        creationflags=subprocess.CREATE_NO_WINDOW,
    )
    try:
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            if process.poll() is not None:
                pytest.fail(process.stdout.read().decode("utf-8", errors="replace"))
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=1) as response:
                    assert response.status == 200
                break
            except (urllib.error.URLError, OSError):
                time.sleep(0.1)
        else:
            pytest.fail("BAT server did not become ready")
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/files") as response:
            html = response.read().decode("utf-8")
            assert 'id="root"' in html
            assert "/assets/" in html
    finally:
        # Only the process tree created by this test is terminated.
        if process.poll() is None:
            subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], capture_output=True)
        process.wait(timeout=10)
        if process.stdout:
            process.stdout.close()
