import base64
import re
import stat
import subprocess
from datetime import UTC, datetime
from pathlib import Path, PureWindowsPath

from backend.app.core.errors import AppError
from backend.app.schemas.files import DirectoryListing, FileEntry, FilePreview
from backend.app.services.transfers import MUTATION_LOCK, TEMP_PREFIX, TRASH_PREFIX, validate_name

TEXT_EXTENSIONS = set(
    "txt json py js html css md yml yaml xml csv log sh bat conf config ini env properties sql java cpp c h hpp php rb go rs swift kt scala ts tsx jsx vue svelte dart lua pl r m mm cxx cc asm s".split()
)
IMAGE_TYPES = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "gif": "image/gif",
    "bmp": "image/bmp",
    "svg": "image/svg+xml",
    "webp": "image/webp",
    "ico": "image/x-icon",
    "tiff": "image/tiff",
    "tif": "image/tiff",
    "heic": "image/heic",
    "heif": "image/heif",
}
MAX_PREVIEW_BYTES = 10 * 1024 * 1024


class FileService:
    def __init__(self, root: Path, protected: tuple[Path, ...] = ()):
        self.root = root.resolve()
        for private in protected:
            private = private.resolve()
            if self.root.is_relative_to(private) or private.is_relative_to(self.root):
                raise ValueError("FILES_ROOT 不能包含應用程式、設定或帳號資料庫目錄。")
        self.root.mkdir(parents=True, exist_ok=True)

    def resolve(self, path: str) -> Path:
        if (
            "\\" in path
            or PureWindowsPath(path).drive
            or path.startswith("/")
            or "\x00" in path
            or ".." in path.split("/")
            or ":" in path
            or any(part.casefold().startswith((TEMP_PREFIX, TRASH_PREFIX)) for part in path.split("/"))
        ):
            raise AppError(400, "INVALID_PATH", "請使用檔案根目錄內的相對路徑。")
        candidate = self.root / path
        # Reject symlinks/junctions entirely: listing never follows an external tree.
        current = self.root
        for part in Path(path).parts:
            current = current / part
            if current.is_symlink() or (hasattr(current, "is_junction") and current.is_junction()):
                raise AppError(403, "LINK_NOT_ALLOWED", "不允許存取連結目錄或符號連結。")
            if current.exists() and getattr(current.lstat(), "st_file_attributes", 0) & 0x400:
                raise AppError(403, "LINK_NOT_ALLOWED", "不允許存取重新解析點。")
        resolved = candidate.resolve()
        if not resolved.is_relative_to(self.root):
            raise AppError(403, "OUTSIDE_ROOT", "無法存取根目錄以外的檔案。")
        return resolved

    def assert_movable(self, target: Path):
        base = getattr(self, "base", self)
        if target.is_mount() or any(
            root == target or root.is_relative_to(target)
            for root in getattr(base, "deployment_roots", ())
        ):
            raise AppError(400, "MOUNT_ROOT", "不能重新命名、搬移或刪除部署目錄；請進入目錄操作檔案。")

    def entry(self, path: Path) -> FileEntry:
        info = path.stat()
        directory = stat.S_ISDIR(info.st_mode)
        born = getattr(info, "st_birthtime", None)
        if born is None:
            try:
                result = subprocess.run(
                    ["stat", "--format=%W", "--", str(path)],
                    capture_output=True, text=True, timeout=1, check=True,
                )
                born = int(result.stdout.strip()) or None
            except (OSError, ValueError, subprocess.SubprocessError):
                born = None
        return FileEntry(
            name=path.name,
            path=path.relative_to(self.root).as_posix(),
            type="directory" if directory else "file",
            size=None if directory else info.st_size,
            modified=datetime.fromtimestamp(info.st_mtime, UTC).isoformat(),
            created=datetime.fromtimestamp(born, UTC).isoformat() if born else None,
        )

    def list_directory(self, path: str = "", directories_only: bool = False) -> DirectoryListing:
        target = self.resolve(path)
        if not target.exists():
            raise AppError(404, "NOT_FOUND", "資料夾不存在。")
        if not target.is_dir():
            raise AppError(400, "NOT_DIRECTORY", "指定路徑不是資料夾。")
        entries = []
        for item in target.iterdir():
            try:
                safe = self.resolve(item.relative_to(self.root).as_posix())
                if not safe.is_dir() and not safe.is_file():
                    continue
                if not directories_only or safe.is_dir():
                    entries.append(self.entry(safe))
            except (AppError, OSError):
                continue
        entries.sort(key=lambda entry: (entry.type != "directory", entry.name.casefold()))
        return DirectoryListing(
            path="" if target == self.root else target.relative_to(self.root).as_posix(), entries=entries
        )

    def create_directory(self, path: str, name: str) -> FileEntry:
        validate_name(name)
        if (
            name != name.strip()
            or name in {".", ".."}
            or not name
            or name.endswith(".")
            or re.search(r'[<>:"/\\|?*\x00-\x1f]', name)
        ):
            raise AppError(400, "INVALID_NAME", "名稱不可包含路徑符號、控制字元或前後空白與結尾句點。")
        if name.split(".")[0].upper() in {
            "CON",
            "PRN",
            "AUX",
            "NUL",
            *(f"COM{i}" for i in range(1, 10)),
            *(f"LPT{i}" for i in range(1, 10)),
        }:
            raise AppError(400, "INVALID_NAME", "此名稱是作業系統保留名稱。")
        parent = self.resolve(path)
        if not parent.is_dir():
            raise AppError(404, "NOT_FOUND", "父資料夾不存在。")
        child = self.resolve(f"{path}/{name}" if path else name)
        try:
            with MUTATION_LOCK:
                self.resolve(path)
                child = self.resolve(f"{path}/{name}" if path else name)
                child.mkdir()
        except FileExistsError:
            raise AppError(409, "ALREADY_EXISTS", "同名檔案或資料夾已存在。") from None
        return self.entry(child)

    def preview(self, path: str) -> FilePreview:
        target = self.resolve(path)
        if not target.exists():
            raise AppError(404, "NOT_FOUND", "檔案不存在。")
        if not target.is_file():
            raise AppError(400, "NOT_FILE", "指定路徑不是一般檔案。")
        suffix = target.suffix.lower().lstrip(".")
        if suffix not in TEXT_EXTENSIONS and suffix not in IMAGE_TYPES:
            raise AppError(415, "UNSUPPORTED_PREVIEW", "此檔案格式不支援預覽。")
        if target.stat().st_size > MAX_PREVIEW_BYTES:
            raise AppError(413, "PREVIEW_TOO_LARGE", "預覽上限為 10 MB。")
        with target.open("rb") as stream:
            raw = stream.read(MAX_PREVIEW_BYTES + 1)
        if len(raw) > MAX_PREVIEW_BYTES:
            raise AppError(413, "PREVIEW_TOO_LARGE", "預覽上限為 10 MB。")
        if suffix in IMAGE_TYPES:
            content, kind, mime = base64.b64encode(raw).decode("ascii"), "image", IMAGE_TYPES[suffix]
        else:
            content = None
            for encoding in ("utf-8-sig", "cp950"):
                try:
                    content = raw.decode(encoding)
                    break
                except UnicodeDecodeError:
                    pass
            if content is None:
                raise AppError(415, "UNSUPPORTED_ENCODING", "文字編碼不支援，請使用 UTF-8 或 Big5。")
            kind, mime = "text", "text/plain"
        return FilePreview(
            name=target.name,
            path=target.relative_to(self.root).as_posix(),
            type=kind,
            size=len(raw),
            content=content,
            mime_type=mime,
        )
