from backend.app.core.errors import AppError
from backend.app.models.access import PERMISSIONS, AccountAccess
from backend.app.models.operation import TrashItem
from backend.app.models.user import User
from backend.app.schemas.auth import UserInfo
from backend.app.schemas.files import DirectoryListing, FileEntry
from backend.app.services.directories import inspect_directory
from backend.app.services.files import FileService


def is_multiple(access):
    return access.role != "admin" and access.scope_mode == "multiple"


def account_permissions(access):
    if access.role == "admin":
        return PERMISSIONS
    if is_multiple(access):
        return sorted({permission for grant in access.directory_grants for permission in grant.permissions})
    return access.permissions


def path_permissions(files, access, target):
    if not is_multiple(access):
        root = scope_root(files, access)
        return account_permissions(access) if target.is_relative_to(root) else []
    catalog = files.directory_catalog
    for grant in access.directory_grants:
        if catalog.get(grant.directory_id) != grant.directory_path:
            continue
        try:
            root = files.resolve(grant.directory_path)
        except AppError:
            continue
        if target.is_relative_to(root):
            return grant.permissions
    return []


def authorize_path(files, access, target, permission="browse", virtual=False):
    require(access, permission)
    if is_multiple(access) and target == files.root and virtual and permission == "browse":
        return
    if permission not in path_permissions(files, access, target):
        raise AppError(403, "DIRECTORY_FORBIDDEN", "沒有此目錄的操作權限。")


def access_context(files, access):
    context = [access.version, str(scope_root(files, access))]
    if is_multiple(access):
        import hashlib
        import json

        catalog = files.registry.access_state()
        grants = sorted(
            (g.directory_id, g.directory_path, sorted(g.permissions), catalog.get(g.directory_id))
            for g in access.directory_grants
        )
        context.append(hashlib.sha256(json.dumps(grants, ensure_ascii=False).encode()).hexdigest())
    return context


def granted_roots(files, access):
    catalog = files.directory_catalog
    return [g.directory_path for g in access.directory_grants
            if catalog.get(g.directory_id) == g.directory_path and "browse" in g.permissions]


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
        permissions=account_permissions(access),
        must_change_password=access.must_change_password,
        scope_mode="multiple" if is_multiple(access) else "single",
    )


def require(access, permission):
    if access.must_change_password:
        raise AppError(403, "PASSWORD_CHANGE_REQUIRED", "請先修改初始密碼。")
    if access.role != "admin" and ((not is_multiple(access) and access.root is None) or permission not in account_permissions(access)):
        raise AppError(403, "FORBIDDEN", "沒有執行此操作的權限。")


def scope_root(files, access):
    if access.role == "admin" or is_multiple(access):
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
    if is_multiple(access):
        authorize_path(files, access, target)
    return target.relative_to(files.root).as_posix() if target != files.root else ""


def local_path(files, access, path):
    target = files.resolve(path)
    root = scope_root(files, access)
    if not target.is_relative_to(root):
        raise AppError(404, "NOT_FOUND", "找不到此項目。")
    if is_multiple(access):
        authorize_path(files, access, target, virtual=True)
    return target.relative_to(root).as_posix() if target != root else ""


class ScopedFiles(FileService):
    def __init__(self, files, factory, user_id, permission):
        self.base, self.factory, self.user_id, self.permission = files, factory, user_id, permission
        with factory() as db:
            access = policy(db, user_id)
            require(access, permission)
            self.version = access.version
            self.root = scope_root(files, access)
            self.context = access_context(files, access)
        if not self.root.is_dir():
            raise AppError(404, "ROOT_MISSING", "指定目錄已不存在，請聯絡管理員。")

    def resolve(self, path):
        with self.factory() as db:
            access = policy(db, self.user_id)
            require(access, self.permission)
            if access_context(self.base, access) != self.context:
                raise AppError(403, "ACCESS_CHANGED", "權限已變更，請重新登入。")
        target = super().resolve(path)
        self.base.resolve(target.relative_to(self.base.root).as_posix())
        authorize_path(self.base, access, target, self.permission, virtual=True)
        return target

    def directory_entries(self):
        with self.factory() as db:
            access = policy(db, self.user_id)
            if not is_multiple(access):
                return []
            grants = {grant.directory_id: grant for grant in access.directory_grants}
        self.resolve("")
        entries = []
        for row in self.base.registry.rows():
            grant = grants.get(row.id)
            if not row.enabled or not grant or grant.directory_path != row.path or "browse" not in grant.permissions:
                continue
            status = inspect_directory(self.base, row.path)["status"]
            modified = None
            if status == "readable":
                try:
                    modified = self.base.entry(self.base.resolve(row.path)).modified
                except (OSError, AppError):
                    status = "unavailable"
            entries.append(FileEntry(name=row.name, path=row.path, type="directory", size=None,
                                     modified=modified, directory_id=row.id, directory_root=True, status=status))
        self.resolve("")
        return sorted(entries, key=lambda entry: (entry.name.casefold(), entry.path))

    def navigation(self, path):
        target = self.resolve(path)
        local = target.relative_to(self.root).as_posix() if target != self.root else ""
        scope_path, scope_name, directory_id = "", "", None
        with self.factory() as db:
            access = policy(db, self.user_id)
            if is_multiple(access) and local:
                catalog = {row.id: row for row in self.base.registry.rows() if row.enabled}
                for grant in access.directory_grants:
                    row = catalog.get(grant.directory_id)
                    if (row and row.path == grant.directory_path
                            and target.is_relative_to(self.base.root / row.path)):
                        scope_path, scope_name, directory_id = row.path, row.name, row.id
                        break
                if directory_id is None:
                    raise AppError(403, "DIRECTORY_FORBIDDEN", "沒有此目錄的操作權限。")
        crumbs = []
        if directory_id:
            crumbs.append(dict(name=scope_name, path=scope_path))
            suffix = target.relative_to(self.base.root / scope_path).as_posix()
            parts = [] if suffix == "." else suffix.split("/")
            prefix = scope_path
        else:
            parts, prefix = local.split("/") if local else [], ""
        for part in parts:
            prefix = f"{prefix}/{part}" if prefix else part
            crumbs.append(dict(name=part, path=prefix))
        parent = None if not local else (crumbs[-2]["path"] if len(crumbs) > 1 else "")
        return dict(directory_id=directory_id, scope_path=scope_path, scope_name=scope_name,
                    parent_path=parent, breadcrumbs=crumbs)

    def list_directory(self, path="", directories_only=False):
        target = self.resolve(path)
        with self.factory() as db:
            multiple = is_multiple(policy(db, self.user_id))
        if multiple and target == self.base.root:
            result = DirectoryListing(path="", entries=self.directory_entries())
        else:
            result = super().list_directory(path, directories_only)
        result.permissions = self.capabilities(path)
        return DirectoryListing.model_validate({**result.model_dump(), **self.navigation(path)})

    def capabilities(self, path):
        target = self.resolve(path)
        if not target.is_dir():
            raise AppError(404, "NOT_FOUND", "目的資料夾不存在或目前無法使用。")
        with self.factory() as db:
            access = policy(db, self.user_id)
            if access.version != self.version:
                raise AppError(403, "ACCESS_CHANGED", "權限已變更，請重新登入。")
            if is_multiple(access) and target == self.base.root:
                return ["browse"]
            return path_permissions(self.base, access, target)


def scoped(request, permission):
    return ScopedFiles(
        request.app.state.files, request.app.state.session_factory, request.state.access.user_id, permission
    )


def authorize_job(files, db, job, execution=True):
    access = policy(db, job.user_id)
    context = job.items[0].get("access_context") if job.items else None
    current = access_context(files, access)
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
            if execution and is_multiple(access):
                destination = files.resolve(job.destination) if job.destination is not None else files.resolve(record.original_path).parent
                authorize_path(files, access, destination, "upload")
        else:
            local_path(files, access, item["source"])
            if is_multiple(access) and (execution or job.kind == "archive"):
                permission = {"copy": "read", "move": "modify", "trash": "delete", "archive": "read"}[job.kind]
                authorize_path(files, access, files.resolve(item["source"]), permission)
    if execution and is_multiple(access) and job.kind in {"copy", "move"}:
        destination = files.resolve(job.destination or "")
        authorize_path(files, access, destination, "upload")
        if job.kind == "move":
            authorize_path(files, access, destination, "modify")
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
