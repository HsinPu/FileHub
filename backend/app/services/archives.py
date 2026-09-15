import copy
import logging
import os
import shutil
import time
import zipfile
from pathlib import Path

from sqlalchemy import select

from backend.app.core.errors import AppError
from backend.app.models.operation import Operation
from backend.app.services.transfers import MUTATION_LOCK, rename_no_replace

MAX_INPUT = 1024**3
MAX_OUTPUT = 1100 * 1024**2
MAX_CACHE = 2 * 1024**3
TTL = 3600


class ArchiveService:
    def __init__(self, root: Path, factory):
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.factory = factory
        self.last_cleanup = 0.0

    def path(self, job_id, suffix="zip"):
        if len(job_id) != 32 or any(c not in "0123456789abcdef" for c in job_id):
            raise AppError(404, "NOT_FOUND", "找不到打包檔案。")
        target = self.root / f"{job_id}.{suffix}"
        if target.is_symlink() or (target.exists() and not target.resolve().is_relative_to(self.root)):
            raise AppError(403, "UNSAFE_ARCHIVE", "打包暫存路徑不安全。")
        return target

    def cleanup(self, force=False):
        now = time.time()
        if not force and now - self.last_cleanup < 60:
            return
        self.last_cleanup = now
        with self.factory() as db:
            jobs = db.scalars(
                select(Operation).where(
                    Operation.kind == "archive", Operation.status.notin_(["queued", "running"])
                )
            )
            for job in jobs:
                suffixes = (
                    ["part", "zip"] if job.status != "completed" or now - job.updated_at >= TTL else ["part"]
                )
                for suffix in suffixes:
                    try:
                        self.path(job.id, suffix).unlink(missing_ok=True)
                    except (OSError, AppError):
                        pass  # An open Windows download may defer expiry cleanup.

    def download(self, operations, job_id, user_id):
        job = operations.get(job_id, user_id)
        if job["kind"] != "archive" or job["status"] != "completed":
            raise AppError(409, "ARCHIVE_NOT_READY", "打包尚未完成或已失敗。")
        target = self.path(job_id)
        if time.time() - job["updated_at"] >= TTL or not target.is_file():
            raise AppError(410, "ARCHIVE_EXPIRED", "打包檔案已到期，請重新打包。")
        return target

    def run(self, operations, job):
        from backend.app.services.access import policy, scope_root
        from backend.app.services.operations import Cancelled, identity

        part, final = self.path(job.id, "part"), self.path(job.id)
        status, message = "completed", "打包完成，可於一小時內下載。"
        try:
            with self.factory() as db:
                archive_root = scope_root(operations.files, policy(db, job.user_id))
            snapshots = []
            count = total = 0
            for item in job.items:
                operations.check_cancel(job.id)
                source = operations.files.resolve(item["source"])
                if item.get("source_identity") is not None and identity(source) != item["source_identity"]:
                    raise AppError(409, "SOURCE_CHANGED", "來源已變更，請重新打包。")
                snapshot = operations.snapshot(source, job.id)
                for relative, info in snapshot.items():
                    path = source if relative == "." else source / relative
                    count += 1
                    total += info[2] if path.is_file() else 0
                if count > 10000 or total > MAX_INPUT:
                    raise AppError(413, "ARCHIVE_TOO_LARGE", "ZIP 最多 10,000 個項目，來源合計上限 1 GB。")
                snapshots.append((source, snapshot))
            self.cleanup(force=True)
            used = sum(path.stat().st_size for path in self.root.iterdir() if path.is_file())
            required = total + 64 * 1024**2
            if used + required > MAX_CACHE or shutil.disk_usage(self.root).free < required:
                raise AppError(507, "ARCHIVE_SPACE", "打包暫存空間不足，請稍後重試或減少檔案。")
            with zipfile.ZipFile(part, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=1) as archive:
                for index, (source, snapshot) in enumerate(snapshots):
                    operations.patch_item(job.id, index, status="running")
                    for relative in sorted(snapshot):
                        operations.check_cancel(job.id)
                        path = source if relative == "." else source / relative
                        operations.files.resolve(path.relative_to(operations.files.root).as_posix())
                        name = path.relative_to(archive_root).as_posix()
                        if path.is_dir():
                            archive.writestr(name + "/", b"")
                        else:
                            with (
                                path.open("rb") as reader,
                                archive.open(name, "w", force_zip64=True) as writer,
                            ):
                                while chunk := reader.read(1024 * 1024):
                                    operations.check_cancel(job.id)
                                    writer.write(chunk)
                                    if archive.fp.tell() > MAX_OUTPUT:
                                        raise AppError(413, "ARCHIVE_TOO_LARGE", "ZIP 輸出超過容量上限。")
                            if identity(path) != snapshot[relative]:
                                raise AppError(409, "SOURCE_CHANGED", "來源在打包期間變更，請重試。")
                    operations.patch_item(
                        job.id, index, status="committing", message="已讀取，等待整包完成。"
                    )
            operations.check_cancel(job.id)
            with MUTATION_LOCK:
                operations.check_cancel(job.id)
                for source, before in snapshots:
                    if operations.snapshot(source, job.id) != before:
                        raise AppError(409, "SOURCE_CHANGED", "來源在打包期間變更，請重試。")
                if part.stat().st_size > MAX_OUTPUT:
                    raise AppError(413, "ARCHIVE_TOO_LARGE", "ZIP 輸出超過容量上限。")
                with part.open("r+b") as handle:
                    os.fsync(handle.fileno())
                rename_no_replace(part, final)
        except Cancelled:
            status, message = "cancelled", "已取消打包，來源保持不變。"
        except (AppError, OSError, zipfile.BadZipFile) as exc:
            logging.getLogger(__name__).warning(
                "Archive failed: %s errno=%s", type(exc).__name__, getattr(exc, "errno", None)
            )
            status = "partial"
            message = exc.message if isinstance(exc, AppError) else "無法打包，請檢查來源、權限及磁碟空間。"
        finally:
            part.unlink(missing_ok=True)
        with operations.lock, self.factory() as db:
            current = db.get(Operation, job.id)
            items = copy.deepcopy(current.items)
            for item in items:
                item.update(
                    status="done"
                    if status == "completed"
                    else "cancelled"
                    if status == "cancelled"
                    else "error",
                    message=message,
                )
            current.items, current.status, current.updated_at = items, status, time.time()
            db.commit()
