import time

from backend.app.models.access import AccountAccess
from backend.app.models.share import FileShare
from backend.tests.test_access import login, seed
from backend.tests.test_app import sign_in

HEADERS = {"X-Requested-With": "Files-App"}


def create(client, **values):
    response = client.post("/api/v1/shares", headers=HEADERS, json={"path": "binary.exe", **values})
    assert response.status_code == 201, response.text
    return response.json()


def open_share(client, share, **values):
    return client.post(
        "/api/v1/public-shares/open", headers=HEADERS, json={"token": share["token"], **values}
    )


def test_password_share_download_and_revocation(client):
    sign_in(client)
    share = create(client, password="Share-password-123")
    with client.app.state.session_factory() as db:
        stored = db.get(FileShare, share["id"])
        assert share["token"] not in stored.token_hash
        assert stored.password_hash != "Share-password-123"
    client.cookies.clear()
    assert open_share(client, share).json() == {"needs_password": True}
    assert open_share(client, share, password="wrong").status_code == 401
    unlocked = open_share(client, share, password="Share-password-123")
    assert unlocked.status_code == 200
    url = unlocked.json()["download_url"]
    assert client.get(url).content == b"not executable"
    assert client.head(url).status_code == 200
    sign_in(client)
    assert client.post(f"/api/v1/shares/{share['id']}/revoke", headers=HEADERS).status_code == 200
    assert client.get(url).status_code == 404


def test_share_expiry_source_replacement_and_scope_change(client, configured):
    user_id = seed(client, permissions=["browse", "read", "share"])
    login(client)
    share = create(client, path="hello.txt")
    result = open_share(client, share).json()
    assert client.get(result["download_url"]).status_code == 200
    (configured.files_root / "中文 O'Brien/hello.txt").write_text("replacement", encoding="utf-8")
    assert client.get(result["download_url"]).status_code == 404
    second = create(client, path="hello.txt")
    with client.app.state.session_factory() as db:
        db.get(FileShare, second["id"]).expires_at = time.time() - 1
        db.commit()
    assert open_share(client, second).status_code == 404
    third = create(client, path="hello.txt")
    with client.app.state.session_factory() as db:
        access = db.get(AccountAccess, user_id)
        access.version += 1
        access.root = "empty"
        db.commit()
    assert open_share(client, third).status_code == 404


def test_share_permission_and_password_throttle(client):
    seed(client)
    login(client)
    assert client.post("/api/v1/shares", headers=HEADERS, json={"path": "hello.txt"}).status_code == 403
    sign_in(client)
    share = create(client, password="Share-password-123")
    client.cookies.clear()
    assert client.get(f"/api/v1/public-shares/download/{share['id']}").status_code == 403
    for _ in range(10):
        assert open_share(client, share, password="wrong").status_code == 401
    assert open_share(client, share, password="wrong").status_code == 429
