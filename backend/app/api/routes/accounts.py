from threading import RLock
from typing import Literal

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.api.dependencies import administrator, get_db
from backend.app.core.errors import AppError
from backend.app.core.security import password_hash
from backend.app.models.access import AccountAccess, AuditEvent, DirectoryGrant
from backend.app.models.user import LoginSession, User
from backend.app.services.directories import inspect_directory, inventory
from backend.app.services.transfers import MUTATION_LOCK

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(administrator)])
ACCOUNT_LOCK = RLock()


@router.get("/directories")
def directories(request: Request):
    return inventory(request.app.state.files, request.app.state.directories)


@router.get("/directory-status")
def directory_status(request: Request, path: str = Query("", max_length=4096)):
    # Resolve first so malformed/outside paths keep the established API errors.
    request.app.state.files.resolve(path)
    return inspect_directory(request.app.state.files, path)


class GrantUpdate(BaseModel):
    directory_id: str = Field(min_length=1, max_length=64)
    permissions: list[Literal["browse", "read", "upload", "modify", "delete", "share"]] = Field(default_factory=list)


class AccountUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=100)
    role: Literal["admin", "user"] = "user"
    enabled: bool = False
    root: str | None = Field(default=None, max_length=4096)
    permissions: list[Literal["browse", "read", "upload", "modify", "delete", "share"]] = Field(
        default_factory=list
    )
    scope_mode: Literal["single", "multiple"] = "single"
    directory_grants: list[GrantUpdate] = Field(default_factory=list, max_length=100)


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
        scope_mode=access.scope_mode,
        directory_grants=[dict(directory_id=grant.directory_id, directory_path=grant.directory_path, permissions=grant.permissions) for grant in access.directory_grants],
    )


def validate_scope(data, request, existing=None):
    if data.role == "user" and data.scope_mode == "multiple":
        catalog = request.app.state.files.directory_catalog
        previous = {grant.directory_id: grant for grant in existing.directory_grants} if existing else {}
        seen = set()
        for grant in data.directory_grants:
            if grant.directory_id in seen:
                raise AppError(400, "INVALID_DIRECTORY", "目錄不存在或重複，請重新選擇。")
            seen.add(grant.directory_id)
            old = previous.get(grant.directory_id)
            # Keeping an existing grant never rebinds its stored path. Permit
            # profile edits and deactivation even when that path is unavailable.
            unchanged = old is not None and set(old.permissions) == set(grant.permissions)
            if old is not None and (not data.enabled or (unchanged and existing.enabled)):
                continue
            if grant.directory_id not in catalog:
                raise AppError(400, "INVALID_DIRECTORY", "目錄不存在，請移除失效的授權。")
            if old is not None and old.directory_path != catalog[grant.directory_id]:
                raise AppError(400, "DIRECTORY_CHANGED", "目錄位置已變更；請先移除舊授權並儲存，再重新新增授權。")
            target = request.app.state.files.resolve(catalog[grant.directory_id])
            if data.enabled and not target.is_dir():
                raise AppError(400, "INVALID_DIRECTORY", "授權目錄目前無法使用，請先檢查部署狀態。")
            if "browse" not in grant.permissions or ("share" in grant.permissions and "read" not in grant.permissions):
                raise AppError(400, "INVALID_PERMISSIONS", "每個目錄需有瀏覽權限；分享還需要讀取內容權限。")
        if data.enabled and not data.directory_grants:
            raise AppError(400, "MISSING_SCOPE", "啟用帳號前請至少授權一個目錄。")
        return
    if data.role == "user" and data.root is not None:
        target = request.app.state.files.resolve(data.root)
        if not target.is_dir():
            raise AppError(400, "INVALID_ROOT", "請指定現有的資料夾。")
    if data.role == "user" and data.enabled and (data.root is None or "browse" not in data.permissions):
        raise AppError(400, "MISSING_SCOPE", "啟用帳號前請指定根目錄及瀏覽權限。")
    if "share" in data.permissions and "read" not in data.permissions:
        raise AppError(400, "INVALID_PERMISSIONS", "分享需要讀取內容權限。")


def set_grants(access, data, request):
    if data.role != "user" or data.scope_mode != "multiple":
        access.directory_grants = []
        return
    existing = {grant.directory_id: grant for grant in access.directory_grants}
    grants = []
    for item in data.directory_grants:
        grant = existing.get(item.directory_id)
        if grant is None:
            grant = DirectoryGrant(
                directory_id=item.directory_id,
                directory_path=request.app.state.files.directory_catalog[item.directory_id],
                permissions=sorted(set(item.permissions)),
            )
        elif set(grant.permissions) != set(item.permissions):
            grant.permissions = sorted(set(item.permissions))
        grants.append(grant)
    access.directory_grants = grants
    access.root, access.permissions = None, []


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
    with MUTATION_LOCK, ACCOUNT_LOCK:
        try:
            db.add(user)
            db.flush()
            access = AccountAccess(
                user_id=user.id,
                **data.model_dump(exclude={"username", "password", "full_name", "directory_grants"}),
                must_change_password=True,
            )
            set_grants(access, data, request)
            db.add(access)
            db.add(AuditEvent(actor_id=actor.id, target_id=user.id, action="account.create", details={"after": result(user, access)}))
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
    with MUTATION_LOCK, ACCOUNT_LOCK:
        db.expire_all()
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
        validate_scope(data, request, access)
        before = result(user, access)
        user.full_name = data.full_name
        for key, value in data.model_dump(exclude={"full_name", "directory_grants"}).items():
            setattr(access, key, value)
        set_grants(access, data, request)
        access.version += 1
        db.execute(delete(LoginSession).where(LoginSession.user_id == user_id))
        db.add(AuditEvent(actor_id=actor.id, target_id=user_id, action="account.update", details={"before": before, "after": result(user, access)}))
        db.commit()
        return result(user, access)


@router.post("/accounts/{user_id}/password")
def reset(
    user_id: int, data: ResetPassword, actor: User = Depends(administrator), db: Session = Depends(get_db)
):
    with MUTATION_LOCK, ACCOUNT_LOCK:
        db.expire_all()
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
            details=row.details,
        )
        for row in db.scalars(select(AuditEvent).order_by(AuditEvent.id.desc()).offset(offset).limit(100))
    ]
