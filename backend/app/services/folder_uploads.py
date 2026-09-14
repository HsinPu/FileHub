import json
from pathlib import PurePosixPath
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from backend.app.core.errors import AppError
from backend.app.models.upload import UploadBatch
from backend.app.services.transfers import MAX_UPLOAD_BYTES, MUTATION_LOCK, validate_name


class UploadEntry(BaseModel):
    path: str = Field(min_length=1, max_length=4096)
    size: int | None = Field(default=None, ge=0, le=MAX_UPLOAD_BYTES)


class FolderUploadRequest(BaseModel):
    request_id: UUID
    destination: str = Field(default="", max_length=4096)
    conflict: Literal["skip", "keep_both"] = "skip"
    entries: list[UploadEntry] = Field(min_length=1, max_length=1000)


def prepare(operations, user_id, data):
    files = operations.files
    payload = json.dumps(
        {
            **data.model_dump(mode="json"),
            "scope": str(files.root),
            "version": getattr(files, "version", None),
        },
        sort_keys=True,
        ensure_ascii=False,
    )
    # Namespace idempotency keys by authenticated owner.
    key = f"{user_id}:{data.request_id}"
    with MUTATION_LOCK, operations.factory() as db:
        batch = db.get(UploadBatch, key)
        if batch:
            if batch.payload != payload or batch.status != "ready":
                raise AppError(409, "BATCH_CONFLICT", "此批次內容不同或曾中斷，請重新選取並確認目錄狀態。")
            return {"entries": batch.entries}
        parent = files.resolve(data.destination)
        if not parent.is_dir():
            raise AppError(404, "NOT_FOUND", "目的資料夾不存在。")
        if sum(entry.size or 0 for entry in data.entries) > 5 * 1024**3:
            raise AppError(413, "BATCH_TOO_LARGE", "單批資料夾上傳上限為 5 GB。")
        nodes = {}
        submitted = set()
        for entry in data.entries:
            if entry.path.casefold() in submitted:
                raise AppError(409, "DUPLICATE_PATH", "清單包含重複路徑，請重新選取。")
            submitted.add(entry.path.casefold())
            parts = entry.path.split("/")
            if len(parts) > 32:
                raise AppError(400, "TOO_DEEP", "資料夾最多 32 層。")
            for part in parts:
                validate_name(part)
            # Casefold avoids ambiguous manifests on Windows mounts.
            for index in range(1, len(parts) + 1):
                path = "/".join(parts[:index])
                kind = "file" if index == len(parts) and entry.size is not None else "directory"
                previous = nodes.get(path.casefold())
                if previous and previous != (path, kind):
                    raise AppError(409, "AMBIGUOUS_PATH", "清單包含大小寫衝突或檔案與資料夾同名。")
                nodes[path.casefold()] = (path, kind)
        if len(nodes) > 2000:
            raise AppError(413, "TOO_MANY_ENTRIES", "目錄結構過大，請分批上傳。")
        roots = {path.split("/")[0] for path, _ in nodes.values()}
        mappings = {name: operations.destination(parent, name, data.conflict) for name in sorted(roots)}
        # Reject any overlapping mapping before creating directories.
        targets = [str(path).casefold() for path in mappings.values() if path is not None]
        if len(set(targets)) != len(targets):
            raise AppError(409, "AMBIGUOUS_TARGET", "根目錄的副本名稱衝突，請分批上傳。")
        entries = []
        for entry in data.entries:
            parts = entry.path.split("/")
            root = mappings[parts[0]]
            target = root.joinpath(*parts[1:]) if root is not None else None
            entries.append(
                {
                    "source": entry.path,
                    "target": target.relative_to(files.root).as_posix() if target else None,
                    "status": "ready" if target else "skipped",
                }
            )
        batch = UploadBatch(id=key, user_id=user_id, payload=payload, status="preparing", entries=entries)
        db.add(batch)
        db.commit()
        for path, kind in sorted(nodes.values(), key=lambda node: len(PurePosixPath(node[0]).parts)):
            if kind != "directory":
                continue
            parts = path.split("/")
            root = mappings[parts[0]]
            if root is not None:
                target = root.joinpath(*parts[1:])
                files.resolve(target.relative_to(files.root).as_posix())
                target.mkdir()  # Never merge into an unplanned existing directory.
        batch.status = "ready"
        db.commit()
        return {"entries": entries}
