import os
import sqlite3
import subprocess

import bcrypt
import pytest
from fastapi.testclient import TestClient

from backend.app.core.config import Settings
from backend.app.main import create_app
from backend.app.models.user import User
from backend.app.services.files import FileService

HEADERS = {"X-Requested-With": "Files-App"}
PASSWORD = "Test-password-123"


def sign_in(client, password=PASSWORD):
    return client.post(
        "/api/v1/auth/login", json={"username": "admin", "password": password}, headers=HEADERS
    )


def test_authentication_cookie_and_revocation(client):
    assert client.get("/api/v1/files").status_code == 401
    response = sign_in(client)
    assert response.status_code == 200
    assert "HttpOnly" in response.headers["set-cookie"]
    assert "SameSite=strict" in response.headers["set-cookie"]
    assert "access_token" not in response.json()
    cookie = client.cookies.get("files_session")
    assert client.get("/api/v1/auth/me").json()["username"] == "admin"
    assert client.post("/api/v1/auth/logout", headers=HEADERS).status_code == 200
    assert client.get("/api/v1/auth/me", headers={"Cookie": f"files_session={cookie}"}).status_code == 401


def test_password_change_requires_old_password_and_revokes_sessions(client):
    sign_in(client)
    first_cookie = client.cookies.get("files_session")
    sign_in(client)
    assert (
        client.put(
            "/api/v1/auth/password",
            headers=HEADERS,
            json={"current_password": "incorrect", "new_password": "New-password-123"},
        ).status_code
        == 400
    )
    assert (
        client.put(
            "/api/v1/auth/password",
            headers=HEADERS,
            json={"current_password": PASSWORD, "new_password": "New-password-123"},
        ).status_code
        == 200
    )
    assert (
        client.get("/api/v1/auth/me", headers={"Cookie": f"files_session={first_cookie}"}).status_code == 401
    )
    assert sign_in(client).status_code == 401
    assert sign_in(client, "New-password-123").status_code == 200


def test_public_registration_and_cross_origin_are_blocked(client):
    assert client.post("/api/v1/auth/register", json={}, headers=HEADERS).status_code in (404, 405)
    assert (
        client.post("/api/v1/auth/login", json={"username": "admin", "password": PASSWORD}).status_code == 403
    )
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"username": "admin", "password": PASSWORD},
            headers={**HEADERS, "Origin": "https://untrusted.example"},
        ).status_code
        == 403
    )


def test_relative_paths_lazy_tree_and_preview(client, configured):
    sign_in(client)
    listing = client.get("/api/v1/files").json()
    assert listing["path"] == ""
    assert str(configured.files_root) not in str(listing)
    assert all("\\" not in entry["path"] for entry in listing["entries"])
    tree = client.get("/api/v1/files/tree").json()
    assert all(entry["type"] == "directory" for entry in tree["entries"])
    assert client.get("/api/v1/files", params={"path": "empty"}).json()["entries"] == []
    preview = client.get("/api/v1/files/content", params={"path": "中文 O'Brien/hello.txt"}).json()
    assert preview["content"] == "你好 <script>alert(1)</script>"
    assert preview["type"] == "text"
    assert (
        client.get("/api/v1/files/content", params={"path": "image.png"}).json()["mime_type"] == "image/png"
    )
    assert client.get("/api/v1/files/content", params={"path": "binary.exe"}).status_code == 415
    assert client.get("/api/v1/files/content", params={"path": "missing.txt"}).status_code == 404


@pytest.mark.parametrize(
    "path",
    ["../outside", "/etc", "C:/Windows", "C:\\Windows", "\\outside", "empty/../../outside", "file:stream"],
)
def test_traversal_rejected(client, path):
    sign_in(client)
    result = client.get("/api/v1/files", params={"path": path})
    assert result.status_code == 400
    assert result.json()["error"]["code"] == "INVALID_PATH"


@pytest.mark.parametrize(
    "name", ["..", ".", "CON", "con.txt", "COM1.log", "a/b", "a\\b", "trailing.", " leading"]
)
def test_invalid_folder_names(client, name):
    sign_in(client)
    assert client.post("/api/v1/files/directory", json={"name": name}, headers=HEADERS).status_code == 400


def test_create_directory_and_conflict(client, configured):
    sign_in(client)
    data = {"path": "empty", "name": "工作 O'Brien"}
    result = client.post("/api/v1/files/directory", json=data, headers=HEADERS)
    assert result.status_code == 201
    assert result.json()["path"] == "empty/工作 O'Brien"
    assert (configured.files_root / "empty" / "工作 O'Brien").is_dir()
    assert client.post("/api/v1/files/directory", json=data, headers=HEADERS).status_code == 409


def test_preview_size_and_validation_redaction(client, configured):
    sign_in(client)
    with (configured.files_root / "large.txt").open("wb") as stream:
        stream.truncate(10 * 1024 * 1024 + 1)
    assert client.get("/api/v1/files/content", params={"path": "large.txt"}).status_code == 413
    result = client.put(
        "/api/v1/auth/password", json={"current_password": PASSWORD, "new_password": "tiny"}, headers=HEADERS
    )
    assert result.status_code == 422
    assert PASSWORD not in result.text
    assert "tiny" not in result.text


def test_legacy_bcrypt_database_is_preserved(configured):
    configured.database_path.parent.mkdir()
    with sqlite3.connect(configured.database_path) as db:
        db.execute(
            "CREATE TABLE users (id INTEGER PRIMARY KEY, username VARCHAR UNIQUE NOT NULL, hashed_password VARCHAR NOT NULL, full_name VARCHAR)"
        )
        hashed = bcrypt.hashpw(PASSWORD.encode(), bcrypt.gensalt()).decode()
        db.execute("INSERT INTO users VALUES (7, ?, ?, ?)", ("admin", hashed, "Existing Admin"))
    with TestClient(create_app(configured)) as client:
        assert sign_in(client).status_code == 200
        with client.app.state.session_factory() as db:
            user = db.get(User, 7)
            assert user.hashed_password == hashed
            assert user.full_name == "Existing Admin"


def test_private_directory_cannot_be_exposed(tmp_path):
    private = tmp_path / "private"
    with pytest.raises(ValueError):
        FileService(tmp_path, (private,))


def test_external_link_is_skipped(configured, tmp_path):
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "private.txt").write_text("secret")
    link = configured.files_root / "external"
    try:
        link.symlink_to(outside, target_is_directory=True)
    except OSError:
        if os.name != "nt":
            raise
        subprocess.run(
            ["cmd", "/c", "mklink", "/J", str(link), str(outside)], check=True, capture_output=True
        )
    service = FileService(configured.files_root)
    assert "external" not in [entry.name for entry in service.list_directory().entries]
    from backend.app.core.errors import AppError

    with pytest.raises(AppError):
        service.preview("external/private.txt")


def test_login_throttling(client):
    for _ in range(10):
        assert sign_in(client, "wrong").status_code == 401
    assert sign_in(client, "wrong").status_code == 429


def test_relative_configuration_does_not_depend_on_working_directory(monkeypatch, tmp_path):
    from backend.app.core.config import PROJECT_ROOT

    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("FILES_ROOT", "srv")
    monkeypatch.setenv("DATABASE_PATH", "database/users.db")
    monkeypatch.setenv("SECRET_KEY", "test-secret-" * 8)
    config = Settings.from_env()
    assert config.files_root == PROJECT_ROOT / "srv"
    assert config.database_path == PROJECT_ROOT / "database/users.db"


def test_legacy_insecure_secret_rejected(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "your-secret-key-for-files-app-auth-12345678")
    with pytest.raises(ValueError):
        Settings.from_env()
