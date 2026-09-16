import os
import sqlite3
import subprocess
import sys
from contextlib import redirect_stdout
from io import StringIO
from unittest.mock import patch

import pytest

from backend.app.cli import main as bootstrap_main


@pytest.fixture
def startup_env(tmp_path):
    return {
        **os.environ,
        "DATABASE_PATH": str(tmp_path / "database/users.db"),
        "FILES_ROOT": str(tmp_path / "files"),
        "SECRET_KEY": "startup-test-secret-" * 4,
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
