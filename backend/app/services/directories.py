"""Persistent shared directory registry; registration does not grant account access."""

import json
import logging
import os
import time
from datetime import UTC, datetime
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import delete, func, select

from backend.app.core.errors import AppError
from backend.app.models.access import AccountAccess, AuditEvent, DirectoryGrant
from backend.app.models.directory import Directory, DirectoryRegistryState
from backend.app.models.operation import Operation
from backend.app.models.share import FileShare
from backend.app.models.user import LoginSession, User
from backend.app.services.transfers import MUTATION_LOCK


class DirectoryDefinition(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(pattern=r"^[a-z][a-z0-9_-]{0,63}$")
    name: str = Field(min_length=1, max_length=100)
    path: str = Field(min_length=1, max_length=255)


def definitions(files, raw):
    try:
        values = json.loads(raw)
        if not isinstance(values, list) or len(values) > 100:
            raise ValueError
        entries = [DirectoryDefinition.model_validate(value) for value in values]
        if len({entry.id for entry in entries}) != len(entries) or any(entry.id == "root" for entry in entries):
            raise ValueError
        paths = set()
        for entry in entries:
            # First-round catalog lists only top-level deployment directories.
            if entry.path in {".", ".."} or "/" in entry.path or "\\" in entry.path:
                raise ValueError
            files.resolve(entry.path)
            key = os.path.normcase(entry.path)
            if key in paths:
                raise ValueError
            paths.add(key)
        return entries
    except (ValueError, ValidationError, AppError) as exc:
        raise ValueError("FILES_DIRECTORIES 必須是最多 100 筆、代碼及第一層相對目錄不重複的 JSON 清單。") from exc


def inspect_directory(files, path):
    result = dict(path=path, status="unavailable", writable=False, cross_device=None)
    try:
        target = files.resolve(path)
        if not target.exists():
            return {**result, "status": "missing"}
        if not target.is_dir():
            return {**result, "status": "not_directory"}
        # Open the directory without scanning its entire contents or writing a probe file.
        with os.scandir(target) as stream:
            next(stream, None)
        writable = os.access(target, os.W_OK | os.X_OK)
        return {
            **result,
            "status": "readable",
            "writable": writable,
            "cross_device": target.stat().st_dev != files.root.stat().st_dev,
        }
    except (OSError, AppError):
        return result



def path_key(path):
    return os.path.normcase(path).replace("\\", "/")


def overlaps(left, right):
    left, right = path_key(left).split("/") if left else [], path_key(right).split("/") if right else []
    return left[:len(right)] == right or right[:len(left)] == left


def directory_record(row):
    return {key: getattr(row, key) for key in (
        "id", "name", "path", "enabled", "revision", "access_revision", "created_at", "updated_at"
    )}


class DirectoryRegistryService:
    def __init__(self, files, factory):
        self.files, self.factory = files, factory

    def initialize(self, raw):
        with MUTATION_LOCK, self.factory() as db:
            state = db.get(DirectoryRegistryState, 1)
            if state and state.legacy_imported:
                if raw.strip() not in {"", "[]"}:
                    logging.getLogger(__name__).warning(
                        "FILES_DIRECTORIES is deprecated and ignored after registry initialization."
                    )
                return
            entries = definitions(self.files, raw)
            for entry in entries:
                db.add(Directory(id=entry.id, name=entry.name, path=entry.path, path_key=path_key(entry.path)))
            db.add(DirectoryRegistryState(id=1, legacy_imported=True))
            db.commit()

    def rows(self):
        with self.factory() as db:
            return list(db.scalars(select(Directory).order_by(Directory.created_at, Directory.id)))

    def catalog(self):
        return {row.id: row.path for row in self.rows() if row.enabled}

    def access_state(self):
        return {row.id: (row.path, row.access_revision) for row in self.rows() if row.enabled}

    def normalized_path(self, path):
        target = self.files.resolve(path)
        if target == self.files.root:
            raise AppError(400, "INVALID_DIRECTORY", "請選擇根目錄內的資料夾。")
        return target.relative_to(self.files.root).as_posix()

    def check_available(self, path):
        status = inspect_directory(self.files, path)
        if status["status"] != "readable":
            raise AppError(400, "DIRECTORY_UNAVAILABLE", "目錄不存在或無法讀取，請先檢查掛載及權限。")

    def create(self, data, actor_id):
        path = self.normalized_path(data.path)
        self.check_available(path)
        with MUTATION_LOCK, self.factory() as db:
            # Serialize the final filesystem check with moves, trash and renames.
            self.check_available(path)
            rows = list(db.scalars(select(Directory)))
            if len(rows) >= 100:
                raise AppError(409, "DIRECTORY_LIMIT", "最多可登錄 100 個目錄。")
            if any(overlaps(row.path, path) for row in rows):
                raise AppError(409, "DIRECTORY_OVERLAP", "此位置與已登錄目錄重複或有父子關係，請選擇獨立目錄。")
            row = Directory(id="dir_" + uuid4().hex, name=data.name, path=path, path_key=path_key(path))
            db.add(row)
            db.flush()
            result = directory_record(row)
            db.add(AuditEvent(actor_id=actor_id, action="directory.create", details={"directory_id": row.id, "after": result}))
            db.commit()
            return result

    def update(self, directory_id, data, actor_id):
        if data.enabled is True:
            with self.factory() as db:
                row = self.get(db, directory_id)
                self.check_available(row.path)
        with MUTATION_LOCK, self.factory() as db:
            row = self.get(db, directory_id)
            if row.revision != data.revision:
                raise AppError(409, "DIRECTORY_CONFLICT", "目錄設定已被更新，請重新整理後再試。")
            before = directory_record(row)
            changed_access = data.enabled is not None and data.enabled != row.enabled
            if data.name is not None:
                row.name = data.name
            if changed_access:
                row.enabled = data.enabled
                row.access_revision += 1
                users = list(db.scalars(select(AccountAccess).join(DirectoryGrant).where(
                    DirectoryGrant.directory_id == row.id,
                    AccountAccess.role == "user", AccountAccess.scope_mode == "multiple",
                )))
                for access in users:
                    access.version += 1
                    db.execute(delete(LoginSession).where(LoginSession.user_id == access.user_id))
            row.revision += 1
            row.updated_at = time.time()
            after = directory_record(row)
            action = ("directory.enable" if row.enabled else "directory.disable") if changed_access else "directory.update"
            db.add(AuditEvent(actor_id=actor_id, action=action, details={"directory_id": row.id, "before": before, "after": after}))
            db.commit()
            return after

    @staticmethod
    def get(db, directory_id):
        row = db.get(Directory, directory_id)
        if row is None:
            raise AppError(404, "DIRECTORY_NOT_FOUND", "找不到此登錄目錄。")
        return row

    def inventory(self):
        with self.factory() as db:
            counts = dict(db.execute(select(DirectoryGrant.directory_id, func.count())
                                    .group_by(DirectoryGrant.directory_id)).all())
        return {
            "root": str(self.files.root), "checked_at": datetime.now(UTC).isoformat(),
            "root_status": inspect_directory(self.files, ""),
            "items": [
                {**directory_record(row), **inspect_directory(self.files, row.path), "account_count": counts.get(row.id, 0)}
                for row in self.rows()
            ],
        }

    def impact(self, directory_id):
        with self.factory() as db:
            row = self.get(db, directory_id)
            direct = list(db.execute(select(User, AccountAccess).join(AccountAccess).join(DirectoryGrant).where(
                DirectoryGrant.directory_id == directory_id,
                AccountAccess.role == "user", AccountAccess.scope_mode == "multiple",
            )))
            legacy = [(user, access) for user, access in db.execute(select(User, AccountAccess).join(AccountAccess).where(
                AccountAccess.role == "user", AccountAccess.scope_mode == "single", AccountAccess.root.is_not(None),
            )) if overlaps(access.root, row.path)]
            ids = [user.id for user, _ in direct]
            jobs = db.scalar(select(func.count()).select_from(Operation).where(
                Operation.user_id.in_(ids), Operation.status.in_(["queued", "running"]),
            ))
            shares = db.scalar(select(func.count()).select_from(FileShare).where(
                FileShare.owner_id.in_(ids), FileShare.revoked.is_(False), FileShare.expires_at > time.time(),
            ))
            def accounts(rows):
                return [dict(id=user.id, username=user.username, enabled=access.enabled) for user, access in rows]
            return dict(directory_id=row.id, revision=row.revision, accounts=accounts(direct),
                        legacy_accounts=accounts(legacy), active_jobs=jobs, active_shares=shares,
                        administrators_retain_access=True)

    def browse(self, path):
        target = self.files.resolve(path)
        if not target.is_dir():
            raise AppError(400, "INVALID_DIRECTORY", "請指定現有的資料夾。")
        items, truncated = [], False
        # Bound the enumeration itself, not only the returned array (large NFS directories).
        with os.scandir(target) as stream:
            for index, item in enumerate(stream):
                if index >= 200:
                    truncated = True
                    break
                relative = (target / item.name).relative_to(self.files.root).as_posix()
                try:
                    if self.files.resolve(relative).is_dir():
                        items.append(dict(name=item.name, path=relative))
                except (AppError, OSError):
                    continue
        items.sort(key=lambda item: item["name"].casefold())
        normalized = target.relative_to(self.files.root).as_posix() if target != self.files.root else ""
        return dict(path=normalized, items=items, truncated=truncated)
