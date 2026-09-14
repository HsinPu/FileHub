from uuid import uuid4

import pytest

from backend.tests.test_app import HEADERS, sign_in


def prepare(client, **values):
    return client.post(
        "/api/v1/files/upload-batch",
        headers=HEADERS,
        json={
            "request_id": str(uuid4()),
            "entries": [{"path": "相片/子目錄/a.txt", "size": 3}, {"path": "相片/空目錄"}],
            **values,
        },
    )


def test_prepare_nested_empty_folders_and_retry(client, configured):
    sign_in(client)
    key = str(uuid4())
    response = prepare(client, request_id=key)
    assert response.status_code == 200, response.text
    assert (configured.files_root / "相片/空目錄").is_dir()
    assert prepare(client, request_id=key).json() == response.json()
    assert (
        client.post(
            "/api/v1/files/upload",
            params={"path": "相片/子目錄", "name": "a.txt"},
            content=b"abc",
            headers=HEADERS,
        ).status_code
        == 201
    )
    assert (configured.files_root / "相片/子目錄/a.txt").read_bytes() == b"abc"
    assert all(entry["status"] == "skipped" for entry in prepare(client).json()["entries"])
    kept = prepare(client, conflict="keep_both")
    assert kept.json()["entries"][0]["target"] == "相片 (1)/子目錄/a.txt"
    assert (configured.files_root / "相片/子目錄/a.txt").read_bytes() == b"abc"


@pytest.mark.parametrize(
    "path", ["../a", "/a", "a//b", "a/CON", ".files-app-trash/a", "a/../../b", "a\\b", "a/" + "中" * 100]
)
def test_folder_manifest_rejects_unsafe_names(client, configured, path):
    sign_in(client)
    before = set(configured.files_root.iterdir())
    assert prepare(client, entries=[{"path": path, "size": 0}]).status_code == 400
    assert set(configured.files_root.iterdir()) == before


def test_folder_manifest_limits_collisions_and_auth(client):
    assert prepare(client).status_code == 401
    sign_in(client)
    assert prepare(client, entries=[{"path": "a", "size": 513 * 1024**2}]).status_code == 422
    assert prepare(client, entries=[{"path": "a", "size": 1}, {"path": "a", "size": 1}]).status_code == 409
    assert (
        prepare(client, entries=[{"path": f"a/{i}", "size": 512 * 1024**2} for i in range(11)]).status_code
        == 413
    )
    assert prepare(client, entries=[{"path": "a", "size": 1}, {"path": "a/b", "size": 1}]).status_code == 409
    assert (
        prepare(client, entries=[{"path": "A/b", "size": 1}, {"path": "a/c", "size": 1}]).status_code == 409
    )
