from uuid import uuid4

from backend.app.models.operation import TrashItem
from backend.app.services.transfers import TRASH_PREFIX
from backend.tests.test_app import HEADERS, sign_in
from backend.tests.test_operations import finish, submit


def restore(client, ids, destination=None, conflict="skip"):
    return client.post(
        "/api/v1/trash/restore",
        headers=HEADERS,
        json={
            "ids": ids,
            "destination": destination,
            "conflict": conflict,
            "request_id": str(uuid4()),
        },
    )


def test_trash_restore_nested_and_reserved_namespace(client, configured):
    sign_in(client)
    job = finish(client, submit(client, "trash", ["中文 O'Brien"]))
    assert job["status"] == "completed", job
    records = client.get("/api/v1/trash").json()
    assert len(records) == 1 and records[0]["status"] == "available"
    assert records[0]["deleted_by"] == "admin"
    assert not (configured.files_root / "中文 O'Brien").exists()
    assert TRASH_PREFIX not in [i["name"] for i in client.get("/api/v1/files").json()["entries"]]
    assert client.get("/api/v1/files", params={"path": TRASH_PREFIX}).status_code == 400
    assert (
        client.get(
            "/api/v1/files/download", params={"path": f"{TRASH_PREFIX}/{records[0]['id']}"}
        ).status_code
        == 400
    )
    assert finish(client, restore(client, [records[0]["id"]]))["status"] == "completed"
    assert (configured.files_root / "中文 O'Brien/hello.txt").exists()
    assert client.get("/api/v1/trash").json() == []
    assert finish(client, restore(client, [records[0]["id"]]))["status"] == "partial"


def test_restore_conflict_keeps_original_and_trash(client, configured):
    sign_in(client)
    finish(client, submit(client, "trash", ["binary.exe"]))
    item_id = client.get("/api/v1/trash").json()[0]["id"]
    (configured.files_root / "binary.exe").write_bytes(b"new original")
    assert finish(client, restore(client, [item_id]))["items"][0]["status"] == "skipped"
    assert client.get("/api/v1/trash").json()[0]["status"] == "available"
    assert finish(client, restore(client, [item_id], conflict="keep_both"))["status"] == "completed"
    assert (configured.files_root / "binary.exe").read_bytes() == b"new original"
    assert (configured.files_root / "binary (1).exe").read_bytes() == b"not executable"


def test_restore_missing_parent_requires_new_destination(client, configured):
    sign_in(client)
    finish(client, submit(client, "trash", ["中文 O'Brien/hello.txt"]))
    item_id = client.get("/api/v1/trash").json()[0]["id"]
    (configured.files_root / "中文 O'Brien").rmdir()
    assert finish(client, restore(client, [item_id]))["status"] == "partial"
    assert finish(client, restore(client, [item_id], "empty"))["status"] == "completed"
    assert (configured.files_root / "empty/hello.txt").exists()


def test_recovery_reconciles_staged_trash_without_replaying(client, configured):
    sign_in(client)
    finish(client, submit(client, "trash", ["binary.exe"]))
    record_id = client.get("/api/v1/trash").json()[0]["id"]
    service = client.app.state.operations
    with service.factory() as db:
        db.get(TrashItem, record_id).status = "staging"
        db.commit()
    service.trash.recover()
    assert client.get("/api/v1/trash").json()[0]["status"] == "available"
    assert not (configured.files_root / "binary.exe").exists()


def test_trash_requires_login_and_rejects_arbitrary_ids(client):
    assert client.get("/api/v1/trash").status_code == 401
    sign_in(client)
    assert restore(client, ["../binary.exe"]).status_code == 422
