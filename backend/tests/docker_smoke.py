"""Run after docker compose build. Uses and removes only its unique test project."""

import io
import os
import secrets
import socket
import subprocess
import tempfile
import time
import zipfile
from pathlib import Path
from uuid import uuid4

import httpx

from backend.app.core.config import PROJECT_ROOT
from backend.tests.pdf_fixture import sample_pdf


def main():
    project = "filehub-smoke-" + uuid4().hex[:12]
    cache = (PROJECT_ROOT / ".cache").resolve()
    cache.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="docker-smoke-", dir=cache) as temporary:
        root = Path(temporary).resolve()
        assert root.is_relative_to(cache)
        (root / "中文 O'Brien.txt").write_text("Docker preview verified.", encoding="utf-8")
        (root / "sample.pdf").write_bytes(sample_pdf())
        with socket.socket() as check:
            check.bind(("127.0.0.1", 0))
            port = check.getsockname()[1]
        env = {
            **os.environ,
            "DOCKER_PORT": str(port),
            "DOCKER_FILES_DIR": root.as_posix(),
            "COOKIE_SECURE": "false",
        }
        command = ["docker", "compose", "-p", project]

        def compose(*args, input=None):
            return subprocess.run(
                command + list(args),
                cwd=PROJECT_ROOT,
                env=env,
                input=input,
                text=True,
                encoding="utf-8",
                capture_output=True,
                check=True,
                timeout=120,
            )

        try:
            compose("up", "-d", "--no-build", "--wait")
            assert compose("exec", "-T", "filehub", "id", "-u").stdout.strip() == "1000"
            password = secrets.token_urlsafe(20)
            # The account exists only in this test's isolated Compose volume.
            seed = f"""
from backend.app.core.config import Settings
from backend.app.core.security import password_hash
from backend.app.db.session import open_database
from backend.app.models.user import User
from backend.app.models.access import AccountAccess, PERMISSIONS
engine, factory = open_database(Settings.from_env().database_path)
with factory() as db:
    user=User(username="docker-test", hashed_password=password_hash.hash({password!r}))
    db.add(user)
    db.flush()
    db.add(AccountAccess(user_id=user.id,role='admin',enabled=True,root='',permissions=PERMISSIONS,must_change_password=False))
    db.commit()
engine.dispose()
"""
            compose("exec", "-T", "filehub", "python", "-", input=seed)
            with httpx.Client(
                base_url=f"http://127.0.0.1:{port}", headers={"X-Requested-With": "Files-App"}, timeout=10
            ) as client:

                def wait_task(response):
                    assert response.status_code == 202, response.text
                    task_id = response.json()["id"]
                    deadline = time.monotonic() + 30
                    while time.monotonic() < deadline:
                        task = client.get(f"/api/v1/files/operations/{task_id}").json()
                        if task["status"] not in {"queued", "running"}:
                            assert task["status"] == "completed", task
                            return task
                        time.sleep(0.1)
                    raise AssertionError("Task timed out")

                def operation(kind, paths, destination="", conflict="skip"):
                    return wait_task(
                        client.post(
                            "/api/v1/files/operations",
                            json={
                                "request_id": str(uuid4()),
                                "kind": kind,
                                "paths": paths,
                                "destination": destination,
                                "conflict": conflict,
                            },
                        )
                    )

                assert client.get("/api/health").status_code == 200
                assert 'id="root"' in client.get("/files").text
                assert client.get("/api/v1/files").status_code == 401
                assert (
                    client.post(
                        "/api/v1/auth/login", json={"username": "docker-test", "password": password}
                    ).status_code
                    == 200
                )
                assert (
                    client.get("/api/v1/files/content", params={"path": "中文 O'Brien.txt"}).json()["content"]
                    == "Docker preview verified."
                )
                assert client.post("/api/v1/files/directory", json={"name": "容器建立"}).status_code == 201
                assert (root / "容器建立").is_dir()
                params = {"path": "容器建立", "name": "上傳.txt"}
                uploaded = client.post("/api/v1/files/upload", params=params, content=b"docker upload")
                assert uploaded.status_code == 201, uploaded.text
                assert (
                    client.post("/api/v1/files/upload", params=params, content=b"collision").status_code
                    == 409
                )
                assert (
                    client.patch(
                        "/api/v1/files/rename", json={"path": "容器建立/上傳.txt", "name": "改名.txt"}
                    ).status_code
                    == 200
                )
                assert (
                    client.get("/api/v1/files/download", params={"path": "容器建立/改名.txt"}).content
                    == b"docker upload"
                )
                copied = operation("copy", ["容器建立"], conflict="keep_both")
                assert copied["items"][0]["target"] == "容器建立 (1)"
                operation("move", ["容器建立 (1)/改名.txt"])
                assert (root / "改名.txt").read_bytes() == b"docker upload"
                trashed = operation("trash", ["改名.txt"])
                assert not (root / "改名.txt").exists()
                trash_id = client.get("/api/v1/trash").json()[0]["id"]
                batch = {
                    "request_id": str(uuid4()),
                    "entries": [{"path": "批次/內層/a.txt", "size": 3}, {"path": "批次/空目錄"}],
                }
                prepared = client.post("/api/v1/files/upload-batch", json=batch)
                assert prepared.status_code == 200, prepared.text
                assert client.post("/api/v1/files/upload-batch", json=batch).json() == prepared.json()
                assert (
                    client.post(
                        "/api/v1/files/upload", params={"path": "批次/內層", "name": "a.txt"}, content=b"abc"
                    ).status_code
                    == 201
                )
                packed = operation("archive", ["批次"])
                archive_url = f"/api/v1/files/operations/{packed['id']}/archive"
                with zipfile.ZipFile(io.BytesIO(client.get(archive_url).content)) as archive:
                    assert archive.read("批次/內層/a.txt") == b"abc"
                    assert "批次/空目錄/" in archive.namelist()
                assert (
                    client.get(
                        "/api/v1/files/pdf", params={"path": "sample.pdf"}, headers={"Range": "bytes=0-4"}
                    ).content
                    == b"%PDF-"
                )
                assert client.get("/pdfjs/standard_fonts/LiberationSans-Regular.ttf").status_code == 200
                account = client.post(
                    "/api/v1/admin/accounts",
                    json={
                        "username": "restricted",
                        "password": "Docker-restricted-123",
                        "enabled": True,
                        "root": "容器建立",
                        "permissions": ["browse", "read"],
                    },
                )
                assert account.status_code == 201, account.text
                share = client.post(
                    "/api/v1/shares", json={"path": "sample.pdf", "password": "Docker-share-123"}
                )
                assert share.status_code == 201, share.text
                shared = share.json()
                compose("up", "-d", "--no-build", "--force-recreate", "--wait")
                assert len(client.get("/api/v1/admin/accounts").json()) == 2
                assert client.get("/api/v1/auth/me").json()["role"] == "admin"
                opened = client.post(
                    "/api/v1/public-shares/open",
                    json={"token": shared["token"], "password": "Docker-share-123"},
                )
                assert opened.status_code == 200, opened.text
                shared_url = opened.json()["download_url"]
                assert client.get(shared_url).content == sample_pdf()
                assert client.post(f"/api/v1/shares/{shared['id']}/revoke").status_code == 200
                assert client.get(shared_url).status_code == 404
                assert client.get(archive_url).status_code == 200
                assert client.get(f"/api/v1/files/operations/{trashed['id']}").json()["status"] == "completed"
                assert client.get("/api/v1/trash").json()[0]["id"] == trash_id
                wait_task(
                    client.post("/api/v1/trash/restore", json={"request_id": str(uuid4()), "ids": [trash_id]})
                )
                assert (root / "改名.txt").read_bytes() == b"docker upload"
                assert client.get("/api/v1/trash").json() == []
                assert client.post("/api/v1/files/directory", json={"name": "目的資料夾"}).status_code == 201
                assert (
                    client.patch(
                        "/api/v1/files/rename", json={"path": "容器建立", "name": "目的資料夾"}
                    ).status_code
                    == 409
                )
                assert (
                    client.patch(
                        "/api/v1/files/rename", json={"path": "目的資料夾", "name": "空目錄改名"}
                    ).status_code
                    == 200
                )
                assert client.get("/api/v1/auth/me").status_code == 200, (
                    "session/key/database must survive recreation"
                )
                assert client.get("/api/v1/files", params={"path": "容器建立"}).status_code == 200
                assert (
                    client.get("/api/v1/files/download", params={"path": "容器建立/改名.txt"}).content
                    == b"docker upload"
                )
                assert client.post("/api/v1/auth/logout").status_code == 200
                assert client.get("/api/v1/auth/me").status_code == 401
            print(
                "PASS: non-root, account scope persistence, password-share persistence and revocation, login, upload/download, folder manifest, nested upload, ZIP contents and persistence, PDF range/fonts, collision, rename, batch copy/move, trash/restore, persisted tasks/trash/files/session after recreation, logout."
            )
        except subprocess.CalledProcessError as exc:
            print(exc.stderr)
            raise
        finally:
            # No shared or real application volume is targeted by this unique project name.
            compose("down", "--volumes", "--remove-orphans")


if __name__ == "__main__":
    main()
