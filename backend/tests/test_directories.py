import json

import pytest

from backend.app.services.directories import definitions, inspect_directory
from backend.tests.test_app import sign_in


def test_inventory_admin_only_and_does_not_write(client, configured):
    assert client.get("/api/v1/admin/directories").status_code == 401
    sign_in(client)
    files = client.app.state.files
    client.app.state.directories = definitions(files, json.dumps([
        {"id": "empty", "name": "空資料夾", "path": "empty"},
        {"id": "missing", "name": "未掛載", "path": "missing"},
    ]))
    before = set(configured.files_root.rglob("*"))
    response = client.get("/api/v1/admin/directories")
    assert response.status_code == 200
    items = response.json()["items"]
    assert [item["status"] for item in items] == ["readable", "readable", "missing"]
    assert set(configured.files_root.rglob("*")) == before


@pytest.mark.parametrize("path", ["../outside", "/etc", "empty/../../", ".files-app-trash"])
def test_status_rejects_unsafe_paths(client, path):
    sign_in(client)
    assert client.get("/api/v1/admin/directory-status", params={"path": path}).status_code == 400


@pytest.mark.parametrize("raw", ["{}", "null", "not-json", '[{"id":"root","name":"x","path":"empty"}]', '[{"id":"x","name":"x","path":"a/b"}]'])
def test_invalid_deployment_catalog_fails(client, raw):
    with pytest.raises(ValueError, match="FILES_DIRECTORIES"):
        definitions(client.app.state.files, raw)


def test_unavailable_and_non_directory_status(client, monkeypatch):
    files = client.app.state.files
    assert inspect_directory(files, "binary.exe")["status"] == "not_directory"
    def denied(*args):
        raise PermissionError
    monkeypatch.setattr("backend.app.services.directories.os.scandir", denied)
    assert inspect_directory(files, "empty")["status"] == "unavailable"


def test_general_user_cannot_read_deployment_paths(client):
    from sqlalchemy import select

    from backend.app.models.access import AccountAccess
    from backend.app.models.user import User
    sign_in(client)
    with client.app.state.session_factory() as db:
        user = db.scalar(select(User).where(User.username == "admin"))
        access = db.get(AccountAccess, user.id)
        access.role = "user"
        access.root = "empty"
        db.commit()
    assert client.get("/api/v1/admin/directories").status_code == 403
    assert client.get("/api/v1/admin/directory-status?path=").status_code == 403


def test_declared_root_protection_keeps_contents_usable(client, configured):
    from backend.tests.test_app import HEADERS
    from backend.tests.test_operations import finish, submit

    sign_in(client)
    root = configured.files_root / "中文 O'Brien"
    client.app.state.files.deployment_roots = (root,)
    response = client.patch("/api/v1/files/rename", headers=HEADERS, json={"path": root.name, "name": "renamed"})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "MOUNT_ROOT"
    for kind in ["move", "trash"]:
        response = submit(client, kind=kind, paths=[root.name])
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "MOUNT_ROOT"
    copied = finish(client, submit(client, paths=[root.name]))
    assert copied["status"] == "completed"
    response = client.patch("/api/v1/files/rename", headers=HEADERS, json={"path": f"{root.name}/hello.txt", "name": "renamed.txt"})
    assert response.status_code == 200
    assert (root / "renamed.txt").is_file()


def test_directory_deep_link(configured):
    from fastapi.testclient import TestClient

    from backend.app.main import create_app

    configured.frontend_dist.mkdir()
    (configured.frontend_dist / "index.html").write_text("test-shell", encoding="utf-8")
    with TestClient(create_app(configured)) as client:
        assert client.get("/settings/directories").text == "test-shell"


def test_duplicate_and_traversal_catalog_rejected(client):
    files = client.app.state.files
    for entries in [
        [{"id": "x", "name": "X", "path": "empty"}, {"id": "y", "name": "Y", "path": "empty"}],
        [{"id": "x", "name": "X", "path": ".."}],
        [{"id": "x", "name": "X", "path": ".files-app-trash"}],
    ]:
        with pytest.raises(ValueError):
            definitions(files, json.dumps(entries))
