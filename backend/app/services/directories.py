"""Read-only deployment inventory; this catalog does not grant account access."""

import json
import os
from datetime import UTC, datetime

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from backend.app.core.errors import AppError


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


def inventory(files, entries):
    return {
        "root": str(files.root),
        "checked_at": datetime.now(UTC).isoformat(),
        "items": [
            {"id": "root", "name": "所有檔案", **inspect_directory(files, "")},
            *[
                {"id": entry.id, "name": entry.name, **inspect_directory(files, entry.path)}
                for entry in entries
            ],
        ],
    }
