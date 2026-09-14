import io
import zipfile
from uuid import uuid4

from backend.app.core.security import password_hash
from backend.app.models.access import AccountAccess
from backend.app.models.user import User
from backend.tests.test_app import sign_in
from backend.tests.test_operations import finish

HEADERS = {"X-Requested-With": "Files-App"}


def seed(client, root="中文 O'Brien", permissions=None):
    with client.app.state.session_factory() as db:
        user = User(username="scoped", hashed_password=password_hash.hash("Scoped-test-123"))
        db.add(user)
        db.flush()
        db.add(
            AccountAccess(
                user_id=user.id,
                role="user",
                enabled=True,
                root=root,
                permissions=permissions or ["browse", "read"],
                must_change_password=False,
            )
        )
        db.commit()
        return user.id


def login(client):
    assert (
        client.post(
            "/api/v1/auth/login", headers=HEADERS, json={"username": "scoped", "password": "Scoped-test-123"}
        ).status_code
        == 200
    )


def test_scoped_endpoints_and_archive_names(client, configured):
    seed(client)
    login(client)
    listing = client.get("/api/v1/files").json()
    assert listing["path"] == ""
    assert [entry["path"] for entry in listing["entries"]] == ["hello.txt"]
    assert client.get("/api/v1/files/content", params={"path": "hello.txt"}).status_code == 200
    for endpoint in ["", "/tree", "/content", "/download", "/image", "/pdf"]:
        assert client.get("/api/v1/files" + endpoint, params={"path": "../binary.exe"}).status_code in {
            400,
            403,
            404,
        }
    assert client.post("/api/v1/files/directory", headers=HEADERS, json={"name": "denied"}).status_code == 403
    assert (
        client.post(
            "/api/v1/files/upload", headers=HEADERS, params={"name": "denied"}, content=b"no"
        ).status_code
        == 403
    )
    assert (
        client.patch(
            "/api/v1/files/rename", headers=HEADERS, json={"path": "hello.txt", "name": "changed"}
        ).status_code
        == 403
    )
    response = client.post(
        "/api/v1/files/operations",
        headers=HEADERS,
        json={"kind": "archive", "paths": ["hello.txt"], "request_id": str(uuid4())},
    )
    assert response.status_code == 202, response.text
    job = finish(client, response)
    assert job["status"] == "completed", job
    assert job["items"][0]["source"] == "hello.txt"
    raw = client.get(f"/api/v1/files/operations/{job['id']}/archive")
    with zipfile.ZipFile(io.BytesIO(raw.content)) as archive:
        assert archive.namelist() == ["hello.txt"]


def test_scope_change_hides_history_and_own_root_cannot_move(client):
    user_id = seed(client, permissions=["browse", "read", "modify", "upload", "delete"])
    login(client)
    assert (
        client.post(
            "/api/v1/files/operations",
            headers=HEADERS,
            json={"kind": "trash", "paths": [""], "request_id": str(uuid4())},
        ).status_code
        == 400
    )
    response = client.post(
        "/api/v1/files/operations",
        headers=HEADERS,
        json={"kind": "archive", "paths": ["hello.txt"], "request_id": str(uuid4())},
    )
    job = finish(client, response)
    with client.app.state.session_factory() as db:
        access = db.get(AccountAccess, user_id)
        access.root = "empty"
        access.version += 1
        db.commit()
    assert client.get(f"/api/v1/files/operations/{job['id']}/archive").status_code == 403
    assert client.get("/api/v1/files/operations").json() == []


def test_trash_owner_and_scoped_restore(client, configured):
    seed(client, permissions=["browse", "read", "delete", "upload"])
    sign_in(client)
    response = client.post(
        "/api/v1/files/operations",
        headers=HEADERS,
        json={"kind": "trash", "paths": ["中文 O'Brien/hello.txt"], "request_id": str(uuid4())},
    )
    finish(client, response)
    record = client.get("/api/v1/trash").json()[0]
    login(client)
    assert client.get("/api/v1/trash").json() == []
    assert (
        client.post(
            "/api/v1/trash/restore", headers=HEADERS, json={"ids": [record["id"]], "request_id": str(uuid4())}
        ).status_code
        == 404
    )
