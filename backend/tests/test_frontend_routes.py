from fastapi.testclient import TestClient
from backend.app.main import create_app


def test_settings_and_workspace_deep_links_serve_spa_without_masking_unknown_routes(configured):
    configured.frontend_dist.mkdir()
    (configured.frontend_dist / "index.html").write_text("<html>settings-shell</html>", encoding="utf-8")
    with TestClient(create_app(configured)) as client:
        for path in ("/admin", "/settings/profile", "/settings/security", "/settings/accounts", "/files", "/shares", "/trash"):
            response = client.get(path)
            assert response.status_code == 200
            assert "settings-shell" in response.text
            assert response.headers["cache-control"] == "no-cache"
        for path in ("/settings/unknown", "/api/unknown", "/missing.txt"):
            assert client.get(path).status_code == 404
