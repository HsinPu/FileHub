import errno
import time
from threading import Event
from uuid import uuid4

import pytest

from backend.tests.test_app import HEADERS, sign_in


def submit(client, kind="copy", paths=None, destination="empty", **extra):
    return client.post(
        "/api/v1/files/operations",
        headers=HEADERS,
        json={
            "request_id": str(uuid4()),
            "kind": kind,
            "paths": paths or ["中文 O'Brien"],
            "destination": destination,
            **extra,
        },
    )


def finish(client, response):
    assert response.status_code == 202, response.text
    job_id = response.json()["id"]
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        job = client.get(f"/api/v1/files/operations/{job_id}").json()
        if job["status"] not in {"queued", "running"}:
            return job
        time.sleep(0.02)
    pytest.fail("Task did not finish")


def test_copy_move_nested_and_conflicts(client, configured):
    sign_in(client)
    root = configured.files_root
    job = finish(client, submit(client, paths=["中文 O'Brien", "中文 O'Brien/hello.txt"]))
    assert job["status"] == "completed", job
    assert len(job["items"]) == 1
    assert (root / "empty/中文 O'Brien/hello.txt").read_bytes() == (
        root / "中文 O'Brien/hello.txt"
    ).read_bytes()
    assert finish(client, submit(client))["items"][0]["status"] == "skipped"
    kept = finish(client, submit(client, conflict="keep_both"))
    assert kept["items"][0]["target"] == "empty/中文 O'Brien (1)"
    moved = finish(client, submit(client, "move", ["binary.exe"]))
    assert moved["status"] == "completed", moved
    assert not (root / "binary.exe").exists()
    assert (root / "empty/binary.exe").read_bytes() == b"not executable"


@pytest.mark.parametrize(
    "paths,destination", [([""], "empty"), (["../"], "empty"), (["中文 O'Brien"], "中文 O'Brien")]
)
def test_invalid_batch_destinations(client, paths, destination):
    sign_in(client)
    assert submit(client, paths=paths, destination=destination).status_code == 400


def test_idempotency_and_partial_failure(client):
    sign_in(client)
    request_id = str(uuid4())
    first = submit(client, paths=["missing.txt", "binary.exe"], request_id=request_id)
    second = submit(client, paths=["missing.txt", "binary.exe"], request_id=request_id)
    assert first.json()["id"] == second.json()["id"]
    assert submit(client, paths=["image.png"], request_id=request_id).status_code == 409
    result = finish(client, first)
    assert result["status"] == "partial"
    assert [i["status"] for i in result["items"]] == ["error", "done"]


def test_operations_require_auth_and_origin(client):
    assert submit(client).status_code == 401
    sign_in(client)
    assert client.post("/api/v1/files/operations", json={}).status_code == 403


def test_cancel_cleans_partial_copy(client, configured, monkeypatch):
    from backend.app.services.operations import Cancelled

    sign_in(client)
    service = client.app.state.operations

    def interrupted(source, temporary, snapshot, job_id):
        temporary.mkdir()
        (temporary / "partial").write_bytes(b"partial")
        raise Cancelled

    monkeypatch.setattr(service, "copy_tree", interrupted)
    result = finish(client, submit(client))
    assert result["status"] == "cancelled"
    assert list((configured.files_root / "empty").iterdir()) == []


@pytest.mark.parametrize("code", [errno.ENOSPC, errno.EACCES])
def test_failed_copy_keeps_source_and_cleans_temp(client, configured, monkeypatch, code):
    sign_in(client)

    def failed(source, temporary, snapshot, job_id):
        temporary.mkdir()
        (temporary / "partial").write_bytes(b"partial")
        raise OSError(code, "simulated")

    monkeypatch.setattr(client.app.state.operations, "copy_tree", failed)
    job = finish(client, submit(client))
    assert job["status"] == "partial"
    assert list((configured.files_root / "empty").iterdir()) == []
    assert (configured.files_root / "中文 O'Brien/hello.txt").exists()


def test_source_changed_during_copy_is_not_published(client, configured, monkeypatch):
    sign_in(client)
    service = client.app.state.operations
    original = service.copy_tree

    def changed(source, temporary, snapshot, job_id):
        original(source, temporary, snapshot, job_id)
        (source / "hello.txt").write_text("changed", encoding="utf-8")

    monkeypatch.setattr(service, "copy_tree", changed)
    job = finish(client, submit(client))
    assert job["status"] == "partial"
    assert "變更" in job["items"][0]["message"]
    assert list((configured.files_root / "empty").iterdir()) == []


def test_real_cancel_api_stops_inflight_copy(client, configured, monkeypatch):
    sign_in(client)
    service = client.app.state.operations
    entered, release = Event(), Event()
    original = service.copy_tree

    def paused(*args):
        entered.set()
        assert release.wait(5)
        original(*args)

    monkeypatch.setattr(service, "copy_tree", paused)
    response = submit(client)
    try:
        assert entered.wait(5)
        cancelled = client.post(f"/api/v1/files/operations/{response.json()['id']}/cancel", headers=HEADERS)
        assert cancelled.status_code == 200 and cancelled.json()["cancel_requested"]
    finally:
        release.set()
    assert finish(client, response)["status"] == "cancelled"
    assert list((configured.files_root / "empty").iterdir()) == []


def test_restart_never_replays_queued_mutations(client, configured):
    sign_in(client)
    service = client.app.state.operations
    service.close()
    response = submit(client, kind="move", paths=["binary.exe"])
    assert response.status_code == 202
    service.recover()
    job = client.get(f"/api/v1/files/operations/{response.json()['id']}").json()
    assert job["status"] == "needs_review"
    assert (configured.files_root / "binary.exe").exists()
    assert not (configured.files_root / "empty/binary.exe").exists()


def test_owner_only_task_history_but_admin_trash_is_shared(client):
    from backend.app.core.security import password_hash
    from backend.app.models.user import User

    sign_in(client)
    job = finish(client, submit(client, kind="trash", paths=["binary.exe"]))
    with client.app.state.session_factory() as db:
        from backend.app.models.access import PERMISSIONS, AccountAccess

        other = User(username="other", hashed_password=password_hash.hash("Other-password-123"))
        db.add(other)
        db.flush()
        db.add(
            AccountAccess(
                user_id=other.id,
                role="admin",
                enabled=True,
                root="",
                permissions=PERMISSIONS,
                must_change_password=False,
            )
        )
        db.commit()
    client.cookies.clear()
    assert (
        client.post(
            "/api/v1/auth/login",
            headers=HEADERS,
            json={"username": "other", "password": "Other-password-123"},
        ).status_code
        == 200
    )
    assert client.get("/api/v1/files/operations").json() == []
    assert client.get(f"/api/v1/files/operations/{job['id']}").status_code == 404
    assert client.post(f"/api/v1/files/operations/{job['id']}/cancel", headers=HEADERS).status_code == 404
    assert client.get("/api/v1/trash").json()[0]["deleted_by"] == "admin"
