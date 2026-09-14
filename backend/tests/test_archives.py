import io
import time
import zipfile

from backend.app.models.operation import Operation
from backend.tests.test_app import sign_in
from backend.tests.test_operations import finish, submit


def test_archive_nested_files_empty_directory_and_expiry(client, configured):
    sign_in(client)
    job = finish(client, submit(client, "archive", ["中文 O'Brien", "empty", "binary.exe"], destination=""))
    assert job["status"] == "completed", job
    url = f"/api/v1/files/operations/{job['id']}/archive"
    response = client.get(url)
    assert response.status_code == 200
    assert "attachment" in response.headers["content-disposition"]
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        assert archive.read("binary.exe") == b"not executable"
        assert (
            archive.read("中文 O'Brien/hello.txt")
            == (configured.files_root / "中文 O'Brien/hello.txt").read_bytes()
        )
        assert "empty/" in archive.namelist()
        assert all(not name.startswith("/") and ".." not in name.split("/") for name in archive.namelist())
    assert client.head(url).status_code == 200
    service = client.app.state.operations
    with service.factory() as db:
        db.get(Operation, job["id"]).updated_at = time.time() - 3601
        db.commit()
    assert client.get(url).status_code == 410
    service.archives.cleanup(force=True)
    assert not service.archives.path(job["id"]).exists()
    assert (configured.files_root / "binary.exe").exists()


def test_archive_limit_and_cancel_remove_temporary(client, monkeypatch):
    from backend.app.services import archives
    from backend.app.services.operations import Cancelled

    sign_in(client)
    monkeypatch.setattr(archives, "MAX_INPUT", 1)
    job = finish(client, submit(client, "archive", ["binary.exe"], destination=""))
    assert job["status"] == "partial"
    assert client.get(f"/api/v1/files/operations/{job['id']}/archive").status_code == 409
    service = client.app.state.operations

    def cancel(*args):
        raise Cancelled

    monkeypatch.setattr(service, "snapshot", cancel)
    cancelled = finish(client, submit(client, "archive", ["binary.exe"], destination=""))
    assert cancelled["status"] == "cancelled"
    assert list(service.archives.root.iterdir()) == []
