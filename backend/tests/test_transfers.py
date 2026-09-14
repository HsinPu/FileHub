import asyncio
import errno
from types import SimpleNamespace

import pytest

from backend.app.core.errors import AppError
from backend.app.services.files import FileService
from backend.app.services.transfers import TEMP_PREFIX, upload_stream
from backend.tests.test_app import HEADERS, sign_in


def test_windows_share_compatibility_keeps_existing_destination(tmp_path, monkeypatch):
    from backend.app.services import transfers

    def unsupported(*args):
        return -1

    monkeypatch.setattr(transfers.sys, "platform", "linux")
    monkeypatch.setattr(transfers.ctypes, "CDLL", lambda *a, **k: SimpleNamespace(renameat2=unsupported))
    monkeypatch.setattr(transfers.ctypes, "get_errno", lambda: errno.EINVAL)
    source, target = tmp_path / "source", tmp_path / "target"
    source.mkdir()
    target.mkdir()
    with pytest.raises(FileExistsError):
        transfers.rename_no_replace(source, target)
    assert source.is_dir() and target.is_dir()
    transfers.rename_no_replace(source, tmp_path / "renamed")
    assert (tmp_path / "renamed").is_dir()


def test_upload_download_and_no_overwrite(client, configured):
    sign_in(client)
    name = "測試 O'Brien.bin"
    data = b"\x00\x01actual-file-bytes"
    result = client.post("/api/v1/files/upload", params={"name": name}, content=data, headers=HEADERS)
    assert result.status_code == 201
    assert result.json()["size"] == len(data)
    assert (
        client.post(
            "/api/v1/files/upload", params={"name": name}, content=b"replacement", headers=HEADERS
        ).status_code
        == 409
    )
    response = client.get("/api/v1/files/download", params={"path": name})
    assert response.content == data
    assert response.headers["content-disposition"].startswith("attachment;")
    assert "filename*=" in response.headers["content-disposition"]
    assert client.head("/api/v1/files/download", params={"path": name}).status_code == 200
    assert not list(configured.files_root.glob(f"{TEMP_PREFIX}*"))


def test_rename_file_directory_and_conflict(client, configured):
    sign_in(client)
    target = configured.files_root / "source.txt"
    target.write_text("original")
    result = client.patch(
        "/api/v1/files/rename", json={"path": "source.txt", "name": "新 O'Brien.txt"}, headers=HEADERS
    )
    assert result.status_code == 200
    assert not target.exists()
    assert (configured.files_root / "新 O'Brien.txt").read_text() == "original"
    assert (
        client.patch(
            "/api/v1/files/rename", json={"path": "新 O'Brien.txt", "name": "binary.exe"}, headers=HEADERS
        ).status_code
        == 409
    )
    assert (configured.files_root / "binary.exe").read_bytes() == b"not executable"
    assert (
        client.patch(
            "/api/v1/files/rename", json={"path": "empty", "name": "renamed-dir"}, headers=HEADERS
        ).status_code
        == 200
    )
    assert (configured.files_root / "renamed-dir").is_dir()
    assert (
        client.patch(
            "/api/v1/files/rename", json={"path": "renamed-dir", "name": "renamed-dir"}, headers=HEADERS
        ).status_code
        == 200
    )


@pytest.mark.parametrize("name", ["../bad", "/bad", "CON.txt", ".files-app-upload-user", "a\\b", "測" * 100])
def test_bad_upload_names(client, name):
    sign_in(client)
    assert (
        client.post("/api/v1/files/upload", params={"name": name}, content=b"x", headers=HEADERS).status_code
        == 400
    )


def test_upload_auth_and_size_limit(client, monkeypatch):
    assert (
        client.post(
            "/api/v1/files/upload", params={"name": "x.txt"}, content=b"x", headers=HEADERS
        ).status_code
        == 401
    )
    assert client.get("/api/v1/files/download", params={"path": "image.png"}).status_code == 401
    sign_in(client)
    monkeypatch.setattr("backend.app.services.transfers.MAX_UPLOAD_BYTES", 3)
    assert (
        client.post(
            "/api/v1/files/upload", params={"name": "x.txt"}, content=b"1234", headers=HEADERS
        ).status_code
        == 413
    )
    assert (
        client.post(
            "/api/v1/files/upload", params={"name": "zero.txt"}, content=b"", headers=HEADERS
        ).status_code
        == 201
    )


@pytest.mark.parametrize("failure", ["disconnect", "oversize", "length", "conflict"])
def test_failed_stream_removes_temporary_file(tmp_path, monkeypatch, failure):
    service = FileService(tmp_path)
    monkeypatch.setattr("backend.app.services.transfers.MAX_UPLOAD_BYTES", 3)

    async def chunks():
        yield b"12"
        assert not service.list_directory().entries
        if failure == "disconnect":
            raise ConnectionError("disconnected")
        if failure == "conflict":
            (tmp_path / "upload.txt").write_text("keep me")
        yield b"34" if failure == "oversize" else b""

    with pytest.raises((ConnectionError, AppError)):
        asyncio.run(upload_stream(service, "", "upload.txt", chunks(), 3 if failure == "length" else None))
    assert not list(tmp_path.glob(f"{TEMP_PREFIX}*"))
    if failure == "conflict":
        assert (tmp_path / "upload.txt").read_text() == "keep me"
    else:
        assert not (tmp_path / "upload.txt").exists()


def test_reserved_temporary_files_cannot_be_accessed_or_created(client, configured):
    sign_in(client)
    name = TEMP_PREFIX + "private"
    (configured.files_root / name).write_text("partial")
    assert client.get("/api/v1/files/download", params={"path": name}).status_code == 400
    assert client.post("/api/v1/files/directory", json={"name": name}, headers=HEADERS).status_code == 400
