"""Ephemeral local server for browser tests. Never touches the real account database."""

import os
import tempfile
from pathlib import Path

import uvicorn
from sqlalchemy import select

from backend.app.core.config import PROJECT_ROOT, Settings
from backend.app.core.security import password_hash
from backend.app.db.session import open_database
from backend.app.main import create_app
from backend.app.models.access import PERMISSIONS, AccountAccess, DirectoryGrant
from backend.app.models.user import User
from backend.tests.pdf_fixture import sample_pdf


def main():
    cache = PROJECT_ROOT / ".cache"
    cache.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="browser-test-", dir=cache) as temporary:
        work = Path(temporary)
        root = work / "files"
        root.mkdir()
        for name in ["專案文件", "中文 O'Brien", "空資料夾", "手機空目錄"]:
            (root / name).mkdir()
        (root / "專案文件" / "需求說明.md").write_text(
            "# 專案需求\n\nReact 與 FastAPI 改版。", encoding="utf-8"
        )
        (root / "中文 O'Brien" / "O'Brien.txt").write_text(
            "特殊檔名測試 <script>alert(1)</script>", encoding="utf-8"
        )
        (root / "開始使用.txt").write_text("歡迎使用 FileHub。\n這是隔離的瀏覽器測試資料。", encoding="utf-8")
        (root / "預覽圖片.svg").write_text(
            '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#236b60"/><text x="80" y="100" fill="white" font-size="28">FileHub preview</text></svg>',
            encoding="utf-8",
        )
        (root / "unsupported.zip").write_bytes(b"unsupported")
        (root / "兩頁文件.pdf").write_bytes(sample_pdf())
        (root / "第二張.svg").write_text(
            '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="blue"/></svg>',
            encoding="utf-8",
        )
        config = Settings(
            root, work / "db/users.db", "e2e-only-isolated-random-secret-" * 3, PROJECT_ROOT / "frontend/dist",
            directories_json='[{"id":"projects","name":"專案文件","path":"專案文件"},{"id":"workspace","name":"工作目錄","path":"空資料夾"},{"id":"offline","name":"離線資料","path":"未掛載"}]',
        )
        engine, factory = open_database(config.database_path)
        with factory() as db:
            for username in ("admin", "password-test", "settings-reader", "multi-reader", "nested-reader"):
                db.add(
                    User(
                        username=username,
                        hashed_password=password_hash.hash("Browser-test-123"),
                        full_name="測試管理員",
                    )
                )
            db.flush()
            for user in db.scalars(select(User)):
                db.add(
                    AccountAccess(
                        user_id=user.id,
                        role="user" if user.username in {"settings-reader", "multi-reader", "nested-reader"} else "admin",
                        scope_mode="multiple" if user.username == "multi-reader" else "single",
                        directory_grants=[DirectoryGrant(directory_id="projects", directory_path="專案文件", permissions=["browse", "read"]), DirectoryGrant(directory_id="workspace", directory_path="空資料夾", permissions=["browse", "read", "upload", "modify", "delete"])] if user.username == "multi-reader" else [],
                        enabled=True,
                        root="",
                        permissions=PERMISSIONS,
                        must_change_password=False,
                    )
                )
            db.commit()
        engine.dispose()
        uvicorn.run(
            create_app(config),
            host="127.0.0.1",
            port=int(os.getenv("E2E_PORT", "18005")),
            log_level="warning",
        )


if __name__ == "__main__":
    main()
