from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class OperationRequest(BaseModel):
    request_id: UUID
    kind: Literal["copy", "move", "trash", "restore", "archive"]
    paths: list[str] = Field(min_length=1, max_length=100)
    destination: str | None = Field(default="", max_length=4096)
    conflict: Literal["skip", "keep_both"] = "skip"


class OperationItem(BaseModel):
    source: str
    target: str | None = None
    status: str
    message: str = ""
    display_name: str | None = None


class RestoreRequest(BaseModel):
    request_id: UUID
    ids: list[UUID] = Field(min_length=1, max_length=100)
    destination: str | None = Field(default=None, max_length=4096)
    conflict: Literal["skip", "keep_both"] = "skip"


class TrashResult(BaseModel):
    id: str
    original_path: str
    kind: str
    deleted_by: str
    deleted_at: float
    status: str


class OperationResult(BaseModel):
    id: str
    kind: str
    destination: str | None
    conflict: str
    status: str
    cancel_requested: bool
    created_at: float
    updated_at: float
    items: list[OperationItem]
