from datetime import datetime, timedelta
from typing import Optional, Any, Union
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.models.user import User, SessionLocal
import os

# 配置加密環境
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT 配置
# 注意：在生產環境中應從環境變數讀取
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-for-files-app-auth-12345678")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # Token 有效期 24 小時

# 定義 Token 取得路徑
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

def get_password_hash(password: str) -> str:
    """
    對密碼進行雜湊處理
    """
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    驗證密碼是否正確
    """
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    建立 JWT 存取權杖
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# 取得資料庫會話的依賴項
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """
    驗證當前 Token 並取得使用者資訊的依賴項
    """
    from app.utils.log_utils import logger
    
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="無法驗證身分憑證",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        # 加入調試日誌
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            logger.warning("Token 中找不到 sub 欄位")
            raise credentials_exception
    except JWTError as e:
        logger.warning(f"JWT 解碼失敗: {str(e)}")
        raise credentials_exception
    
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        logger.warning(f"找不到 Token 對應的使用者: {username}")
        raise credentials_exception
    return user
