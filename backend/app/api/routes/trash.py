from fastapi import APIRouter, Depends, Query, Request

from backend.app.api.dependencies import current_user
from backend.app.core.errors import AppError
from backend.app.models.user import User
from backend.app.schemas.operations import OperationRequest, OperationResult, RestoreRequest, TrashResult
from backend.app.services.access import granted_roots, is_multiple, local_path, require, submit_job

router = APIRouter(prefix="/trash", tags=["trash"])


@router.get("", response_model=list[TrashResult])
def listing(request: Request, offset: int = Query(0, ge=0), user: User = Depends(current_user)):
    access = request.state.access
    require(access, "browse")
    values = []
    for record in request.app.state.operations.trash.list(
        offset,
        owner=user.username if access.role != "admin" else None,
        root=access.root if access.role != "admin" and not is_multiple(access) else None,
        roots=granted_roots(request.app.state.files, access) if is_multiple(access) else None,
    ):
        if access.role != "admin" and record["deleted_by"] != user.username:
            continue
        try:
            record["original_path"] = local_path(request.app.state.files, access, record["original_path"])
            values.append(record)
        except AppError:
            continue
    return values


@router.post("/restore", response_model=OperationResult, status_code=202)
def restore(data: RestoreRequest, request: Request, user: User = Depends(current_user)):
    return submit_job(
        request,
        user.id,
        OperationRequest(
            kind="restore",
            paths=[item.hex for item in data.ids],
            destination=data.destination,
            conflict=data.conflict,
            request_id=data.request_id,
        ),
    )
