import secrets
import time
from collections import defaultdict, deque
from threading import Lock

import jwt
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher
from pwdlib.hashers.bcrypt import BcryptHasher

from backend.app.core.errors import AppError

password_hash = PasswordHash((Argon2Hasher(), BcryptHasher()))
DUMMY_HASH = password_hash.hash(secrets.token_urlsafe(24))
COOKIE_NAME = "files_session"


def verify_password(password: str, hashed: str) -> bool:
    try:
        return password_hash.verify(password, hashed)
    except (ValueError, TypeError):
        return False


def encode_session(user_id: int, session_id: str, expires_at: int, secret: str) -> str:
    return jwt.encode(
        {
            "sub": str(user_id),
            "jti": session_id,
            "exp": expires_at,
            "iat": int(time.time()),
            "iss": "files-app",
        },
        secret,
        algorithm="HS256",
    )


class LoginLimiter:
    """Bounded, process-local throttling. Deploy one worker or add a shared limiter."""

    def __init__(self):
        self.attempts: dict[str, deque] = defaultdict(deque)
        self.lock = Lock()

    def check(self, address: str):
        now = time.monotonic()
        with self.lock:
            for key in list(self.attempts):
                if not self.attempts[key] or self.attempts[key][-1] < now - 300:
                    del self.attempts[key]
            if address not in self.attempts and len(self.attempts) >= 4096:
                raise AppError(429, "LOGIN_THROTTLED", "登入請求過多，請稍後再試。")
            attempts = self.attempts[address]
            while attempts and attempts[0] < now - 300:
                attempts.popleft()
            if len(attempts) >= 10:
                raise AppError(429, "LOGIN_THROTTLED", "登入嘗試過多，請於五分鐘後再試。")
            attempts.append(now)
