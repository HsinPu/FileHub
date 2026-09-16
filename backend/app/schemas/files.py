from typing import Literal

from pydantic import BaseModel, Field


class FileEntry(BaseModel):
    name: str
    path: str
    type: Literal["directory", "file"]
    size: int | None
    modified: str | None
    directory_id: str | None = None
    directory_root: bool = False
    status: Literal["readable", "missing", "not_directory", "unavailable"] = "readable"
    created: str | None = None


class Breadcrumb(BaseModel):
    name: str
    path: str


class DirectoryNavigation(BaseModel):
    directory_id: str | None = None
    scope_path: str = ""
    scope_name: str = ""
    parent_path: str | None = None
    breadcrumbs: list[Breadcrumb] = Field(default_factory=list)


class DirectoryListing(DirectoryNavigation):
    path: str
    entries: list[FileEntry]
    permissions: list[str] = Field(default_factory=list)


class CreateDirectory(BaseModel):
    path: str = Field(default="", max_length=4096)
    name: str = Field(min_length=1, max_length=255)


class FilePreview(BaseModel):
    name: str
    path: str
    type: Literal["text", "image"]
    size: int
    content: str
    mime_type: str


class RenameEntry(BaseModel):
    path: str = Field(min_length=1, max_length=4096)
    name: str = Field(min_length=1, max_length=255)
