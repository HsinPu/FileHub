from backend.tests.pdf_fixture import sample_pdf
from backend.tests.test_app import sign_in


def test_media_auth_validation_and_ranges(client, configured):
    root = configured.files_root
    (root / "valid.pdf").write_bytes(sample_pdf())
    (root / "invalid.pdf").write_bytes(b"not a pdf")
    assert client.get("/api/v1/files/pdf", params={"path": "valid.pdf"}).status_code == 401
    assert client.get("/api/v1/files/image", params={"path": "image.png"}).status_code == 401
    sign_in(client)
    response = client.get("/api/v1/files/pdf", params={"path": "valid.pdf"}, headers={"Range": "bytes=0-4"})
    assert response.status_code == 206
    assert response.content == b"%PDF-"
    assert client.get("/api/v1/files/pdf", params={"path": "invalid.pdf"}).status_code == 415
    assert client.get("/api/v1/files/pdf", params={"path": "../valid.pdf"}).status_code == 400
    image = client.get("/api/v1/files/image", params={"path": "image.png"})
    assert image.status_code == 200
    assert image.headers["content-type"] == "image/png"
    assert "sandbox" in image.headers["content-security-policy"]
    with (root / "large.pdf").open("wb") as stream:
        stream.truncate(50 * 1024 * 1024 + 1)
    assert client.get("/api/v1/files/pdf", params={"path": "large.pdf"}).status_code == 413
