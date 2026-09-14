import time

import jwt
from fastapi import Depends, Request
from sqlalchemy.orm import Session

from backend.app.core.errors import AppError
from backend.app.core.security import COOKIE_NAME
from backend.app.models.user import LoginSession, User
from backend.app.services.access import policy


def get_db(request: Request):
    with request.app.state.session_factory() as db:
        yield db


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(COOKIE_NAME)
    try:
        payload = jwt.decode(
            token or "",
            request.app.state.settings.secret_key,
            algorithms=["HS256"],
            issuer="files-app",
            options={"require": ["sub", "jti", "exp", "iat"]},
        )
        session = db.get(LoginSession, payload["jti"])
        if not session or session.expires_at <= int(time.time()) or str(session.user_id) != payload["sub"]:
            raise ValueError("revoked")
        user = db.get(User, session.user_id)
        if not user:
            raise ValueError("missing user")
    except (jwt.InvalidTokenError, ValueError, TypeError):
        raise AppError(401, "UNAUTHENTICATED", "請先登入，或重新登入以繼續操作。") from None
    request.state.session_id = session.id
    request.state.access = policy(db, user.id)
    if request.state.access.must_change_password and request.url.path not in {
        "/api/v1/auth/me",
        "/api/v1/auth/password",
        "/api/v1/auth/logout",
    }:
        raise AppError(403, "PASSWORD_CHANGE_REQUIRED", "請先修改初始密碼。")
    return user


def administrator(request: Request, user: User = Depends(current_user)):
    if request.state.access.role != "admin":
        raise AppError(403, "ADMIN_REQUIRED", "此操作僅供管理員使用。")
    return user
