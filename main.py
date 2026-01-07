from fastapi import FastAPI, Request, Query
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from typing import Optional
import os

# 建立 FastAPI 應用
app = FastAPI(title="Files-App", description="檔案管理系統")

# 設定靜態檔案目錄
app.mount("/static", StaticFiles(directory="app/static"), name="static")

# 設定模板目錄
templates = Jinja2Templates(directory="app/templates")

# 匯入 Controller
from app.controller.v1.file_controller import FileController

# 建立 Controller 實例
file_controller = FileController()


# Pydantic 模型
class CreateDirectoryRequest(BaseModel):
    path: Optional[str] = None
    name: str


@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    """首頁"""
    return templates.TemplateResponse("pages/home.html", {"request": request})


@app.get("/files", response_class=HTMLResponse)
async def file_list(request: Request):
    """檔案列表頁面"""
    return templates.TemplateResponse("pages/file_list.html", {"request": request})


@app.get("/files/{file_id}", response_class=HTMLResponse)
async def file_detail(request: Request, file_id: str):
    """檔案詳情頁面"""
    return templates.TemplateResponse("pages/file_detail.html", {"request": request})


# API v1 端點
@app.get("/api/v1/files")
async def api_get_file_list(path: Optional[str] = Query(None, description="相對路徑")):
    """
    取得檔案列表 API
    
    Args:
        path: 相對路徑，預設為根目錄
        
    Returns:
        JSON 格式的檔案列表
    """
    result = file_controller.get_file_list(path)
    return JSONResponse(content=result)


@app.get("/api/v1/files/tree")
async def api_get_file_tree(
    path: Optional[str] = Query(None, description="相對路徑"),
    max_depth: int = Query(10, description="最大深度", ge=1, le=20)
):
    """
    取得檔案樹狀結構 API
    
    Args:
        path: 相對路徑，預設為根目錄
        max_depth: 最大深度，預設為 10
        
    Returns:
        JSON 格式的檔案樹狀結構
    """
    result = file_controller.get_file_tree(path, max_depth)
    return JSONResponse(content=result)


@app.post("/api/v1/files/directory")
async def api_create_directory(request: CreateDirectoryRequest):
    """
    建立新資料夾 API
    
    Args:
        request: 包含路徑和資料夾名稱的請求體
        
    Returns:
        JSON 格式的建立結果
    """
    result = file_controller.create_directory(request.path, request.name)
    return JSONResponse(content=result)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
