import sqlite3

from backend.app.db.session import open_database


def test_legacy_accounts_migrate_once_and_hashes_preserved(tmp_path):
    path = tmp_path / "legacy.db"
    with sqlite3.connect(path) as db:
        db.execute(
            "CREATE TABLE users (id INTEGER PRIMARY KEY,username TEXT UNIQUE NOT NULL,hashed_password TEXT NOT NULL,full_name TEXT)"
        )
        db.execute("INSERT INTO users VALUES (42,'legacy','unchanged-hash','Legacy')")
    engine, _ = open_database(path)
    engine.dispose()
    with sqlite3.connect(path) as db:
        assert db.execute("SELECT hashed_password FROM users WHERE id=42").fetchone()[0] == "unchanged-hash"
        assert db.execute(
            "SELECT role,enabled,root,must_change_password FROM account_access WHERE user_id=42"
        ).fetchone() == ("admin", 1, "", 0)
        db.execute("UPDATE account_access SET role='user',enabled=0 WHERE user_id=42")
    engine, _ = open_database(path)
    engine.dispose()
    with sqlite3.connect(path) as db:
        assert db.execute("SELECT role,enabled FROM account_access WHERE user_id=42").fetchone() == (
            "user",
            0,
        )
        assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
