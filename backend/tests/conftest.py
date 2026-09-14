import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from backend.app.core.config import Settings
from backend.app.core.security import password_hash
from backend.app.main import create_app
from backend.app.models.access import PERMISSIONS, AccountAccess
from backend.app.models.user import User

PASSWORD = "Test-password-123"


@pytest.fixture
def configured(tmp_path):
    root = tmp_path / "files"
    root.mkdir()
    (root / "中文 O'Brien").mkdir()
    (root / "中文 O'Brien" / "hello.txt").write_text("你好 <script>alert(1)</script>", encoding="utf-8")
    (root / "empty").mkdir()
    (root / "binary.exe").write_bytes(b"not executable")
    (root / "image.png").write_bytes(b"\x89PNG\r\n\x1a\n")
    return Settings(root, tmp_path / "db/users.db", "test-secret-" * 8, tmp_path / "dist")


@pytest.fixture
def client(configured):
    with TestClient(create_app(configured)) as api:
        with api.app.state.session_factory() as db:
            db.add(User(username="admin", hashed_password=password_hash.hash(PASSWORD), full_name="管理員"))
            db.flush()
            user = db.scalar(select(User).where(User.username == "admin"))
            db.add(
                AccountAccess(
                    user_id=user.id,
                    role="admin",
                    enabled=True,
                    root="",
                    permissions=PERMISSIONS,
                    must_change_password=False,
                )
            )
            db.commit()
        yield api
