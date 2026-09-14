from backend.app.core.errors import AppError
from backend.app.models.access import PERMISSIONS, AccountAccess
from backend.app.models.operation import TrashItem
from backend.app.models.user import User
from backend.app.schemas.auth import UserInfo
from backend.app.services.files import FileService


def policy(db, user_id):
    access = db.get(AccountAccess, user_id)
    if not access or not access.enabled:
        raise AppError(403, "ACCOUNT_DISABLED", "帳號尚未啟用或已停用，請聯絡管理員。")
    return access


def user_info(user, access):
    return UserInfo(
        username=user.username,
        full_name=user.full_name,
        role=access.role,
        permissions=PERMISSIONS if access.role == "admin" else access.permissions,
        must_change_password=access.must_change_password,
    )


def require(access, permission):
    if access.must_change_password:
        raise AppError(403, "PASSWORD_CHANGE_REQUIRED", "請先修改初始密碼。")
    if access.role != "admin" and (access.root is None or permission not in access.permissions):
        raise AppError(403, "FORBIDDEN", "沒有執行此操作的權限。")


def scope_root(files, access):
    if access.role == "admin":
        return files.root
    if access.root is None:
        raise AppError(403, "MISSING_SCOPE", "尚未指定存取目錄。")
    return files.resolve(access.root)


def global_path(files, access, local):
    root = scope_root(files, access)
    # Validate the user supplied path before prefixing it.
    virtual = FileService.__new__(FileService)
    virtual.root = root
    target = virtual.resolve(local)
    files.resolve(target.relative_to(files.root).as_posix())
    return target.relative_to(files.root).as_posix() if target != files.root else ""


def local_path(files, access, path):
    target = files.resolve(path)
    root = scope_root(files, access)
    if not target.is_relative_to(root):
        raise AppError(404, "NOT_FOUND", "找不到此項目。")
    return target.relative_to(root).as_posix() if target != root else ""


class ScopedFiles(FileService):
    def __init__(self, files, factory, user_id, permission):
        self.base, self.factory, self.user_id, self.permission = files, factory, user_id, permission
        with factory() as db:
            access = policy(db, user_id)
            require(access, permission)
            self.version = access.version
            self.root = scope_root(files, access)
        if not self.root.is_dir():
            raise AppError(404, "ROOT_MISSING", "指定目錄已不存在，請聯絡管理員。")

    def resolve(self, path):
        with self.factory() as db:
            access = policy(db, self.user_id)
            require(access, self.permission)
            if access.version != self.version or scope_root(self.base, access) != self.root:
                raise AppError(403, "ACCESS_CHANGED", "權限已變更，請重新登入。")
        target = super().resolve(path)
        self.base.resolve(target.relative_to(self.base.root).as_posix())
        return target


def scoped(request, permission):
    return ScopedFiles(
        request.app.state.files, request.app.state.session_factory, request.state.access.user_id, permission
    )


def authorize_job(files, db, job, execution=True):
    access = policy(db, job.user_id)
    root = scope_root(files, access)
    context = job.items[0].get("access_context") if job.items else None
    current = [access.version, str(root)]
    if context != current and (context is not None or access.role != "admin"):
        raise AppError(403, "ACCESS_CHANGED", "此任務建立後權限已變更，請重新選取項目。")
    if execution:
        for permission in {
            "copy": ["read", "upload"],
            "move": ["modify"],
            "trash": ["delete"],
            "restore": ["upload"],
            "archive": ["read"],
        }[job.kind]:
            require(access, permission)
    if job.kind in {"copy", "move"} or (job.kind == "restore" and job.destination is not None):
        local_path(files, access, job.destination or "")
    for item in job.items:
        if job.kind == "restore":
            record = db.get(TrashItem, item["source"])
            if not record:
                continue
            user = db.get(User, job.user_id)
            if access.role != "admin" and record.deleted_by != user.username:
                raise AppError(404, "NOT_FOUND", "找不到垃圾桶項目。")
            local_path(files, access, record.original_path)
        else:
            local_path(files, access, item["source"])
    return access


def job_result(files, access, result):
    import copy

    value = copy.deepcopy(result)
    if value["destination"] is not None and value["kind"] in {"copy", "move", "restore"}:
        value["destination"] = local_path(files, access, value["destination"])
    elif value["kind"] in {"archive", "trash"}:
        value["destination"] = ""
    for item in value["items"]:
        item.pop("access_context", None)
        if value["kind"] != "restore":
            item["source"] = local_path(files, access, item["source"])
        elif item.get("display_name") and item["display_name"] != "項目已不存在":
            item["display_name"] = local_path(files, access, item["display_name"])
        if item.get("target"):
            item["target"] = local_path(files, access, item["target"])
        item.pop("temporary", None)
    return value


def submit_job(request, user_id, data):
    access, files = request.state.access, request.app.state.files
    changes = {}
    if data.kind != "restore":
        changes["paths"] = [global_path(files, access, path) for path in data.paths]
        for path in changes["paths"]:
            if files.resolve(path) == scope_root(files, access):
                raise AppError(400, "ROOT_OPERATION", "不能操作自己的根目錄。")
    if data.kind in {"copy", "move"} or (data.kind == "restore" and data.destination is not None):
        changes["destination"] = global_path(files, access, data.destination or "")
    else:
        changes["destination"] = None if data.kind == "restore" else ""
    result = request.app.state.operations.submit(user_id, data.model_copy(update=changes))
    return job_result(files, access, result)
