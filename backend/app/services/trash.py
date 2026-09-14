"""Trash payloads stay on the managed filesystem; SQL records provide the journal."""

import time
from uuid import UUID, uuid4

from sqlalchemy import select

from backend.app.core.errors import AppError
from backend.app.models.operation import TrashItem
from backend.app.models.user import User
from backend.app.services.transfers import MUTATION_LOCK, TRASH_PREFIX, rename_no_replace


class TrashService:
    def __init__(self, files, factory):
        self.files = files
        self.factory = factory

    def directory(self, create=False):
        path = self.files.root / TRASH_PREFIX
        if path.is_symlink() or (hasattr(path, "is_junction") and path.is_junction()):
            raise AppError(403, "UNSAFE_TRASH", "垃圾桶目錄不安全，請聯絡維護者。")
        if path.exists() and getattr(path.lstat(), "st_file_attributes", 0) & 0x400:
            raise AppError(403, "UNSAFE_TRASH", "垃圾桶不可使用重新解析點。")
        if not path.exists():
            if not create:
                return path
            path.mkdir()
            (path / ".owner").write_text("files-app-trash-v1", encoding="utf-8")
        marker = path / ".owner"
        if (
            marker.is_symlink()
            or not marker.is_file()
            or marker.read_text(encoding="utf-8") != "files-app-trash-v1"
        ):
            raise AppError(409, "TRASH_NOT_OWNED", "垃圾桶保留目錄已有其他內容，請由維護者檢查。")
        return path

    def payload(self, item_id, create=False):
        try:
            key = UUID(item_id).hex
        except ValueError:
            raise AppError(400, "INVALID_TRASH_ID", "垃圾桶項目識別碼無效。") from None
        path = self.directory(create) / key
        if path.is_symlink() or (hasattr(path, "is_junction") and path.is_junction()):
            raise AppError(403, "UNSAFE_TRASH", "垃圾桶項目不安全。")
        if path.exists() and getattr(path.lstat(), "st_file_attributes", 0) & 0x400:
            raise AppError(403, "UNSAFE_TRASH", "垃圾桶項目不安全。")
        return path

    def list(self, offset=0, owner=None, root=None):
        with self.factory() as db:
            query = select(TrashItem).where(TrashItem.status != "restored")
            if owner is not None:
                query = query.where(TrashItem.deleted_by == owner)
            if root:
                query = query.where(
                    TrashItem.original_path.startswith(root.rstrip("/") + "/", autoescape=True)
                )
            records = db.scalars(query.order_by(TrashItem.deleted_at.desc()).offset(offset).limit(50))
            return [
                {
                    key: getattr(item, key)
                    for key in (
                        "id",
                        "original_path",
                        "kind",
                        "deleted_by",
                        "deleted_at",
                        "status",
                    )
                }
                for item in records
            ]

    def recover(self):
        # Payload exists + source absent is enough to make a staged trash record
        # available; restoring requires identity evidence at its journaled target.
        with MUTATION_LOCK, self.factory() as db:
            for record in db.scalars(select(TrashItem).where(TrashItem.status.in_(["staging", "restoring"]))):
                try:
                    payload = self.payload(record.id)
                    if record.status == "staging":
                        source = self.files.resolve(record.original_path)
                        record.status = (
                            "available" if payload.exists() and not source.exists() else "needs_review"
                        )
                    elif payload.exists():
                        record.status = (
                            "available"
                            if not record.restore_target
                            or not self.files.resolve(record.restore_target).exists()
                            else "needs_review"
                        )
                    else:
                        target = self.files.resolve(record.restore_target) if record.restore_target else None
                        record.status = (
                            "restored"
                            if target and target.exists() and self.identity(target) == record.source_identity
                            else "needs_review"
                        )
                except (AppError, OSError):
                    record.status = "needs_review"
            db.commit()

    @staticmethod
    def identity(path):
        info = path.stat()
        return [info.st_dev, info.st_ino]

    def put(self, operations, job, index, item):
        source = self.files.resolve(item["source"])
        # Recursion rejects nested links/special files before any move.
        operations.snapshot(source, job.id)
        operations.check_cancel(job.id)
        with MUTATION_LOCK:
            source = self.files.resolve(item["source"])
            payload_id = uuid4().hex
            target = self.payload(payload_id, create=True)
            if source.stat().st_dev != target.parent.stat().st_dev:
                raise AppError(400, "CROSS_DEVICE", "垃圾桶不支援跨檔案系統搬移。")
            with self.factory() as db:
                user = db.get(User, job.user_id)
                record = TrashItem(
                    id=payload_id,
                    original_path=item["source"],
                    kind="directory" if source.is_dir() else "file",
                    deleted_by=user.username,
                    deleted_at=time.time(),
                    status="staging",
                    source_identity=self.identity(source),
                )
                db.add(record)
                db.commit()
            operations.patch_item(job.id, index, status="committing", trash_id=payload_id)
            try:
                rename_no_replace(source, target)
            except OSError:
                with self.factory() as db:
                    db.get(TrashItem, payload_id).status = "needs_review"
                    db.commit()
                raise
            with self.factory() as db:
                db.get(TrashItem, payload_id).status = "available"
                db.commit()
            operations.patch_item(job.id, index, status="done", message="已移至垃圾桶。")

    def restore(self, operations, job, index, item):
        operations.check_cancel(job.id)
        with MUTATION_LOCK, self.factory() as db:
            record = db.get(TrashItem, item["source"])
            if not record or record.status != "available":
                raise AppError(409, "TRASH_UNAVAILABLE", "項目已還原或需要維護者檢查。")
            source = self.payload(record.id)
            if not source.exists():
                raise AppError(404, "TRASH_MISSING", "垃圾桶內容已不存在，請聯絡維護者。")
            original = self.files.resolve(record.original_path)
            parent = self.files.resolve(job.destination) if job.destination is not None else original.parent
            if not parent.is_dir():
                raise AppError(404, "PARENT_MISSING", "原資料夾不存在，請選擇還原目的地。")
            if source.stat().st_dev != parent.stat().st_dev:
                raise AppError(400, "CROSS_DEVICE", "不支援跨檔案系統還原。")
            target = operations.destination(parent, original.name, job.conflict)
            if target is None:
                operations.patch_item(
                    job.id, index, status="skipped", message="同名項目已略過，內容仍在垃圾桶。"
                )
                return
            record.restore_target = target.relative_to(self.files.root).as_posix()
            record.source_identity = self.identity(source)
            record.status = "restoring"
            db.commit()
            operations.patch_item(job.id, index, status="committing", target=record.restore_target)
            try:
                rename_no_replace(source, target)
            except OSError:
                record.status = "available"
                db.commit()
                raise
            record.status = "restored"
            db.commit()
            operations.patch_item(job.id, index, status="done", message="已還原。")
