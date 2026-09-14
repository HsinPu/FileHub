from typing import Literal

from pydantic import BaseModel, Field


class FileEntry(BaseModel):
    name: str
    path: str
    type: Literal["directory", "file"]
    size: int | None
    modified: str
    created: str | None = None


class DirectoryListing(BaseModel):
    path: str
    entries: list[FileEntry]


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
