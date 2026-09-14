import time
from threading import Event
from uuid import uuid4

from backend.app.models.access import AccountAccess
from backend.app.models.operation import Operation
from backend.tests.test_access import HEADERS, login, seed


def test_permission_change_during_copy_never_publishes(client, configured, monkeypatch):
    user_id = seed(client, root="", permissions=["browse", "read", "upload"])
    login(client)
    service = client.app.state.operations
    entered, release = Event(), Event()
    original = service.copy_tree

    def pause(*args):
        entered.set()
        assert release.wait(5)
        original(*args)

    monkeypatch.setattr(service, "copy_tree", pause)
    response = client.post(
        "/api/v1/files/operations",
        headers=HEADERS,
        json={"kind": "copy", "paths": ["binary.exe"], "destination": "empty", "request_id": str(uuid4())},
    )
    assert response.status_code == 202, response.text
    try:
        assert entered.wait(5)
        with service.factory() as db:
            access = db.get(AccountAccess, user_id)
            access.permissions = ["browse"]
            access.version += 1
            db.commit()
    finally:
        release.set()
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        with service.factory() as db:
            job = db.get(Operation, response.json()["id"])
            if job.status not in {"queued", "running"}:
                assert job.status == "partial"
                break
        time.sleep(0.05)
    else:
        raise AssertionError("job did not stop")
    assert list((configured.files_root / "empty").iterdir()) == []
    assert (configured.files_root / "binary.exe").read_bytes() == b"not executable"
