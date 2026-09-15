import logging
from contextlib import asynccontextmanager
from urllib.parse import urlsplit

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool
from starlette.exceptions import HTTPException

from backend.app.api.routes import accounts, auth, files, operations, shares, trash
from backend.app.core.config import PROJECT_ROOT, Settings
from backend.app.core.errors import AppError
from backend.app.core.security import LoginLimiter
from backend.app.db.session import open_database
from backend.app.services.directories import definitions
from backend.app.services.files import FileService
from backend.app.services.operations import OperationService


def error_response(status: int, code: str, message: str):
    return JSONResponse(
        status_code=status,
        content={"error": {"code": code, "message": message}},
        headers={"Cache-Control": "no-store"},
    )


def create_app(settings: Settings | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        config = settings or Settings.from_env()
        protected = tuple(
            PROJECT_ROOT / name
            for name in (
                ".git",
                ".env",
                "config",
                "backend",
                "app",
                "database",
                "logs",
                ".venv",
                ".SymbolLattice",
                "frontend",
            )
        ) + (config.database_path, config.database_path.parent / "archives")
        app.state.files = FileService(config.files_root, protected)
        app.state.directories = definitions(app.state.files, config.directories_json)
        app.state.files.deployment_roots = tuple(
            app.state.files.resolve(entry.path) for entry in app.state.directories
        )
        app.state.files.directory_catalog = {entry.id: entry.path for entry in app.state.directories}
        app.state.settings = config
        app.state.engine, app.state.session_factory = open_database(config.database_path)
        app.state.login_limiter = LoginLimiter()
        app.state.share_limiter = LoginLimiter()
        app.state.operations = OperationService(
            app.state.files, app.state.session_factory, config.database_path.parent / "archives"
        )
        try:
            yield
        finally:
            await run_in_threadpool(app.state.operations.close)
            app.state.engine.dispose()

    app = FastAPI(title="FileHub", version="2.0.0", lifespan=lifespan)

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        if request.url.path.startswith("/api") and request.method in {"POST", "PUT", "PATCH", "DELETE"}:
            origin = request.headers.get("origin")
            expected = urlsplit(str(request.base_url))
            supplied = urlsplit(origin) if origin else None
            if request.headers.get("x-requested-with") != "Files-App" or (
                supplied and (supplied.scheme, supplied.netloc) != (expected.scheme, expected.netloc)
            ):
                return error_response(403, "INVALID_ORIGIN", "請由本站介面發送操作。")
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "same-origin"
        if request.url.path.startswith("/api"):
            response.headers["Cache-Control"] = "no-store"
        else:
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
            )
        return response

    @app.exception_handler(AppError)
    async def application_error(request, exc):
        return error_response(exc.status, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        return error_response(422, "VALIDATION_ERROR", "輸入格式不正確，請檢查欄位長度與內容。")

    @app.exception_handler(Exception)
    async def unexpected_error(request, exc):
        logging.getLogger(__name__).error("Request failed: %s", type(exc).__name__)
        return error_response(500, "INTERNAL_ERROR", "伺服器暫時無法處理要求，請稍後重試。")

    @app.exception_handler(HTTPException)
    async def http_error(request, exc):
        return error_response(
            exc.status_code,
            "HTTP_ERROR",
            "找不到要求的資源。" if exc.status_code == 404 else "無法處理此請求。",
        )

    @app.exception_handler(OSError)
    async def filesystem_error(request, exc):
        if isinstance(exc, PermissionError):
            return error_response(403, "PERMISSION_DENIED", "沒有存取此檔案或資料夾的權限。")
        if isinstance(exc, FileNotFoundError):
            return error_response(404, "NOT_FOUND", "檔案或資料夾已不存在。")
        logging.getLogger(__name__).error("Filesystem operation failed: %s", type(exc).__name__)
        return error_response(500, "FILESYSTEM_ERROR", "檔案操作失敗，請稍後重試。")

    app.include_router(auth.router, prefix="/api/v1")
    app.include_router(accounts.router, prefix="/api/v1")
    app.include_router(shares.router, prefix="/api/v1")
    app.include_router(files.router, prefix="/api/v1")
    app.include_router(operations.router, prefix="/api/v1")
    app.include_router(trash.router, prefix="/api/v1")

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    dist = settings.frontend_dist if settings else PROJECT_ROOT / "frontend/dist"
    app.mount("/assets", StaticFiles(directory=str(dist / "assets"), check_dir=False), name="assets")
    app.mount("/pdfjs", StaticFiles(directory=str(dist / "pdfjs"), check_dir=False), name="pdfjs")

    @app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str):
        if path == "api" or path.startswith("api/"):
            raise HTTPException(404)
        if path not in {"", "files", "login", "admin", "share", "shares", "trash", "settings/profile", "settings/security", "settings/accounts", "settings/directories"}:
            raise HTTPException(404)
        if not (dist / "index.html").is_file():
            return error_response(503, "FRONTEND_NOT_BUILT", "前端尚未建置，請先執行 npm run build。")
        return FileResponse(dist / "index.html", headers={"Cache-Control": "no-cache"})

    return app


app = create_app()
