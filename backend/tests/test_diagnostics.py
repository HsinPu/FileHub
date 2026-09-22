import logging
import re

from sqlalchemy.exc import OperationalError


def test_ready_is_public_and_does_not_probe_files(client, monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError("readiness must not touch external storage")
    monkeypatch.setattr(client.app.state.files, "resolve", forbidden)
    response = client.get("/api/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers["cache-control"] == "no-store"
    assert re.fullmatch(r"[0-9a-f]{32}", response.headers["x-request-id"])


def test_ready_detects_dead_worker_but_health_stays_alive(client, monkeypatch):
    monkeypatch.setattr(client.app.state.operations.thread, "is_alive", lambda: False)
    response = client.get("/api/ready")
    assert response.status_code == 503
    assert response.json() == {"status": "unavailable"}
    assert client.get("/api/health").status_code == 200


def test_ready_database_failure_is_sanitized(client, monkeypatch, caplog):
    def failed():
        raise OperationalError("secret database path", {}, Exception("private details"))
    monkeypatch.setattr(client.app.state.engine, "connect", failed)
    with caplog.at_level(logging.INFO, logger="uvicorn.error"):
        response = client.get("/api/ready?token=secret-token", headers={"Cookie": "private-cookie"})
    assert response.status_code == 503
    assert response.json() == {"status": "unavailable"}
    assert client.get("/api/health").status_code == 200
    assert "error=OperationalError" in caplog.text
    assert "operation=ready" in caplog.text
    assert "duration_ms=" in caplog.text
    assert response.headers["x-request-id"] in caplog.text
    for secret in ["secret database path", "private details", "secret-token", "private-cookie"]:
        assert secret not in caplog.text
        assert secret not in response.text


def test_trace_id_is_generated_and_origin_rejection_is_logged(client, caplog):
    with caplog.at_level(logging.INFO, logger="uvicorn.error"):
        response = client.post("/api/v1/auth/login", headers={"X-Request-ID": "do-not-trust"},
                               json={"username": "private-user", "password": "private-password"})
    assert response.status_code == 403
    assert response.headers["x-request-id"] != "do-not-trust"
    assert "status=403" in caplog.text
    assert "private-password" not in caplog.text
    assert "private-user" not in caplog.text
