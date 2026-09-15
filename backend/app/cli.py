"""Local account bootstrap; never emits a password or changes existing users."""

import argparse
import getpass

from sqlalchemy import func, select

from backend.app.core.config import Settings
from backend.app.core.security import password_hash
from backend.app.db.session import open_database
from backend.app.models.access import PERMISSIONS, AccountAccess
from backend.app.models.user import User


def main():
    parser = argparse.ArgumentParser(description="Create the first FileHub account locally.")
    parser.add_argument("command", choices=["bootstrap"])
    parser.parse_args()
    config = Settings.from_env()
    engine, factory = open_database(config.database_path)
    try:
        with factory() as db:
            if db.scalar(select(func.count()).select_from(User)):
                print("Account database is ready. Existing accounts were preserved.")
                return
            print("Create the first account (registration is disabled).")
            username = input("Username [admin]: ").strip() or "admin"
            if len(username) > 100:
                raise SystemExit("Username must be at most 100 characters.")
            password = getpass.getpass("Password (8-128 characters): ")
            confirmation = getpass.getpass("Confirm password: ")
            if password != confirmation or not 8 <= len(password) <= 128:
                raise SystemExit("Passwords must match and contain 8-128 characters.")
            user = User(username=username, hashed_password=password_hash.hash(password), full_name=username)
            db.add(user)
            db.flush()
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
            print("Account created. You can now sign in.")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
