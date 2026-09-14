from threading import RLock
from typing import Literal

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import delete, select, or_, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.api.dependencies import administrator, get_db
from backend.app.core.errors import AppError
from backend.app.core.security import password_hash
from backend.app.models.access import AccountAccess, AuditEvent
from backend.app.models.user import LoginSession, User

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(administrator)])
ACCOUNT_LOCK = RLock()


class AccountUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=100)
    role: Literal["admin", "user"] = "user"
    enabled: bool = False
    root: str | None = Field(default=None, max_length=4096)
    permissions: list[Literal["browse", "read", "upload", "modify", "delete", "share"]] = Field(
        default_factory=list
    )


class AccountCreate(AccountUpdate):
    username: str = Field(min_length=1, max_length=100, pattern=r"^[\w.@-]+$")
    password: str = Field(min_length=8, max_length=128)


class ResetPassword(BaseModel):
    password: str = Field(min_length=8, max_length=128)


def result(user, access):
    return dict(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        role=access.role,
        enabled=access.enabled,
        root=access.root,
        permissions=access.permissions,
        must_change_password=access.must_change_password,
    )


def validate_scope(data, request):
    if data.role == "user" and data.root is not None:
        target = request.app.state.files.resolve(data.root)
        if not target.is_dir():
            raise AppError(400, "INVALID_ROOT", "請指定現有的資料夾。")
    if data.role == "user" and data.enabled and (data.root is None or "browse" not in data.permissions):
        raise AppError(400, "MISSING_SCOPE", "啟用帳號前請指定根目錄及瀏覽權限。")
    if "share" in data.permissions and "read" not in data.permissions:
        raise AppError(400, "INVALID_PERMISSIONS", "分享需要讀取內容權限。")


@router.get("/accounts")
def listing(
    offset: int = Query(0, ge=0), q: str = Query("", max_length=100),
    role: Literal["admin", "user"] | None = None,
    enabled: bool | None = None, paged: bool = False,
    db: Session = Depends(get_db),
):
    query = select(User, AccountAccess).join(AccountAccess)
    if q.strip():
        query = query.where(or_(User.username.contains(q.strip(), autoescape=True), User.full_name.contains(q.strip(), autoescape=True)))
    if role is not None:
        query = query.where(AccountAccess.role == role)
    if enabled is not None:
        query = query.where(AccountAccess.enabled.is_(enabled))
    total = db.scalar(select(func.count()).select_from(query.subquery())) if paged else None
    items = [
        result(user, access)
        for user, access in db.execute(
            query.order_by(User.id).offset(offset).limit(25 if paged else 100)
        )
    ]
    return {"items": items, "total": total} if paged else items


@router.post("/accounts", status_code=201)
def create(
    data: AccountCreate, request: Request, actor: User = Depends(administrator), db: Session = Depends(get_db)
):
    validate_scope(data, request)
    user = User(
        username=data.username, full_name=data.full_name, hashed_password=password_hash.hash(data.password)
    )
    with ACCOUNT_LOCK:
        try:
            db.add(user)
            db.flush()
            access = AccountAccess(
                user_id=user.id,
                **data.model_dump(exclude={"username", "password", "full_name"}),
                must_change_password=True,
            )
            db.add(access)
            db.add(AuditEvent(actor_id=actor.id, target_id=user.id, action="account.create"))
            db.commit()
        except IntegrityError:
            db.rollback()
            raise AppError(409, "USERNAME_EXISTS", "帳號名稱已存在。") from None
    return result(user, access)


@router.put("/accounts/{user_id}")
def update(
    user_id: int,
    data: AccountUpdate,
    request: Request,
    actor: User = Depends(administrator),
    db: Session = Depends(get_db),
):
    validate_scope(data, request)
    with ACCOUNT_LOCK:
        access, user = db.get(AccountAccess, user_id), db.get(User, user_id)
        if not access or not user:
            raise AppError(404, "NOT_FOUND", "找不到帳號。")
        if access.role == "admin" and access.enabled and (data.role != "admin" or not data.enabled):
            others = db.scalar(
                select(AccountAccess.user_id).where(
                    AccountAccess.role == "admin",
                    AccountAccess.enabled.is_(True),
                    AccountAccess.user_id != user_id,
                )
            )
            if others is None:
                raise AppError(409, "LAST_ADMIN", "不能停用或降級最後一位管理員。")
        user.full_name = data.full_name
        for key, value in data.model_dump(exclude={"full_name"}).items():
            setattr(access, key, value)
        access.version += 1
        db.execute(delete(LoginSession).where(LoginSession.user_id == user_id))
        db.add(AuditEvent(actor_id=actor.id, target_id=user_id, action="account.update"))
        db.commit()
        return result(user, access)


@router.post("/accounts/{user_id}/password")
def reset(
    user_id: int, data: ResetPassword, actor: User = Depends(administrator), db: Session = Depends(get_db)
):
    with ACCOUNT_LOCK:
        access, user = db.get(AccountAccess, user_id), db.get(User, user_id)
        if not access or not user:
            raise AppError(404, "NOT_FOUND", "找不到帳號。")
        user.hashed_password = password_hash.hash(data.password)
        access.must_change_password = True
        access.version += 1
        db.execute(delete(LoginSession).where(LoginSession.user_id == user_id))
        db.add(AuditEvent(actor_id=actor.id, target_id=user_id, action="account.password_reset"))
        db.commit()
    return {"message": "密碼已重設，下次登入須修改密碼。"}


@router.post("/accounts/{user_id}/revoke-sessions")
def revoke(user_id: int, actor: User = Depends(administrator), db: Session = Depends(get_db)):
    if not db.get(User, user_id):
        raise AppError(404, "NOT_FOUND", "找不到帳號。")
    db.execute(delete(LoginSession).where(LoginSession.user_id == user_id))
    db.add(AuditEvent(actor_id=actor.id, target_id=user_id, action="account.revoke_sessions"))
    db.commit()
    return {"message": "已撤銷登入連線。"}


@router.get("/audit")
def audit(offset: int = Query(0, ge=0), db: Session = Depends(get_db)):
    return [
        dict(
            id=row.id,
            actor_id=row.actor_id,
            target_id=row.target_id,
            action=row.action,
            created_at=row.created_at,
        )
        for row in db.scalars(select(AuditEvent).order_by(AuditEvent.id.desc()).offset(offset).limit(100))
    ]
