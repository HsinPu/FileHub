from typing import Optional
from fastapi import HTTPException
from app.services.file_service import FileService


class FileController:
    """檔案控制器，處理檔案相關的 API 請求"""
    
    def __init__(self):
        """初始化控制器，建立 FileService 實例"""
        self.file_service = FileService()
    
    def get_file_list(self, path: Optional[str] = None) -> dict:
        """
        取得檔案列表
        
        Args:
            path: 相對路徑，預設為 None（根目錄）
            
        Returns:
            包含路徑和檔案列表的字典
            
        Raises:
            HTTPException: 如果發生錯誤
        """
        try:
            if path is None:
                path = ""
            
            result = self.file_service.get_file_list(path)
            return result
            
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except PermissionError as e:
            raise HTTPException(status_code=403, detail=f"沒有讀取權限: {str(e)}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"伺服器錯誤: {str(e)}")
    
    def get_file_tree(self, path: Optional[str] = None, max_depth: int = 10) -> dict:
        """
        取得檔案樹狀結構
        
        Args:
            path: 相對路徑，預設為 None（根目錄）
            max_depth: 最大深度，預設為 10
            
        Returns:
            檔案樹狀結構字典
            
        Raises:
            HTTPException: 如果發生錯誤
        """
        try:
            if path is None:
                path = ""
            
            result = self.file_service.get_file_tree(path, max_depth)
            return result
            
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"伺服器錯誤: {str(e)}")
    
    def create_directory(self, path: Optional[str] = None, name: str = "") -> dict:
        """
        建立新資料夾
        
        Args:
            path: 相對路徑，預設為 None（根目錄）
            name: 資料夾名稱
            
        Returns:
            包含成功訊息和路徑的字典
            
        Raises:
            HTTPException: 如果發生錯誤
        """
        try:
            if path is None:
                path = ""
            
            result = self.file_service.create_directory(path, name)
            return result
            
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except FileExistsError as e:
            raise HTTPException(status_code=409, detail=str(e))
        except PermissionError as e:
            raise HTTPException(status_code=403, detail=f"沒有寫入權限: {str(e)}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"伺服器錯誤: {str(e)}")
    
    def get_file_content(self, path: str) -> dict:
        """
        取得檔案內容
        
        Args:
            path: 檔案相對路徑
            
        Returns:
            包含檔案內容、類型、大小等資訊的字典
            
        Raises:
            HTTPException: 如果發生錯誤
        """
        try:
            result = self.file_service.get_file_content(path)
            return result
            
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except PermissionError as e:
            raise HTTPException(status_code=403, detail=f"沒有讀取權限: {str(e)}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"伺服器錯誤: {str(e)}")
