from fastapi import FastAPI, Request, Query
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from typing import Optional
import os
from app.utils.log_utils import logger
from app.models.user import init_db, User
from app.utils.auth_utils import (
    get_password_hash, verify_password, create_access_token, 
    get_current_user, get_db
)
from sqlalchemy.orm import Session
from fastapi import Depends, HTTPException, status, Form

# 建立 FastAPI 應用
app = FastAPI(title="Files-App", description="檔案管理系統")

@app.on_event("startup")
async def startup_event():
    logger.info("Files-App 啟動中...")
    # 初始化資料庫
    init_db()
    logger.info("資料庫初始化完成")

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

class UserRegister(BaseModel):
    username: str
    password: str
    full_name: Optional[str] = None

class Token(BaseModel):
    access_token: str
    token_type: str

class PasswordUpdate(BaseModel):
    new_password: str


@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    """首頁"""
    return templates.TemplateResponse("pages/home.html", {"request": request})


@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    """登入頁面"""
    return templates.TemplateResponse("pages/login.html", {"request": request})


@app.get("/files", response_class=HTMLResponse)
async def file_list(request: Request):
    """檔案列表頁面"""
    return templates.TemplateResponse("pages/file_list.html", {"request": request})


@app.get("/files/{file_id}", response_class=HTMLResponse)
async def file_detail(request: Request, file_id: str):
    """檔案詳情頁面"""
    return templates.TemplateResponse("pages/file_detail.html", {"request": request})


# API v1 驗證端點
@app.post("/api/v1/auth/register", response_model=dict)
async def register(user_data: UserRegister, db: Session = Depends(get_db)):
    """註冊新使用者"""
    db_user = db.query(User).filter(User.username == user_data.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="該帳號已被註冊")
    
    hashed_password = get_password_hash(user_data.password)
    new_user = User(
        username=user_data.username,
        hashed_password=hashed_password,
        full_name=user_data.full_name
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    logger.info(f"新使用者註冊成功: {new_user.username}")
    return {"message": "註冊成功"}

@app.post("/api/v1/auth/login", response_model=Token)
async def login(username: str = Form(...), password: str = Form(...), db: Session = Depends(get_db)):
    """登入並取得 Token"""
    user = db.query(User).filter(User.username == username).first()
    if not user or not verify_password(password, user.hashed_password):
        logger.warning(f"登入失敗嘗試: {username}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="帳號或密碼錯誤",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(data={"sub": user.username})
    logger.info(f"使用者登入成功: {username}")
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/v1/auth/me")
async def read_users_me(current_user: User = Depends(get_current_user)):
    """取得當前使用者資訊"""
    return {
        "username": current_user.username,
        "full_name": current_user.full_name
    }

@app.put("/api/v1/auth/password")
async def update_password(data: PasswordUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """更新使用者密碼"""
    if len(data.new_password) < 8:
        raise HTTPException(status_code=400, detail="新密碼長度至少需要 8 位數")
    
    current_user.hashed_password = get_password_hash(data.new_password)
    db.commit()
    logger.info(f"使用者密碼更新成功: {current_user.username}")
    return {"message": "密碼更新成功"}


# API v1 端點
@app.get("/api/v1/files")
async def api_get_file_list(
    path: Optional[str] = Query(None, description="相對路徑"),
    current_user: User = Depends(get_current_user)
):
    """
    取得檔案列表 API
    
    Args:
        path: 相對路徑，預設為根目錄
        
    Returns:
        JSON 格式的檔案列表
    """
    logger.info(f"API 請求 (用戶: {current_user.username}): 取得檔案列表, 路徑: {path or '根目錄'}")
    result = file_controller.get_file_list(path)
    return JSONResponse(content=result)


@app.get("/api/v1/files/tree")
async def api_get_file_tree(
    path: Optional[str] = Query(None, description="相對路徑"),
    max_depth: int = Query(10, description="最大深度", ge=1, le=20),
    current_user: User = Depends(get_current_user)
):
    """
    取得檔案樹狀結構 API
    
    Args:
        path: 相對路徑，預設為根目錄
        max_depth: 最大深度，預設為 10
        
    Returns:
        JSON 格式的檔案樹狀結構
    """
    logger.info(f"API 請求 (用戶: {current_user.username}): 取得檔案樹狀結構, 路徑: {path or '根目錄'}, 最大深度: {max_depth}")
    result = file_controller.get_file_tree(path, max_depth)
    return JSONResponse(content=result)


@app.post("/api/v1/files/directory")
async def api_create_directory(
    request: CreateDirectoryRequest,
    current_user: User = Depends(get_current_user)
):
    """
    建立新資料夾 API
    
    Args:
        request: 包含路徑和資料夾名稱的請求體
        
    Returns:
        JSON 格式的建立結果
    """
    logger.info(f"API 請求 (用戶: {current_user.username}): 建立資料夾, 路徑: {request.path or '根目錄'}, 名稱: {request.name}")
    result = file_controller.create_directory(request.path, request.name)
    return JSONResponse(content=result)


@app.get("/api/v1/files/content")
async def api_get_file_content(
    path: str = Query(..., description="檔案相對路徑"),
    current_user: User = Depends(get_current_user)
):
    """
    取得檔案內容 API
    
    Args:
        path: 檔案相對路徑
        
    Returns:
        JSON 格式的檔案內容
    """
    logger.info(f"API 請求 (用戶: {current_user.username}): 取得檔案內容, 路徑: {path}")
    result = file_controller.get_file_content(path)
    return JSONResponse(content=result)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
