import pytest

from backend.app.models.access import AccountAccess, DirectoryGrant
from backend.app.models.directory import Directory
from backend.app.services.directories import path_key
from backend.tests.test_access import HEADERS, login, seed
from backend.tests.test_app import sign_in


def change_catalog(client, directory_id, path=None):
    # Simulate external catalog corruption/removal; the public API never rebinds paths.
    with client.app.state.session_factory() as db:
        row = db.get(Directory, directory_id)
        if path is None:
            db.delete(row)
        else:
            row.path = path
        db.commit()


def multi(client):
    files = client.app.state.files
    with client.app.state.session_factory() as db:
        for key, path in {"work": "empty", "reports": "中文 O'Brien", "secret": "secret"}.items():
            db.add(Directory(id=key, name=path, path=path, path_key=path_key(path)))
        db.commit()
    (files.root / "secret").mkdir()
    (files.root / "secret/private.txt").write_text("private")
    user_id = seed(client)
    with client.app.state.session_factory() as db:
        access = db.get(AccountAccess, user_id)
        access.scope_mode, access.root, access.permissions = "multiple", None, []
        access.directory_grants = [
            DirectoryGrant(directory_id="work", directory_path="empty", permissions=["browse", "read", "upload", "modify", "delete", "share"]),
            DirectoryGrant(directory_id="reports", directory_path="中文 O'Brien", permissions=["browse", "read"]),
        ]
        db.commit()
    login(client)
    return user_id


def test_virtual_root_and_independent_permissions(client):
    multi(client)
    listing = client.get("/api/v1/files").json()
    assert {e["path"] for e in listing["entries"]} == {"empty", "中文 O'Brien"}
    assert listing["permissions"] == ["browse"]
    assert client.get("/api/v1/files", params={"path": "中文 O'Brien"}).json()["permissions"] == ["browse", "read"]
    for endpoint in ["", "/tree", "/content", "/download", "/capabilities"]:
        assert client.get("/api/v1/files" + endpoint, params={"path": "secret/private.txt"}).status_code == 403
    assert client.get("/api/v1/files/download", params={"path": "中文 O'Brien/hello.txt"}).status_code == 200
    for path in ["", "secret", "中文 O'Brien"]:
        assert client.post("/api/v1/files/upload", headers=HEADERS, params={"path": path, "name": "new.txt"}, content=b"no").status_code == 403
        assert client.post("/api/v1/files/directory", headers=HEADERS, json={"path": path, "name": "new"}).status_code == 403
    assert client.post("/api/v1/files/upload", headers=HEADERS, params={"path": "empty", "name": "new.txt"}, content=b"yes").status_code == 201
    assert client.patch("/api/v1/files/rename", headers=HEADERS, json={"path": "empty/new.txt", "name": "renamed.txt"}).status_code == 200
    assert client.patch("/api/v1/files/rename", headers=HEADERS, json={"path": "中文 O'Brien/hello.txt", "name": "denied.txt"}).status_code == 403


def test_catalog_change_fails_closed(client):
    multi(client)
    change_catalog(client, "work", "secret")
    assert client.get("/api/v1/files", params={"path": "empty"}).status_code == 403
    assert client.get("/api/v1/files", params={"path": "secret"}).status_code == 403
    assert [e["path"] for e in client.get("/api/v1/files").json()["entries"]] == ["中文 O'Brien"]


def test_admin_grants_validation_audit_and_legacy_mode(client):
    multi(client)
    sign_in(client)
    payload = {"username": "multi-new", "password": "Multi-test-123", "full_name": "Before", "enabled": True, "scope_mode": "multiple", "directory_grants": [{"directory_id": "work", "permissions": ["browse", "read"]}]}
    for grants in [[], [{"directory_id": "unknown", "permissions": ["browse"]}], payload["directory_grants"] * 2, [{"directory_id": "work", "permissions": ["browse", "share"]}]]:
        assert client.post("/api/v1/admin/accounts", headers=HEADERS, json={**payload, "directory_grants": grants}).status_code == 400
    response = client.post("/api/v1/admin/accounts", headers=HEADERS, json=payload)
    assert response.status_code == 201, response.text
    account = response.json()
    assert account["root"] is None and account["permissions"] == []
    assert account["directory_grants"][0]["directory_path"] == "empty"
    response = client.put(f"/api/v1/admin/accounts/{account['id']}", headers=HEADERS, json={**payload, "full_name": "After"})
    assert response.status_code == 200, response.text
    audit = client.get("/api/v1/admin/audit").json()[0]["details"]
    assert audit["before"]["full_name"] == "Before" and audit["after"]["full_name"] == "After"
    assert "Multi-test-123" not in str(audit)
    response = client.put(f"/api/v1/admin/accounts/{account['id']}", headers=HEADERS, json={"enabled": True, "scope_mode": "single", "root": "empty", "permissions": ["browse"]})
    assert response.status_code == 200
    assert response.json()["directory_grants"] == []



def change_grant(client, user_id, directory_id, permissions, bump=True):
    from backend.app.services.transfers import MUTATION_LOCK
    with MUTATION_LOCK, client.app.state.session_factory() as db:
        access = db.get(AccountAccess, user_id)
        next(g for g in access.directory_grants if g.directory_id == directory_id).permissions = permissions
        if bump:
            access.version += 1
        db.commit()


def test_copy_move_require_source_and_destination_permissions(client):
    from backend.tests.test_operations import finish, submit
    user_id = multi(client)
    source = "中文 O'Brien/hello.txt"
    job = finish(client, submit(client, paths=[source], destination="empty"))
    assert job["status"] == "completed", job
    assert submit(client, paths=["empty/hello.txt"], destination="中文 O'Brien").status_code == 403
    assert submit(client, "move", [source], "empty").status_code == 403
    assert submit(client, "move", ["empty/hello.txt"], "中文 O'Brien").status_code == 403
    assert submit(client, paths=[source], destination="").status_code == 403
    # The destination may accept uploads without granting read; copy uses source read only.
    change_grant(client, user_id, "work", ["browse", "upload", "modify"])
    assert finish(client, submit(client, paths=[source], destination="empty", conflict="keep_both"))["status"] == "completed"
    change_grant(client, user_id, "reports", ["browse", "read", "modify"])
    assert submit(client, "move", ["empty/hello.txt"], "中文 O'Brien").status_code == 403
    change_grant(client, user_id, "reports", ["browse", "read", "modify", "upload"])
    assert finish(client, submit(client, "move", ["empty/hello.txt"], "中文 O'Brien", conflict="keep_both"))["status"] == "completed"


def test_archive_checks_every_source_and_revalidates_download(client):
    import io
    import zipfile

    from backend.tests.test_operations import finish, submit
    user_id = multi(client)
    (client.app.state.files.root / "empty/work.txt").write_text("work")
    sources = ["empty/work.txt", "中文 O'Brien/hello.txt"]
    assert submit(client, "archive", sources + ["secret/private.txt"]).status_code == 403
    job = finish(client, submit(client, "archive", sources))
    assert job["status"] == "completed", job
    url = f"/api/v1/files/operations/{job['id']}/archive"
    with zipfile.ZipFile(io.BytesIO(client.get(url).content)) as archive:
        assert set(archive.namelist()) == set(sources)
    change_grant(client, user_id, "reports", ["browse"], bump=False)
    assert client.get(url).status_code == 403
    assert submit(client, "archive", sources).status_code == 403


def test_share_directory_permission_and_existing_cookie_revocation(client):
    from backend.tests.test_shares import create, open_share
    user_id = multi(client)
    assert client.post("/api/v1/shares", headers=HEADERS, json={"path":"中文 O'Brien/hello.txt"}).status_code == 403
    (client.app.state.files.root / "empty/work.txt").write_text("work")
    share = create(client, path="empty/work.txt")
    result = open_share(client, share)
    url = result.json()["download_url"]
    assert client.get(url).status_code == 200
    change_grant(client, user_id, "work", ["browse", "read"], bump=False)
    assert client.get(url).status_code == 404
    assert open_share(client, share).status_code == 404


def test_trash_restore_checks_owner_original_scope_and_destination(client):
    from uuid import uuid4

    from backend.tests.test_operations import finish, submit
    user_id = multi(client)
    (client.app.state.files.root / "empty/work.txt").write_text("work")
    assert submit(client, "trash", ["中文 O'Brien/hello.txt"]).status_code == 403
    assert finish(client, submit(client, "trash", ["empty/work.txt"]))["status"] == "completed"
    record = client.get("/api/v1/trash").json()[0]
    def restore(destination):
        return client.post("/api/v1/trash/restore", headers=HEADERS, json={"ids":[record["id"]],"destination":destination,"request_id":str(uuid4())})
    assert restore("中文 O'Brien").status_code == 403
    change_grant(client, user_id, "work", ["browse", "read"])
    assert restore(None).status_code == 403
    change_grant(client, user_id, "work", ["browse", "read", "upload"])
    assert finish(client, restore(None))["status"] == "completed"
    assert (client.app.state.files.root / "empty/work.txt").read_text() == "work"


def test_catalog_change_rejects_job_replay_and_folder_upload_mapping(client):
    from uuid import uuid4

    from backend.tests.test_folder_uploads import prepare
    from backend.tests.test_operations import finish, submit
    multi(client)
    key = str(uuid4())
    response = submit(client, paths=["中文 O'Brien/hello.txt"], request_id=key)
    job = finish(client, response)
    batch_key = str(uuid4())
    assert prepare(client, destination="empty", request_id=batch_key).status_code == 200
    change_catalog(client, "reports")
    assert client.get(f"/api/v1/files/operations/{job['id']}").status_code == 403
    assert submit(client, paths=["中文 O'Brien/hello.txt"], request_id=key).status_code == 403
    assert prepare(client, destination="empty", request_id=batch_key).status_code == 409
    change_catalog(client, "work")
    assert prepare(client, destination="empty", request_id=batch_key).status_code == 403


def test_stream_upload_revocation_before_publication(client):
    import asyncio

    import pytest

    from backend.app.core.errors import AppError
    from backend.app.services.access import ScopedFiles
    from backend.app.services.transfers import upload_stream
    user_id = multi(client)
    service = ScopedFiles(client.app.state.files, client.app.state.session_factory, user_id, "upload")
    async def chunks():
        yield b"part"
        change_grant(client, user_id, "work", ["browse", "read"])
        yield b"rest"
    with pytest.raises(AppError):
        asyncio.run(upload_stream(service, "empty", "revoked.txt", chunks(), 8))
    assert list((client.app.state.files.root / "empty").iterdir()) == []


def test_running_copy_revocation_prevents_publication(client, monkeypatch):
    import time
    from threading import Event

    from backend.app.models.operation import Operation
    from backend.tests.test_operations import submit
    user_id = multi(client)
    operations = client.app.state.operations
    entered, release = Event(), Event()
    original = operations.copy_tree
    def paused(*args):
        original(*args)
        entered.set()
        assert release.wait(10)
    monkeypatch.setattr(operations, "copy_tree", paused)
    response = submit(client, paths=["中文 O'Brien/hello.txt"])
    assert response.status_code == 202, response.text
    try:
        assert entered.wait(10)
        change_grant(client, user_id, "work", ["browse", "read"])
    finally:
        release.set()
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        with operations.factory() as db:
            job = db.get(Operation, response.json()["id"])
            if job.status not in {"queued", "running"}:
                assert job.status == "partial"
                break
        time.sleep(0.02)
    else:
        raise AssertionError("Revoked task did not stop")
    assert list((client.app.state.files.root / "empty").iterdir()) == []



def test_trash_filters_allowed_scopes_before_pagination(client):
    import time
    from uuid import uuid4

    from backend.app.models.operation import TrashItem
    multi(client)
    with client.app.state.session_factory() as db:
        for index in range(55):
            db.add(TrashItem(id=uuid4().hex, original_path=f"secret/hidden-{index}.txt", kind="file", deleted_by="scoped", deleted_at=time.time()+index, status="available", source_identity=[0, 0]))
        db.add(TrashItem(id=uuid4().hex, original_path="empty/visible.txt", kind="file", deleted_by="scoped", deleted_at=1, status="available", source_identity=[0, 0]))
        db.commit()
    assert [item["original_path"] for item in client.get("/api/v1/trash").json()] == ["empty/visible.txt"]
    change_catalog(client, "work")
    assert client.get("/api/v1/trash").json() == []


def test_admin_grant_update_revokes_existing_login(client):
    from backend.app.core.security import COOKIE_NAME
    user_id = multi(client)
    cookie = client.cookies.get(COOKIE_NAME)
    sign_in(client)
    response = client.put(f"/api/v1/admin/accounts/{user_id}", headers=HEADERS, json={"scope_mode":"multiple", "enabled":True, "directory_grants":[{"directory_id":"reports","permissions":["browse","read"]}]})
    assert response.status_code == 200, response.text
    client.cookies.clear()
    client.cookies.set(COOKIE_NAME, cookie, path="/api")
    assert client.get("/api/v1/files").status_code == 401
    login(client)
    assert [item["path"] for item in client.get("/api/v1/files").json()["entries"]] == ["中文 O'Brien"]


def test_queued_jobs_revalidate_before_starting(client, monkeypatch):
    import time
    from threading import Event

    from backend.app.models.operation import Operation
    from backend.tests.test_operations import submit
    user_id = multi(client)
    operations = client.app.state.operations
    entered, release = Event(), Event()
    original = operations.run
    def paused(job):
        entered.set()
        assert release.wait(10)
        return original(job)
    monkeypatch.setattr(operations, "run", paused)
    first = submit(client, paths=["中文 O'Brien/hello.txt"])
    assert first.status_code == 202
    try:
        assert entered.wait(10)
        second = submit(client, paths=["中文 O'Brien/hello.txt"], conflict="keep_both")
        assert second.status_code == 202
        with operations.factory() as db:
            assert db.get(Operation, second.json()["id"]).status == "queued"
        change_grant(client, user_id, "work", ["browse", "read"])
    finally:
        release.set()
    deadline = time.monotonic()+10
    while time.monotonic()<deadline:
        with operations.factory() as db:
            states = [db.get(Operation, r.json()["id"]).status for r in [first,second]]
        if all(state not in {"queued","running"} for state in states):
            assert states == ["partial","partial"]
            break
        time.sleep(0.02)
    else:
        raise AssertionError("Queued tasks did not stop")
    assert list((client.app.state.files.root / "empty").iterdir()) == []



def account_payload(client, user_id):
    return next(a for a in client.get("/api/v1/admin/accounts").json() if a["id"] == user_id)


def test_name_update_does_not_rebind_remapped_grant(client):
    user_id = multi(client)
    change_catalog(client, "reports", "secret")
    sign_in(client)
    before = account_payload(client, user_id)
    response = client.put(f"/api/v1/admin/accounts/{user_id}", headers=HEADERS, json={**before, "full_name": "Name only"})
    assert response.status_code == 200, response.text
    assert response.json()["directory_grants"] == before["directory_grants"]
    login(client)
    assert client.get("/api/v1/files/download", params={"path":"secret/private.txt"}).status_code == 403
    assert client.get("/api/v1/files", params={"path":"empty"}).status_code == 200


@pytest.mark.parametrize("change", ["removed", "remapped", "missing"])
def test_stale_grant_disable_revokes_session_and_cannot_reenable(client, change):
    from backend.app.core.security import COOKIE_NAME
    user_id = multi(client)
    cookie = client.cookies.get(COOKIE_NAME)
    if change == "removed":
        change_catalog(client, "reports")
    elif change == "remapped":
        change_catalog(client, "reports", "secret")
    else:
        source = client.app.state.files.root / "中文 O'Brien"
        source.rename(source.parent / "unavailable-reports")
    sign_in(client)
    before = account_payload(client, user_id)
    response = client.put(f"/api/v1/admin/accounts/{user_id}", headers=HEADERS, json={**before, "enabled": False})
    assert response.status_code == 200, response.text
    assert response.json()["directory_grants"] == before["directory_grants"]
    assert client.put(f"/api/v1/admin/accounts/{user_id}", headers=HEADERS, json={**before, "enabled": True}).status_code == 400
    client.cookies.clear()
    client.cookies.set(COOKIE_NAME, cookie, path="/api")
    assert client.get("/api/v1/files").status_code in {401,403}
    assert client.post("/api/v1/auth/login", headers=HEADERS, json={"username":"scoped","password":"Scoped-test-123"}).status_code == 403
    from sqlalchemy import select

    from backend.app.models.user import LoginSession
    with client.app.state.session_factory() as db:
        assert db.scalar(select(LoginSession.id).where(LoginSession.user_id==user_id)) is None


def test_rebind_requires_removal_then_new_grant(client):
    user_id = multi(client)
    change_catalog(client, "reports", "secret")
    sign_in(client)
    before = account_payload(client, user_id)
    changed = [{**g,"permissions":["browse"]} if g["directory_id"]=="reports" else g for g in before["directory_grants"]]
    assert client.put(f"/api/v1/admin/accounts/{user_id}", headers=HEADERS, json={**before,"directory_grants":changed}).status_code == 400
    kept = [g for g in before["directory_grants"] if g["directory_id"]!="reports"]
    assert client.put(f"/api/v1/admin/accounts/{user_id}", headers=HEADERS, json={**before,"directory_grants":kept}).status_code == 200
    response = client.put(f"/api/v1/admin/accounts/{user_id}", headers=HEADERS, json={**before,"directory_grants":kept+[{"directory_id":"reports","permissions":["browse","read"]}]})
    assert response.status_code == 200, response.text
    assert next(g for g in response.json()["directory_grants"] if g["directory_id"]=="reports")["directory_path"]=="secret"
    login(client)
    assert client.get("/api/v1/files/download", params={"path":"secret/private.txt"}).status_code == 200
