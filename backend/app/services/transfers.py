"""Streaming uploads and atomic no-clobber renames on Windows/Linux."""

import ctypes
import errno
import os
import re
import sys
import tempfile
from pathlib import Path
from threading import RLock

from starlette.concurrency import run_in_threadpool

from backend.app.core.errors import AppError

TEMP_PREFIX = ".files-app-upload-"
TRASH_PREFIX = ".files-app-trash"
MAX_UPLOAD_BYTES = 512 * 1024 * 1024
MUTATION_LOCK = RLock()


def validate_name(name: str):
    if (
        not name
        or name != name.strip()
        or name in {".", ".."}
        or name.endswith(".")
        or len(name.encode("utf-8")) > 255
        or re.search(r'[<>:"/\\|?*\x00-\x1f]', name)
        or name.casefold().startswith((TEMP_PREFIX, TRASH_PREFIX))
    ):
        raise AppError(400, "INVALID_NAME", "名稱不可包含路徑符號、前後空白、結尾句點或超過 255 位元組。")
    if name.split(".")[0].upper() in {
        "CON",
        "PRN",
        "AUX",
        "NUL",
        *(f"COM{i}" for i in range(1, 10)),
        *(f"LPT{i}" for i in range(1, 10)),
    }:
        raise AppError(400, "INVALID_NAME", "此名稱是作業系統保留名稱。")


def rename_no_replace(source: Path, target: Path):
    with MUTATION_LOCK:
        _rename_no_replace(source, target)


def _rename_no_replace(source: Path, target: Path):
    if sys.platform == "win32":
        os.rename(source, target)  # Windows rename refuses an existing destination.
    elif sys.platform.startswith("linux"):
        libc = ctypes.CDLL(None, use_errno=True)
        renameat2 = libc.renameat2
        renameat2.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
        renameat2.restype = ctypes.c_int
        if renameat2(-100, os.fsencode(source), -100, os.fsencode(target), 1) != 0:
            code = ctypes.get_errno()
            if code in {errno.EINVAL, errno.ENOSYS, errno.EOPNOTSUPP}:
                # Docker Desktop Windows shares may reject RENAME_NOREPLACE.
                # All application publications and mkdir share MUTATION_LOCK.
                # This compatibility path requires the documented single worker
                # and trusted external filesystem writers.
                if os.path.lexists(target):
                    raise FileExistsError(errno.EEXIST, "Destination exists")
                os.rename(source, target)
                return
            raise OSError(code, os.strerror(code))
    else:
        raise AppError(501, "UNSUPPORTED_PLATFORM", "此平台尚不支援安全的重新命名，請使用 Docker。")


def rename_entry(service, path: str, name: str):
    validate_name(name)
    source = service.resolve(path)
    if source == service.root:
        raise AppError(400, "ROOT_RENAME", "不能重新命名根目錄。")
    if not source.exists():
        raise AppError(404, "NOT_FOUND", "檔案或資料夾不存在。")
    target = service.resolve((source.parent.relative_to(service.root) / name).as_posix())
    if source.name == name:
        return service.entry(source)
    try:
        rename_no_replace(source, target)
    except FileExistsError:
        raise AppError(409, "ALREADY_EXISTS", "同名項目已存在，請使用其他名稱。") from None
    return service.entry(target)


async def upload_stream(service, path: str, name: str, chunks, expected_size: int | None):
    validate_name(name)
    parent = service.resolve(path)
    if not parent.is_dir():
        raise AppError(404, "NOT_FOUND", "目的資料夾不存在。")
    target = service.resolve(f"{path}/{name}" if path else name)
    if target.exists():
        raise AppError(409, "ALREADY_EXISTS", "同名項目已存在，請更改檔名後重試。")
    if expected_size is not None and expected_size > MAX_UPLOAD_BYTES:
        raise AppError(413, "UPLOAD_TOO_LARGE", "單檔上傳上限為 512 MB。")
    fd, temporary = tempfile.mkstemp(prefix=TEMP_PREFIX, dir=parent)
    temporary = Path(temporary)
    size = 0
    try:
        with os.fdopen(fd, "wb") as stream:
            async for chunk in chunks:
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise AppError(413, "UPLOAD_TOO_LARGE", "單檔上傳上限為 512 MB。")
                await run_in_threadpool(stream.write, chunk)
            if expected_size is not None and size != expected_size:
                raise AppError(400, "INCOMPLETE_UPLOAD", "上傳未完成，請重試。")
            await run_in_threadpool(stream.flush)
            await run_in_threadpool(os.fsync, stream.fileno())
        # Recheck the destination boundary after a potentially long transfer.
        service.resolve(path)
        target = service.resolve(f"{path}/{name}" if path else name)
        try:
            await run_in_threadpool(rename_no_replace, temporary, target)
        except FileExistsError:
            raise AppError(409, "ALREADY_EXISTS", "上傳期間出現同名項目，原檔案未被覆寫。") from None
        return service.entry(target)
    except OSError as exc:
        if exc.errno == errno.ENOSPC:
            raise AppError(507, "DISK_FULL", "磁碟空間不足，請清出空間後重試。") from None
        raise
    finally:
        temporary.unlink(missing_ok=True)
