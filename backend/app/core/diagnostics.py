"""Request diagnostics without URLs, credentials, payloads or filesystem paths."""
import logging
import time
from uuid import uuid4

from fastapi import FastAPI, Request

log = logging.getLogger("uvicorn.error")


def install_diagnostics(app: FastAPI):
    @app.middleware("http")
    async def request_diagnostics(request: Request, call_next):
        if not request.url.path.startswith("/api"):
            return await call_next(request)
        request.state.request_id = uuid4().hex
        request.state.error_category = "none"
        started = time.perf_counter()
        status = 500
        try:
            response = await call_next(request)
            status = response.status_code
            response.headers["X-Request-ID"] = request.state.request_id
            return response
        except Exception as exc:
            request.state.error_category = type(exc).__name__
            raise
        finally:
            route = request.scope.get("route")
            operation = getattr(route, "name", "unmatched")
            category = request.state.error_category
            if category == "none" and status >= 400:
                category = "HTTPError"
            log.info(
                "request_id=%s operation=%s status=%s duration_ms=%.2f error=%s",
                request.state.request_id, operation, status,
                (time.perf_counter() - started) * 1000, category,
            )
