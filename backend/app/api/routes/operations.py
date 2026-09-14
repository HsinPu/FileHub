from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import FileResponse

from backend.app.api.dependencies import current_user
from backend.app.models.user import User
from backend.app.schemas.operations import OperationRequest, OperationResult
from backend.app.services.access import job_result, require, submit_job

router = APIRouter(prefix="/files/operations", tags=["operations"])


@router.post("", response_model=OperationResult, status_code=202)
def submit(data: OperationRequest, request: Request, user: User = Depends(current_user)):
    return submit_job(request, user.id, data)


@router.get("", response_model=list[OperationResult])
def history(request: Request, offset: int = Query(0, ge=0), user: User = Depends(current_user)):
    return [
        job_result(request.app.state.files, request.state.access, job)
        for job in request.app.state.operations.list(user.id, offset)
    ]


@router.get("/{job_id}", response_model=OperationResult)
def detail(job_id: str, request: Request, user: User = Depends(current_user)):
    return job_result(
        request.app.state.files, request.state.access, request.app.state.operations.get(job_id, user.id)
    )


@router.post("/{job_id}/cancel", response_model=OperationResult)
def cancel(job_id: str, request: Request, user: User = Depends(current_user)):
    request.app.state.operations.get(job_id, user.id)
    return job_result(
        request.app.state.files, request.state.access, request.app.state.operations.cancel(job_id, user.id)
    )


@router.get("/{job_id}/archive")
@router.head("/{job_id}/archive")
def archive(job_id: str, request: Request, user: User = Depends(current_user)):
    operations = request.app.state.operations
    require(request.state.access, "read")
    path = operations.archives.download(operations, job_id, user.id)
    return FileResponse(path, media_type="application/zip", filename=f"Files-{job_id[:8]}.zip")
