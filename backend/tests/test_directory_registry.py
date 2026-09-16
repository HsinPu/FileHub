import json
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from backend.app.main import create_app
from backend.app.models.access import AccountAccess, AuditEvent
from backend.app.models.directory import Directory, DirectoryRegistryState
from backend.tests.test_access import HEADERS, login, seed
from backend.tests.test_app import sign_in
from backend.tests.test_multi_directory import multi


def register(client, path="nfs/reports", name="報表中心"):
    return client.post("/api/v1/admin/directories", headers=HEADERS, json={"name": name, "path": path})


def patch(client, row, **changes):
    return client.patch(f"/api/v1/admin/directories/{row['id']}", headers=HEADERS,
                        json={"revision": row["revision"], **changes})


def test_nested_registration_and_conflicts(client):
    sign_in(client)
    root = client.app.state.files.root
    (root / "nfs/reports/2026").mkdir(parents=True)
    (root / "nfs/reports-old").mkdir()
    row = register(client, "nfs//reports/./").json()
    assert row["path"] == "nfs/reports"
    assert row["enabled"] and row["revision"] == 1
    assert register(client).status_code == 409
    assert register(client, "nfs").status_code == 409
    assert register(client, "nfs/reports/2026").status_code == 409
    assert register(client, "nfs/reports-old").status_code == 201
    assert patch(client, row, name="年度報表").status_code == 200
    assert patch(client, row, name="stale").status_code == 409
    assert patch(client, row, path="empty").status_code == 422
    assert (root / "nfs/reports").is_dir()
    assert client.get("/api/v1/admin/audit").json()[0]["action"] == "directory.update"


@pytest.mark.parametrize("path", ["", ".", "/etc", "../outside", "nfs/../empty", ".files-app-trash", "binary.exe", "missing"])
def test_registration_rejects_invalid_locations(client, path):
    sign_in(client)
    assert register(client, path).status_code in {400, 422}


def test_registry_and_browser_are_admin_only(client):
    assert register(client).status_code == 401
    seed(client)
    login(client)
    for url in ["directories", "directory-browser", "directories/anything/impact", "directory-status"]:
        assert client.get("/api/v1/admin/" + url).status_code == 403
    assert register(client).status_code == 403


def test_browser_is_shallow_bounded_and_confined(client):
    sign_in(client)
    root = client.app.state.files.root
    (root / "nfs/reports/deep").mkdir(parents=True)
    listing = client.get("/api/v1/admin/directory-browser?path=nfs").json()
    assert listing == {"path": "nfs", "items": [{"name": "reports", "path": "nfs/reports"}], "truncated": False}
    assert client.get("/api/v1/admin/directory-browser?path=../").status_code == 400
    for i in range(201):
        (root / "empty" / str(i)).mkdir()
    listing = client.get("/api/v1/admin/directory-browser?path=empty").json()
    assert len(listing["items"]) == 200 and listing["truncated"]


def test_disable_revokes_sessions_shares_and_cannot_revive_old_share(client):
    from backend.app.core.security import COOKIE_NAME
    from backend.tests.test_shares import create, open_share
    user_id = multi(client)
    (client.app.state.files.root / "empty/a.txt").write_text("content")
    share = create(client, path="empty/a.txt")
    url = open_share(client, share).json()["download_url"]
    cookie = client.cookies.get(COOKIE_NAME)
    sign_in(client)
    row = next(r for r in client.get("/api/v1/admin/directories").json()["items"] if r["id"] == "work")
    impact = client.get("/api/v1/admin/directories/work/impact").json()
    assert impact["accounts"][0]["id"] == user_id and impact["active_shares"] == 1
    disabled = patch(client, row, enabled=False).json()
    assert client.get(url).status_code == 404
    assert patch(client, disabled, enabled=True).status_code == 200
    assert client.get(url).status_code == 404
    client.cookies.clear()
    client.cookies.set(COOKIE_NAME, cookie, path="/api")
    assert client.get("/api/v1/files").status_code == 401
    login(client)
    assert client.get("/api/v1/files?path=empty").status_code == 200


def test_disable_does_not_block_legacy_scope_and_reports_impact(client):
    seed(client, root="")
    sign_in(client)
    row = register(client, "empty").json()
    assert client.get(f"/api/v1/admin/directories/{row['id']}/impact").json()["legacy_accounts"][0]["username"] == "scoped"
    assert patch(client, row, enabled=False).status_code == 200
    login(client)
    assert client.get("/api/v1/files?path=empty").status_code == 200


def test_missing_root_can_disable_single_account(client):
    user_id = seed(client, root="missing")
    sign_in(client)
    response = client.put(f"/api/v1/admin/accounts/{user_id}", headers=HEADERS,
                          json={"enabled": False, "root": "missing", "permissions": ["browse"]})
    assert response.status_code == 200
    with client.app.state.session_factory() as db:
        assert not db.get(AccountAccess, user_id).enabled


def test_import_only_once_and_database_is_authoritative(configured):
    config = replace(configured, directories_json=json.dumps([{"id": "old", "name": "舊名稱", "path": "empty"}]))
    with TestClient(create_app(config)) as client:
        with client.app.state.session_factory() as db:
            row = db.get(Directory, "old")
            row.name, row.enabled = "新名稱", False
            db.commit()
    with TestClient(create_app(replace(config, directories_json="not-json"))) as client:
        with client.app.state.session_factory() as db:
            row = db.get(Directory, "old")
            assert row.name == "新名稱" and not row.enabled
            assert db.get(DirectoryRegistryState, 1).legacy_imported
            assert list(db.scalars(select(AuditEvent))) == []


def test_failed_import_is_atomic_and_can_retry(configured):
    with pytest.raises(ValueError):
        with TestClient(create_app(replace(configured, directories_json="invalid"))):
            pass
    with TestClient(create_app(configured)) as client:
        with client.app.state.session_factory() as db:
            assert db.get(DirectoryRegistryState, 1).legacy_imported
            assert list(db.scalars(select(Directory))) == []


def test_registration_root_and_ancestor_are_protected_even_disabled(client):
    sign_in(client)
    (client.app.state.files.root / "nfs/reports").mkdir(parents=True)
    row = register(client).json()
    assert patch(client, row, enabled=False).status_code == 200
    for path in ["nfs", "nfs/reports"]:
        response = client.patch("/api/v1/files/rename", headers=HEADERS, json={"path": path, "name": "moved"})
        assert response.json()["error"]["code"] == "MOUNT_ROOT"


def test_concurrent_parent_child_registration_has_one_winner(client):
    from concurrent.futures import ThreadPoolExecutor

    from backend.app.core.errors import AppError
    from backend.app.schemas.directories import DirectoryCreate
    root = client.app.state.files.root
    (root / "nfs/reports").mkdir(parents=True)
    service = client.app.state.directory_registry
    def attempt(path):
        try:
            service.create(DirectoryCreate(name=path, path=path), 1)
            return 201
        except AppError as exc:
            return exc.status
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(attempt, ["nfs", "nfs/reports"])) == [201, 409]
    assert len(service.rows()) == 1


def test_empty_initialization_does_not_import_future_environment(configured):
    with TestClient(create_app(configured)):
        pass
    changed = replace(configured, directories_json='[{"id":"late","name":"late","path":"empty"}]')
    with TestClient(create_app(changed)) as client:
        assert client.app.state.directory_registry.rows() == []


def test_v7_upgrade_preserves_orphan_grants_and_does_not_create_access(configured):
    import sqlite3

    from backend.app.db.session import open_database
    from backend.app.models.access import DirectoryGrant
    from backend.app.models.user import User
    engine, factory = open_database(configured.database_path)
    with factory() as db:
        db.add(User(id=42, username="legacy", hashed_password="keep"))
        db.flush()
        db.add(AccountAccess(user_id=42, role="user", enabled=True, root=None, scope_mode="multiple",
                             permissions=[], version=9, directory_grants=[DirectoryGrant(
                                 directory_id="orphan", directory_path="empty", permissions=["browse", "read"])]))
        db.commit()
    engine.dispose()
    with sqlite3.connect(configured.database_path) as db:
        db.execute("DROP TABLE directories")
        db.execute("DROP TABLE directory_registry_state")
        db.execute("DELETE FROM schema_migrations WHERE version=8")
    for _ in range(2):
        with TestClient(create_app(configured)) as client:
            assert client.app.state.files.directory_catalog == {}
            with client.app.state.session_factory() as db:
                access = db.get(AccountAccess, 42)
                assert access.version == 9 and access.directory_grants[0].directory_path == "empty"
                assert db.get(User, 42).hashed_password == "keep"


def nested_account(client):
    root = client.app.state.files.root
    for path in ["nfs/reports/2026", "nfs/departments/it", "nfs/private"]:
        (root / path).mkdir(parents=True)
    (root / "nfs/reports/2026/report.txt").write_text("report")
    (root / "nfs/private/secret.txt").write_text("secret")
    sign_in(client)
    reports = register(client).json()
    work = register(client, "nfs/departments/it", "IT 文件").json()
    user_id = seed(client)
    payload = dict(enabled=True, scope_mode="multiple", directory_grants=[
        dict(directory_id=reports["id"], permissions=["browse", "read", "share"]),
        dict(directory_id=work["id"], permissions=["browse", "read", "upload", "modify", "delete"]),
    ])
    assert client.put(f"/api/v1/admin/accounts/{user_id}", headers=HEADERS, json=payload).status_code == 200
    login(client)
    return reports, work


def test_nested_virtual_root_navigation_and_all_read_boundaries(client):
    nested_account(client)
    roots = client.get("/api/v1/files").json()
    assert {(e["name"], e["path"]) for e in roots["entries"]} == {
        ("報表中心", "nfs/reports"), ("IT 文件", "nfs/departments/it"),
    }
    assert roots["permissions"] == ["browse"] and roots["parent_path"] is None
    assert client.get("/api/v1/directories").json()["items"] == roots["entries"]
    listing = client.get("/api/v1/files?path=nfs/reports/2026").json()
    assert listing["breadcrumbs"] == [dict(name="報表中心", path="nfs/reports"), dict(name="2026", path="nfs/reports/2026")]
    assert listing["parent_path"] == "nfs/reports"
    assert client.get("/api/v1/files?path=nfs/reports").json()["parent_path"] == ""
    capabilities = client.get("/api/v1/files/capabilities?path=nfs/departments/it").json()
    assert capabilities["scope_name"] == "IT 文件" and capabilities["parent_path"] == ""
    for parent in ["nfs", "nfs/departments", "nfs/private"]:
        for endpoint in ["", "/tree", "/capabilities", "/download", "/content"]:
            assert client.get("/api/v1/files" + endpoint, params={"path": parent}).status_code == 403
    assert client.get("/api/v1/files/download?path=nfs/reports/2026/report.txt").status_code == 200
    (client.app.state.files.root / "nfs/reports/2027").mkdir()
    assert client.get("/api/v1/files?path=nfs/reports/2027").status_code == 200


def test_nested_copy_archive_and_share_permissions(client):
    from backend.tests.test_operations import finish, submit
    from backend.tests.test_shares import create, open_share
    nested_account(client)
    source, destination = "nfs/reports/2026/report.txt", "nfs/departments/it"
    assert finish(client, submit(client, paths=[source], destination=destination))["status"] == "completed"
    assert submit(client, paths=[destination + "/report.txt"], destination="nfs/reports").status_code == 403
    assert submit(client, "move", [source], destination).status_code == 403
    assert submit(client, paths=[source], destination="nfs").status_code == 403
    archive = finish(client, submit(client, "archive", [source]))
    assert client.get(f"/api/v1/files/operations/{archive['id']}/archive").status_code == 200
    share = create(client, path=source)
    assert client.get(open_share(client, share).json()["download_url"]).status_code == 200


def test_offline_entry_is_not_an_empty_folder_and_recovers(client):
    reports, _ = nested_account(client)
    root = client.app.state.files.root
    (root / "nfs/reports").rename(root / "nfs/offline")
    entry = next(e for e in client.get("/api/v1/files").json()["entries"] if e["directory_id"] == reports["id"])
    assert entry["name"] == "報表中心" and entry["status"] == "missing" and entry["modified"] is None
    assert client.get("/api/v1/files?path=nfs/reports").status_code == 404
    (root / "nfs/offline").rename(root / "nfs/reports")
    assert client.get("/api/v1/files?path=nfs/reports").status_code == 200


def test_rename_keeps_sessions_and_disable_changes_virtual_roots(client):
    from backend.app.core.security import COOKIE_NAME
    reports, _ = nested_account(client)
    cookie = client.cookies.get(COOKIE_NAME)
    sign_in(client)
    renamed = patch(client, reports, name="年度報表").json()
    client.cookies.clear()
    client.cookies.set(COOKIE_NAME, cookie, path="/api")
    assert client.get("/api/v1/files?path=nfs/reports").json()["scope_name"] == "年度報表"
    sign_in(client)
    assert patch(client, renamed, enabled=False).status_code == 200
    login(client)
    assert [e["name"] for e in client.get("/api/v1/files").json()["entries"]] == ["IT 文件"]
    assert client.get("/api/v1/files?path=nfs/reports").status_code == 403


def test_disable_stops_running_and_queued_jobs_and_old_archive(client, monkeypatch):
    import time
    from threading import Event

    from backend.app.models.operation import Operation
    from backend.tests.test_operations import finish, submit

    reports, _ = nested_account(client)
    source, destination = "nfs/reports/2026/report.txt", "nfs/departments/it"
    archive = finish(client, submit(client, "archive", [source]))
    assert archive["status"] == "completed"
    service = client.app.state.operations
    entered, release = Event(), Event()
    original = service.copy_tree

    def pause(*args):
        entered.set()
        assert release.wait(10)
        original(*args)

    monkeypatch.setattr(service, "copy_tree", pause)
    running = submit(client, paths=[source], destination=destination)
    assert running.status_code == 202
    try:
        assert entered.wait(5)
        queued = submit(client, paths=[source], destination=destination, conflict="keep_both")
        assert queued.status_code == 202
        sign_in(client)
        assert patch(client, reports, enabled=False).status_code == 200
    finally:
        release.set()
    deadline = time.monotonic() + 10
    ids = [running.json()["id"], queued.json()["id"]]
    while time.monotonic() < deadline:
        with service.factory() as db:
            states = [db.get(Operation, job_id).status for job_id in ids]
        if all(state not in {"queued", "running"} for state in states):
            assert states == ["partial", "partial"]
            break
        time.sleep(0.02)
    else:
        pytest.fail("Revoked jobs did not finish")
    assert not (client.app.state.files.root / destination / "report.txt").exists()
    login(client)
    assert client.get(f"/api/v1/files/operations/{archive['id']}/archive").status_code == 403


@pytest.mark.parametrize("kind", ["move", "trash"])
@pytest.mark.parametrize("registered_path", ["shared", "shared/nested"])
def test_registration_during_operation_protects_source(client, monkeypatch, kind, registered_path):
    from threading import Event

    from backend.tests.test_operations import finish, submit

    sign_in(client)
    root = client.app.state.files.root
    (root / "shared/nested").mkdir(parents=True)
    content = root / "shared/nested/document.txt"
    content.write_text("keep registered data", encoding="utf-8")
    service = client.app.state.operations
    entered, release = Event(), Event()
    original = service.snapshot

    def pause(*args):
        # Pause after the worker's initial protection check, before publication.
        if not entered.is_set():
            entered.set()
            assert release.wait(10)
        return original(*args)

    monkeypatch.setattr(service, "snapshot", pause)
    response = submit(client, kind, ["shared"], "empty")
    try:
        assert response.status_code == 202, response.text
        assert entered.wait(5)
        registered = register(client, registered_path, "New shared directory")
        assert registered.status_code == 201, registered.text
    finally:
        release.set()
    result = finish(client, response)
    assert result["status"] == "partial", result
    assert result["items"][0]["status"] == "error", result
    assert content.read_text(encoding="utf-8") == "keep registered data"
    assert not (root / "empty/shared").exists()
    row = next(item for item in client.get("/api/v1/admin/directories").json()["items"]
               if item["id"] == registered.json()["id"])
    assert row["status"] == "readable"


@pytest.mark.parametrize("kind", ["move", "trash"])
def test_registration_rechecks_after_source_is_moved(client, monkeypatch, kind):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Event

    from backend.tests.test_operations import finish, submit

    sign_in(client)
    root = client.app.state.files.root
    (root / "shared").mkdir()
    (root / "shared/document.txt").write_text("isolated data", encoding="utf-8")
    registry = client.app.state.directory_registry
    entered, release = Event(), Event()
    original = registry.check_available

    def pause(path):
        original(path)
        # Only pause the preliminary check; the commit-time check must run normally.
        if not entered.is_set():
            entered.set()
            assert release.wait(10)

    monkeypatch.setattr(registry, "check_available", pause)
    with ThreadPoolExecutor(max_workers=1) as executor:
        pending = executor.submit(register, client, "shared", "New shared directory")
        try:
            assert entered.wait(5)
            result = finish(client, submit(client, kind, ["shared"], "empty"))
            assert result["status"] == "completed", result
        finally:
            release.set()
        response = pending.result(timeout=5)
    assert response.status_code == 400, response.text
    assert response.json()["error"]["code"] == "DIRECTORY_UNAVAILABLE"
    assert client.get("/api/v1/admin/directories").json()["items"] == []
    assert not any(event["action"] == "directory.create"
                   for event in client.get("/api/v1/admin/audit").json())
    assert not (root / "shared").exists()
