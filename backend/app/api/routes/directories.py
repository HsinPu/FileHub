from fastapi import APIRouter, Depends, Query, Request

from backend.app.api.dependencies import administrator, current_user
from backend.app.models.user import User
from backend.app.schemas.directories import DirectoryCreate, DirectoryUpdate
from backend.app.services.access import scoped
from backend.app.services.directories import inspect_directory

router = APIRouter(prefix="/admin", tags=["directories"], dependencies=[Depends(administrator)])


@router.get("/directories")
def listing(request: Request):
    return request.app.state.directory_registry.inventory()


@router.post("/directories", status_code=201)
def create(data: DirectoryCreate, request: Request, actor: User = Depends(administrator)):
    return request.app.state.directory_registry.create(data, actor.id)


@router.patch("/directories/{directory_id}")
def update(directory_id: str, data: DirectoryUpdate, request: Request, actor: User = Depends(administrator)):
    return request.app.state.directory_registry.update(directory_id, data, actor.id)


@router.get("/directories/{directory_id}/impact")
def impact(directory_id: str, request: Request):
    return request.app.state.directory_registry.impact(directory_id)


@router.get("/directory-browser")
def browse(request: Request, path: str = Query("", max_length=4096)):
    return request.app.state.directory_registry.browse(path)


@router.get("/directory-status")
def status(request: Request, path: str = Query("", max_length=4096)):
    request.app.state.files.resolve(path)
    return inspect_directory(request.app.state.files, path)


user_router = APIRouter(tags=["directories"], dependencies=[Depends(current_user)])


@user_router.get("/directories")
def accessible_directories(request: Request):
    return {"items": scoped(request, "browse").directory_entries()}
