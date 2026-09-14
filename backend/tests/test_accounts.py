from backend.tests.test_app import sign_in

HEADERS = {"X-Requested-With": "Files-App"}


def test_account_search_filters_before_pagination_and_escapes_wildcards(client):
    from backend.app.models.user import User
    from backend.app.models.access import AccountAccess

    sign_in(client)
    with client.app.state.session_factory() as db:
        for i in range(105):
            user = User(username=f"search-{i:03}", hashed_password="unused", full_name="測試 100%" if i == 104 else None)
            db.add(user)
            db.flush()
            db.add(AccountAccess(user_id=user.id, role="user", enabled=False, permissions=[]))
        db.commit()
    assert len(client.get("/api/v1/admin/accounts").json()) == 100
    assert [a["username"] for a in client.get("/api/v1/admin/accounts?q=search-104").json()] == ["search-104"]
    assert [a["username"] for a in client.get("/api/v1/admin/accounts", params={"q": "%"}).json()] == ["search-104"]
    assert client.get("/api/v1/admin/accounts?q=_").json() == []
    assert client.get("/api/v1/admin/accounts?q=search&offset=100").json()[0]["username"] == "search-100"


def test_account_lifecycle_and_last_admin(client):
    sign_in(client)
    admin = client.get("/api/v1/admin/accounts").json()[0]
    assert admin["role"] == "admin"
    assert (
        client.put(
            f"/api/v1/admin/accounts/{admin['id']}", json={"role": "user", "enabled": False}, headers=HEADERS
        ).status_code
        == 409
    )
    response = client.post(
        "/api/v1/admin/accounts",
        headers=HEADERS,
        json={
            "username": "reader",
            "password": "Reader-test-123",
            "enabled": True,
            "root": "empty",
            "permissions": ["browse", "read"],
        },
    )
    assert response.status_code == 201, response.text
    account = response.json()
    assert "password" not in account
    assert (
        client.post(
            "/api/v1/auth/login", headers=HEADERS, json={"username": "reader", "password": "Reader-test-123"}
        ).status_code
        == 200
    )
    assert client.get("/api/v1/files").status_code == 403
    assert (
        client.put(
            "/api/v1/auth/password",
            headers=HEADERS,
            json={"current_password": "Reader-test-123", "new_password": "Reader-updated-123"},
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/v1/auth/login",
            headers=HEADERS,
            json={"username": "reader", "password": "Reader-updated-123"},
        ).status_code
        == 200
    )
    assert client.get("/api/v1/admin/accounts").status_code == 403
    sign_in(client)
    assert (
        client.put(
            f"/api/v1/admin/accounts/{account['id']}",
            headers=HEADERS,
            json={"enabled": False, "role": "user", "root": "empty", "permissions": ["browse"]},
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/v1/auth/login",
            headers=HEADERS,
            json={"username": "reader", "password": "Reader-updated-123"},
        ).status_code
        == 403
    )


def test_missing_policy_does_not_grant_access(client):
    from backend.app.core.security import password_hash
    from backend.app.models.user import User

    with client.app.state.session_factory() as db:
        db.add(User(username="unconfigured", hashed_password=password_hash.hash("Test-password-123")))
        db.commit()
    response = client.post(
        "/api/v1/auth/login",
        headers=HEADERS,
        json={"username": "unconfigured", "password": "Test-password-123"},
    )
    assert response.status_code == 403

def test_account_filters_and_pagination(client):
    from backend.app.models.user import User
    from backend.app.models.access import AccountAccess

    sign_in(client)
    with client.app.state.session_factory() as db:
        for index in range(31):
            user = User(username=f"filter-{index}", hashed_password="unused")
            db.add(user)
            db.flush()
            db.add(AccountAccess(user_id=user.id, role="user", enabled=False, permissions=[]))
        db.commit()
    query = "/api/v1/admin/accounts?paged=true&role=user&enabled=false&q=filter-"
    first = client.get(query).json()
    second = client.get(query + "&offset=25").json()
    assert first["total"] == second["total"] == 31
    assert len(first["items"]) == 25
    assert len(second["items"]) == 6
    assert not ({item["id"] for item in first["items"]} & {item["id"] for item in second["items"]})
    assert client.get(query.replace("enabled=false", "enabled=true")).json() == {"items": [], "total": 0}
    assert isinstance(client.get("/api/v1/admin/accounts").json(), list)
