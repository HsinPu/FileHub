import hashlib
import secrets
import time
from typing import Literal
from uuid import uuid4

import jwt
from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.api.dependencies import current_user, get_db
from backend.app.core.errors import AppError
from backend.app.core.security import password_hash, verify_password
from backend.app.models.access import AuditEvent
from backend.app.models.share import FileShare
from backend.app.models.user import User
from backend.app.services.access import global_path, local_path, policy, require
from backend.app.services.operations import identity

router = APIRouter(tags=["shares"])


class CreateShare(BaseModel):
    path: str = Field(min_length=1, max_length=4096)
    hours: Literal[1, 24, 168] = 24
    password: str | None = Field(default=None, min_length=8, max_length=128)


class OpenShare(BaseModel):
    token: str = Field(min_length=40, max_length=100)
    password: str | None = Field(default=None, max_length=128)


def valid_share(request, db, share):
    if not share or share.revoked or share.expires_at <= time.time():
        raise AppError(404, "SHARE_UNAVAILABLE", "分享不存在、已到期或已撤銷。")
    try:
        access = policy(db, share.owner_id)
        require(access, "read")
        require(access, "share")
        if access.version != share.access_version:
            raise ValueError()
        local_path(request.app.state.files, access, share.path)
        target = request.app.state.files.resolve(share.path)
        if not target.is_file() or identity(target) != share.identity:
            raise ValueError()
    except (AppError, OSError, ValueError):
        raise AppError(404, "SHARE_UNAVAILABLE", "分享已失效，請向分享者取得新連結。") from None
    return target


def record_result(share, path):
    return dict(
        id=share.id,
        owner_id=share.owner_id,
        path=path,
        protected=bool(share.password_hash),
        created_at=share.created_at,
        expires_at=share.expires_at,
        revoked=share.revoked,
    )


@router.post("/shares", status_code=201)
def create(
    data: CreateShare, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    access = request.state.access
    require(access, "share")
    require(access, "read")
    path = global_path(request.app.state.files, access, data.path)
    target = request.app.state.files.resolve(path)
    if not target.is_file():
        raise AppError(400, "FILE_REQUIRED", "第一版分享僅支援單一檔案。")
    token = secrets.token_urlsafe(32)
    share = FileShare(
        id=uuid4().hex,
        owner_id=user.id,
        token_hash=hashlib.sha256(token.encode()).hexdigest(),
        password_hash=password_hash.hash(data.password) if data.password else None,
        path=path,
        identity=identity(target),
        access_version=access.version,
        created_at=time.time(),
        expires_at=time.time() + data.hours * 3600,
        revoked=False,
    )
    db.add(share)
    db.add(AuditEvent(actor_id=user.id, action="share.create"))
    db.commit()
    return {**record_result(share, data.path), "token": token}


@router.get("/shares")
def listing(
    request: Request,
    offset: int = Query(0, ge=0),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    query = select(FileShare).order_by(FileShare.created_at.desc())
    if request.state.access.role != "admin":
        query = query.where(FileShare.owner_id == user.id)
    values = []
    for share in db.scalars(query.offset(offset).limit(100)):
        try:
            path = local_path(request.app.state.files, request.state.access, share.path)
        except AppError:
            path = "原存取範圍的檔案"
        values.append(record_result(share, path))
    return values


@router.post("/shares/{share_id}/revoke")
def revoke(
    share_id: str, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    share = db.get(FileShare, share_id)
    if not share or (share.owner_id != user.id and request.state.access.role != "admin"):
        raise AppError(404, "NOT_FOUND", "找不到分享。")
    share.revoked = True
    db.add(AuditEvent(actor_id=user.id, target_id=share.owner_id, action="share.revoke"))
    db.commit()
    return {"message": "分享已撤銷。"}


@router.post("/public-shares/open")
def open_share(data: OpenShare, request: Request, response: Response, db: Session = Depends(get_db)):
    request.app.state.share_limiter.check(request.client.host if request.client else "unknown")
    share = db.scalar(
        select(FileShare).where(FileShare.token_hash == hashlib.sha256(data.token.encode()).hexdigest())
    )
    target = valid_share(request, db, share)
    if share.password_hash:
        if data.password is None:
            return {"needs_password": True}
        if not verify_password(data.password, share.password_hash):
            raise AppError(401, "SHARE_PASSWORD", "分享密碼錯誤。")
    expiry = int(min(share.expires_at, time.time() + 300))
    grant = jwt.encode(
        {"sub": share.id, "exp": expiry, "aud": "share-download", "iat": int(time.time())},
        request.app.state.settings.secret_key,
        algorithm="HS256",
    )
    url = f"/api/v1/public-shares/download/{share.id}"
    response.set_cookie(
        "share_grant",
        grant,
        httponly=True,
        secure=request.app.state.settings.secure_cookie,
        samesite="strict",
        path=url,
        max_age=max(0, expiry - int(time.time())),
    )
    return {
        "needs_password": False,
        "name": target.name,
        "size": target.stat().st_size,
        "expires_at": share.expires_at,
        "download_url": url,
    }


@router.get("/public-shares/download/{share_id}")
@router.head("/public-shares/download/{share_id}")
def download(share_id: str, request: Request, db: Session = Depends(get_db)):
    try:
        grant = jwt.decode(
            request.cookies.get("share_grant", ""),
            request.app.state.settings.secret_key,
            algorithms=["HS256"],
            audience="share-download",
            options={"require": ["sub", "exp", "aud", "iat"]},
        )
        if grant["sub"] != share_id:
            raise ValueError()
    except (jwt.InvalidTokenError, ValueError):
        raise AppError(403, "SHARE_LOCKED", "請重新開啟分享連結並驗證密碼。") from None
    target = valid_share(request, db, db.get(FileShare, share_id))
    return FileResponse(target, filename=target.name, media_type="application/octet-stream")
