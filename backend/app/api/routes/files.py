from types import SimpleNamespace

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import FileResponse
from starlette.requests import ClientDisconnect

from backend.app.api.dependencies import current_user
from backend.app.core.errors import AppError
from backend.app.models.user import User
from backend.app.schemas.files import CreateDirectory, DirectoryListing, FileEntry, FilePreview, RenameEntry
from backend.app.services.access import scoped
from backend.app.services.files import IMAGE_TYPES
from backend.app.services.folder_uploads import FolderUploadRequest, prepare
from backend.app.services.transfers import rename_entry, upload_stream

router = APIRouter(prefix="/files", tags=["files"], dependencies=[Depends(current_user)])


@router.get("/image")
@router.head("/image")
def image(request: Request, path: str = Query(..., min_length=1, max_length=4096)):
    target = scoped(request, "read").resolve(path)
    if not target.is_file():
        raise AppError(404, "NOT_FOUND", "找不到圖片。")
    mime = IMAGE_TYPES.get(target.suffix.lower().lstrip("."))
    if not mime:
        raise AppError(415, "UNSUPPORTED_TYPE", "不支援此圖片格式。")
    if target.stat().st_size > 10 * 1024 * 1024:
        raise AppError(413, "PREVIEW_TOO_LARGE", "圖片預覽上限為 10 MB。")
    return FileResponse(
        target,
        media_type=mime,
        headers={"Content-Security-Policy": "sandbox; default-src 'none'", "Cache-Control": "no-store"},
    )


@router.get("/pdf")
@router.head("/pdf")
def pdf(request: Request, path: str = Query(..., min_length=1, max_length=4096)):
    target = scoped(request, "read").resolve(path)
    if not target.is_file():
        raise AppError(404, "NOT_FOUND", "找不到 PDF。")
    if target.suffix.lower() != ".pdf":
        raise AppError(415, "UNSUPPORTED_TYPE", "請選擇 PDF 檔案。")
    if target.stat().st_size > 50 * 1024 * 1024:
        raise AppError(413, "PREVIEW_TOO_LARGE", "PDF 預覽上限為 50 MB。")
    with target.open("rb") as stream:
        if stream.read(5) != b"%PDF-":
            raise AppError(415, "INVALID_PDF", "檔案不是有效的 PDF。")
    return FileResponse(
        target, media_type="application/pdf", filename=target.name, headers={"Cache-Control": "no-store"}
    )


@router.post("/upload-batch")
def prepare_upload(data: FolderUploadRequest, request: Request, user: User = Depends(current_user)):
    operations = request.app.state.operations
    service = scoped(request, "upload")
    # Include scope/version in the idempotency payload so old mappings cannot cross scopes.
    return prepare(
        SimpleNamespace(files=service, factory=operations.factory, destination=operations.destination),
        user.id,
        data,
    )


@router.get("", response_model=DirectoryListing)
def list_files(request: Request, path: str = Query("", max_length=4096)):
    return scoped(request, "browse").list_directory(path)


@router.get("/capabilities")
def capabilities(request: Request, path: str = Query("", max_length=4096)):
    files = scoped(request, "browse")
    return {"path": path, "permissions": files.capabilities(path), **files.navigation(path)}


@router.get("/tree", response_model=DirectoryListing)
def tree(request: Request, path: str = Query("", max_length=4096)):
    return scoped(request, "browse").list_directory(path, directories_only=True)


@router.get("/content", response_model=FilePreview)
def content(request: Request, path: str = Query(..., min_length=1, max_length=4096)):
    return scoped(request, "read").preview(path)


@router.post("/directory", response_model=FileEntry, status_code=201)
def create_directory(data: CreateDirectory, request: Request):
    return scoped(request, "upload").create_directory(data.path, data.name)


@router.patch("/rename", response_model=FileEntry)
def rename(data: RenameEntry, request: Request):
    return rename_entry(scoped(request, "modify"), data.path, data.name)


@router.get("/download")
@router.head("/download")
def download(request: Request, path: str = Query(..., min_length=1, max_length=4096)):
    target = scoped(request, "read").resolve(path)
    if not target.is_file():
        raise AppError(404, "NOT_FOUND", "找不到可下載的檔案。")
    return FileResponse(
        target,
        filename=target.name,
        media_type="application/octet-stream",
        content_disposition_type="attachment",
    )


@router.post("/upload", response_model=FileEntry, status_code=201)
async def upload(
    request: Request,
    path: str = Query("", max_length=4096),
    name: str = Query(..., min_length=1, max_length=255),
):
    length = request.headers.get("content-length")
    try:
        expected = int(length) if length is not None else None
        if expected is not None and expected < 0:
            raise ValueError
    except ValueError:
        raise AppError(400, "INVALID_SIZE", "檔案大小不正確。") from None
    try:
        return await upload_stream(scoped(request, "upload"), path, name, request.stream(), expected)
    except ClientDisconnect:
        raise AppError(400, "UPLOAD_CANCELLED", "傳輸已中斷。") from None
