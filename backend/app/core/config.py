import os
import secrets
from dataclasses import dataclass
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[3]


def project_path(value: str) -> Path:
    path = Path(value)
    return (path if path.is_absolute() else PROJECT_ROOT / path).resolve()


@dataclass(frozen=True)
class Settings:
    files_root: Path
    database_path: Path
    secret_key: str
    frontend_dist: Path
    secure_cookie: bool = False
    session_hours: int = 24
    # Legacy catalog: imported once into the directory registry at initialization.
    directories_json: str = "[]"

    @classmethod
    def from_env(cls) -> "Settings":
        from dotenv import load_dotenv

        load_dotenv(PROJECT_ROOT / ".env")
        key = os.getenv("SECRET_KEY", "")
        if not key:
            key_path = PROJECT_ROOT / "config" / "session.key"
            key_path.parent.mkdir(parents=True, exist_ok=True)
            try:
                with key_path.open("x", encoding="utf-8") as stream:
                    stream.write(secrets.token_urlsafe(48))
                key_path.chmod(0o600)
            except FileExistsError:
                pass
            key = key_path.read_text(encoding="utf-8").strip()
        if len(key) < 32 or key == "your-secret-key-for-files-app-auth-12345678":
            raise ValueError("SECRET_KEY 必須是至少 32 字元的隨機值，不能使用舊版預設金鑰。")
        return cls(
            files_root=project_path(os.getenv("FILES_ROOT", "srv")),
            database_path=project_path(os.getenv("DATABASE_PATH", "database/users.db")),
            secret_key=key,
            frontend_dist=PROJECT_ROOT / "frontend/dist",
            secure_cookie=os.getenv("COOKIE_SECURE", "false").lower() == "true",
            directories_json=os.getenv("FILES_DIRECTORIES", "[]"),
        )
