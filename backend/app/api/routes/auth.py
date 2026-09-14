import secrets
import time

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from backend.app.api.dependencies import current_user, get_db
from backend.app.core.errors import AppError
from backend.app.core.security import COOKIE_NAME, DUMMY_HASH, encode_session, password_hash, verify_password
from backend.app.models.user import LoginSession, User
from backend.app.schemas.auth import LoginRequest, Message, PasswordUpdate, UserInfo
from backend.app.services.access import policy, user_info

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=UserInfo)
def login(data: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    request.app.state.login_limiter.check(request.client.host if request.client else "unknown")
    user = db.scalar(select(User).where(User.username == data.username))
    valid = verify_password(data.password, user.hashed_password if user else DUMMY_HASH)
    if not valid or not user:
        raise AppError(401, "INVALID_CREDENTIALS", "帳號或密碼錯誤。")
    access = policy(db, user.id)
    settings = request.app.state.settings
    expiry = int(time.time()) + settings.session_hours * 3600
    session_id = secrets.token_urlsafe(32)
    db.execute(delete(LoginSession).where(LoginSession.expires_at <= int(time.time())))
    db.add(LoginSession(id=session_id, user_id=user.id, expires_at=expiry))
    db.commit()
    response.set_cookie(
        COOKIE_NAME,
        encode_session(user.id, session_id, expiry, settings.secret_key),
        httponly=True,
        secure=settings.secure_cookie,
        samesite="strict",
        max_age=settings.session_hours * 3600,
        path="/api",
    )
    return user_info(user, access)


@router.get("/me", response_model=UserInfo)
def me(request: Request, user: User = Depends(current_user)):
    return user_info(user, request.state.access)


@router.post("/logout", response_model=Message)
def logout(
    request: Request, response: Response, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    db.execute(delete(LoginSession).where(LoginSession.id == request.state.session_id))
    db.commit()
    response.delete_cookie(
        COOKIE_NAME,
        path="/api",
        secure=request.app.state.settings.secure_cookie,
        httponly=True,
        samesite="strict",
    )
    return Message(message="已登出。")


@router.put("/password", response_model=Message)
def update_password(
    data: PasswordUpdate,
    request: Request,
    response: Response,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(data.current_password, user.hashed_password):
        raise AppError(400, "WRONG_PASSWORD", "目前密碼不正確。")
    if data.current_password == data.new_password:
        raise AppError(400, "PASSWORD_UNCHANGED", "新密碼不可與目前密碼相同。")
    user.hashed_password = password_hash.hash(data.new_password)
    policy(db, user.id).must_change_password = False
    db.execute(delete(LoginSession).where(LoginSession.user_id == user.id))
    db.commit()
    response.delete_cookie(
        COOKIE_NAME,
        path="/api",
        secure=request.app.state.settings.secure_cookie,
        httponly=True,
        samesite="strict",
    )
    return Message(message="密碼已更新，請重新登入。")
