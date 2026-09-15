"""Single-worker, journaled file operations. Never replay ambiguous writes."""

import copy
import errno
import json
import logging
import os
import shutil
import stat
import time
from pathlib import Path
from threading import Event, RLock, Thread
from uuid import UUID, uuid4

from sqlalchemy import select

from backend.app.core.errors import AppError
from backend.app.models.operation import Operation, TrashItem
from backend.app.services.access import access_context, authorize_job, policy
from backend.app.services.archives import ArchiveService
from backend.app.services.transfers import MUTATION_LOCK, TEMP_PREFIX, rename_no_replace, validate_name
from backend.app.services.trash import TrashService

ACTIVE = {"queued", "running"}
log = logging.getLogger(__name__)


class Cancelled(Exception):
    pass


def identity(path: Path):
    info = path.stat()
    return [info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns]


def contains_path(source: Path, target: Path):
    # samefile also handles case-insensitive Windows shares mounted in Linux.
    return any(candidate.exists() and source.samefile(candidate) for candidate in (target, *target.parents))


class OperationService:
    def __init__(self, files, factory, archive_root=None):
        self.files = files
        self.factory = factory
        self.lock = RLock()
        self.stop = Event()
        self.wake = Event()
        self.trash = TrashService(files, factory)
        self.trash.recover()
        self.recover()
        self.archives = ArchiveService(archive_root or files.root.parent / "archives", factory)
        self.archives.cleanup(force=True)
        self.thread = Thread(target=self.work, name="file-operations", daemon=True)
        self.thread.start()

    def close(self):
        self.stop.set()
        self.wake.set()
        self.thread.join()

    def recover(self):
        with self.factory() as db:
            for job in db.scalars(select(Operation).where(Operation.status.in_(ACTIVE))):
                items = copy.deepcopy(job.items)
                for item in items:
                    if item["status"] not in {"done", "skipped", "error", "cancelled"}:
                        item.update(
                            status="needs_review", message="服務曾中斷，請核對來源與目的地；不會自動重跑。"
                        )
                job.items = items
                job.status = "needs_review"
                job.updated_at = time.time()
            db.commit()

    def result(self, job):
        return {
            key: getattr(job, key)
            for key in (
                "id",
                "kind",
                "destination",
                "conflict",
                "status",
                "cancel_requested",
                "created_at",
                "updated_at",
                "items",
            )
        }

    def get(self, job_id, user_id):
        with self.factory() as db:
            job = db.get(Operation, job_id)
            if not job or job.user_id != user_id:
                raise AppError(404, "TASK_NOT_FOUND", "找不到此任務。")
            authorize_job(self.files, db, job, execution=False)
            return self.result(job)

    def list(self, user_id, offset=0):
        with self.factory() as db:
            access = policy(db, user_id)
            query = select(Operation).where(Operation.user_id == user_id)
            if access.role != "admin":
                query = query.where(Operation.items[0]["access_context"][0].as_integer() == access.version)
            jobs = db.scalars(query.order_by(Operation.created_at.desc()).offset(offset).limit(50))
            results = []
            for job in jobs:
                try:
                    authorize_job(self.files, db, job, execution=False)
                    results.append(self.result(job))
                except AppError:
                    continue
            return results

    def submit(self, user_id, data):
        payload = json.dumps(data.model_dump(mode="json"), sort_keys=True, ensure_ascii=False)
        with self.lock, self.factory() as db:
            existing = db.scalar(
                select(Operation).where(
                    Operation.user_id == user_id, Operation.request_id == str(data.request_id)
                )
            )
            if existing:
                authorize_job(self.files, db, existing)
                if existing.payload != payload:
                    raise AppError(409, "REQUEST_REUSED", "此提交識別碼已用於不同操作。")
                return self.result(existing)
            active = db.scalars(select(Operation.id).where(Operation.status.in_(ACTIVE))).all()
            if len(active) >= 100:
                raise AppError(429, "QUEUE_FULL", "等待中的任務過多，請稍後重試。")
            destination = self.files.resolve(data.destination or "")
            if data.kind != "trash" and not destination.is_dir():
                raise AppError(404, "NOT_FOUND", "目的資料夾不存在。")
            paths = []
            for raw in data.paths:
                if len(raw) > 4096:
                    raise AppError(400, "INVALID_PATH", "路徑過長。")
                if data.kind == "restore":
                    try:
                        source = UUID(raw).hex
                    except ValueError:
                        raise AppError(400, "INVALID_TRASH_ID", "垃圾桶項目識別碼無效。") from None
                    if source not in paths:
                        paths.append(source)
                    continue
                source = self.files.resolve(raw)
                if source == self.files.root:
                    raise AppError(400, "ROOT_OPERATION", "不能操作根目錄。")
                if data.kind in {"move", "trash"}:
                    self.files.assert_movable(source)
                if source not in paths:
                    paths.append(source)
            if data.kind != "restore":
                paths = [
                    p for p in paths if not any(p != parent and p.is_relative_to(parent) for parent in paths)
                ]
            items = []
            for source in paths:
                if data.kind == "restore":
                    record = db.get(TrashItem, source)
                    items.append(
                        {
                            "source": source,
                            "display_name": record.original_path if record else "項目已不存在",
                            "target": None,
                            "status": "pending",
                            "message": "",
                        }
                    )
                    continue
                if data.kind != "trash" and source.is_dir() and contains_path(source, destination):
                    raise AppError(400, "SELF_DESTINATION", "目的地不能是來源資料夾或其子目錄。")
                items.append(
                    {
                        "source": source.relative_to(self.files.root).as_posix(),
                        "target": None,
                        "status": "pending",
                        "message": "",
                        "source_identity": identity(source) if source.exists() else None,
                    }
                )
            now = time.time()
            job = Operation(
                id=uuid4().hex,
                user_id=user_id,
                request_id=str(data.request_id),
                payload=payload,
                kind=data.kind,
                destination=data.destination,
                conflict=data.conflict,
                status="queued",
                cancel_requested=False,
                created_at=now,
                updated_at=now,
                items=items,
            )
            access = policy(db, user_id)
            for item in items:
                item["access_context"] = access_context(self.files, access)
            job.items = items
            authorize_job(self.files, db, job)
            db.add(job)
            db.commit()
            result = self.result(job)
        self.wake.set()
        return result

    def cancel(self, job_id, user_id):
        with self.lock, self.factory() as db:
            job = db.get(Operation, job_id)
            if not job or job.user_id != user_id:
                raise AppError(404, "TASK_NOT_FOUND", "找不到此任務。")
            if job.status in ACTIVE:
                job.cancel_requested = True
                job.updated_at = time.time()
                db.commit()
            return self.result(job)

    def patch_item(self, job_id, index, **values):
        with self.lock, self.factory() as db:
            job = db.get(Operation, job_id)
            items = copy.deepcopy(job.items)
            items[index].update(values)
            job.items = items
            job.updated_at = time.time()
            db.commit()

    def check_cancel(self, job_id):
        if self.stop.is_set():
            raise Cancelled
        with self.factory() as db:
            job = db.get(Operation, job_id)
            if job.cancel_requested:
                raise Cancelled
            authorize_job(self.files, db, job)

    def work(self):
        while not self.stop.is_set():
            self.wake.wait(0.5)
            self.wake.clear()
            self.archives.cleanup()
            while not self.stop.is_set():
                with self.lock, self.factory() as db:
                    job = db.scalar(
                        select(Operation)
                        .where(Operation.status == "queued")
                        .order_by(Operation.created_at)
                        .limit(1)
                    )
                    if not job:
                        break
                    job.status = "running"
                    db.commit()
                try:
                    self.run(job)
                except Exception:
                    log.exception("Operation worker failed")
                    with self.lock, self.factory() as db:
                        current = db.get(Operation, job.id)
                        current.status = "needs_review"
                        current.updated_at = time.time()
                        db.commit()

    def run(self, job):
        if job.kind == "archive":
            return self.archives.run(self, job)
        for index, item in enumerate(job.items):
            try:
                self.check_cancel(job.id)
                self.patch_item(job.id, index, status="running")
                self.execute(job, index, item)
            except Cancelled:
                self.patch_item(job.id, index, status="cancelled", message="已取消，已完成項目仍保留。")
            except (AppError, OSError) as exc:
                message = (
                    exc.message
                    if isinstance(exc, AppError)
                    else {
                        errno.ENOSPC: "磁碟空間不足。",
                        errno.EACCES: "沒有存取權限。",
                        errno.ENOENT: "來源或目的地已不存在。",
                        errno.EXDEV: "不支援跨檔案系統搬移。",
                    }.get(exc.errno, "檔案操作失敗，請檢查來源及目的地。")
                )
                self.patch_item(job.id, index, status="error", message=message)
        with self.lock, self.factory() as db:
            current = db.get(Operation, job.id)
            states = {i["status"] for i in current.items}
            current.status = (
                "cancelled"
                if states == {"cancelled"}
                else ("completed" if states <= {"done", "skipped"} else "partial")
            )
            current.updated_at = time.time()
            db.commit()

    def destination(self, parent, name, conflict):
        validate_name(name)
        target = parent / name
        if not os.path.lexists(target):
            return target
        if conflict == "skip":
            return None
        stem, suffix = os.path.splitext(name)
        for counter in range(1, 10001):
            candidate = f"{stem} ({counter}){suffix}"
            validate_name(candidate)
            target = parent / candidate
            if not os.path.lexists(target):
                return target
        raise AppError(409, "NAME_EXHAUSTED", "找不到可用的副本名稱。")

    def snapshot(self, source, job_id):
        found = {}
        pending = [source]
        while pending:
            self.check_cancel(job_id)
            path = pending.pop()
            self.files.resolve(path.relative_to(self.files.root).as_posix())
            info = path.stat()
            relative = path.relative_to(source).as_posix()
            if len(found) >= 100000 or len(Path(relative).parts) > 128:
                raise AppError(400, "TREE_TOO_LARGE", "資料夾過大或過深，請分批處理。")
            if not (stat.S_ISREG(info.st_mode) or stat.S_ISDIR(info.st_mode)):
                raise AppError(400, "UNSUPPORTED_FILE", "不支援此特殊檔案類型。")
            found[relative] = identity(path)
            if path.is_dir():
                pending.extend(path.iterdir())
        return found

    def copy_tree(self, source, temporary, snapshot, job_id):
        for relative in sorted(snapshot, key=lambda p: (len(Path(p).parts), p)):
            self.check_cancel(job_id)
            src = source if relative == "." else source / relative
            self.files.resolve(src.relative_to(self.files.root).as_posix())
            dst = temporary if relative == "." else temporary / relative
            if src.is_dir():
                dst.mkdir()
            else:
                with src.open("rb") as reader, dst.open("xb") as writer:
                    while chunk := reader.read(1024 * 1024):
                        self.check_cancel(job_id)
                        writer.write(chunk)
                    writer.flush()
                    os.fsync(writer.fileno())
                if identity(src) != snapshot[relative]:
                    raise AppError(409, "SOURCE_CHANGED", "來源在複製期間變更，請重試。")

    def execute(self, job, index, item):
        if job.kind in {"move", "trash"}:
            self.files.assert_movable(self.files.resolve(item["source"]))
        if job.kind != "restore" and item.get("source_identity") is not None:
            source = self.files.resolve(item["source"])
            if identity(source) != item["source_identity"]:
                raise AppError(409, "SOURCE_CHANGED", "來源在等待期間已變更，請確認後重試。")
        if job.kind == "trash":
            return self.trash.put(self, job, index, item)
        if job.kind == "restore":
            return self.trash.restore(self, job, index, item)
        source = self.files.resolve(item["source"])
        parent = self.files.resolve(job.destination or "")
        if not parent.is_dir() or not source.exists():
            raise AppError(404, "NOT_FOUND", "來源或目的資料夾不存在。")
        if source.is_dir() and contains_path(source, parent):
            raise AppError(400, "SELF_DESTINATION", "不能放入來源本身或其子目錄。")
        if job.kind == "move" and source.parent.samefile(parent):
            self.patch_item(job.id, index, status="skipped", message="無須移動。")
            return
        before = self.snapshot(source, job.id)
        parent_identity = identity(parent)[:2]
        temporary = parent / f"{TEMP_PREFIX}batch-{job.id}-{index}"
        published = False
        try:
            with MUTATION_LOCK:
                if self.destination(parent, source.name, job.conflict) is None:
                    self.patch_item(job.id, index, status="skipped", message="同名項目已略過。")
                    return
                if job.kind == "move" and source.stat().st_dev != parent.stat().st_dev:
                    raise AppError(400, "CROSS_DEVICE", "不支援跨檔案系統搬移。")
            if job.kind == "copy":
                self.patch_item(job.id, index, temporary=temporary.relative_to(self.files.root).as_posix())
                self.copy_tree(source, temporary, before, job.id)
            self.check_cancel(job.id)
            with MUTATION_LOCK:
                self.check_cancel(job.id)
                self.files.resolve(item["source"])
                self.files.resolve(job.destination or "")
                if identity(parent)[:2] != parent_identity or self.snapshot(source, job.id) != before:
                    raise AppError(409, "SOURCE_CHANGED", "來源或目的資料夾已變更，請重試。")
                target = self.destination(parent, source.name, job.conflict)
                if target is None:
                    self.patch_item(job.id, index, status="skipped", message="同名項目已略過。")
                    return
                self.patch_item(
                    job.id, index, status="committing", target=target.relative_to(self.files.root).as_posix()
                )
                rename_no_replace(temporary if job.kind == "copy" else source, target)
                published = True
                self.patch_item(job.id, index, status="done", message="已完成。")
        finally:
            # Only delete the exact UUID-named temporary owned by this item.
            if job.kind == "copy" and not published and temporary.exists():
                if not temporary.resolve().is_relative_to(self.files.root) or temporary.is_symlink():
                    raise AppError(403, "TEMP_CHANGED", "暫存路徑已變更，請由維護者檢查。")
                if temporary.is_dir():
                    shutil.rmtree(temporary)
                else:
                    temporary.unlink()
