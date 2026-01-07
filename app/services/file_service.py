import os
from typing import List, Dict, Optional
from datetime import datetime
from pathlib import Path


class FileService:
    """檔案服務類別，處理檔案系統操作"""
    
    def __init__(self, root_path: Optional[str] = None):
        """
        初始化檔案服務
        
        Args:
            root_path: 根目錄路徑，如果為 None 則從環境變數 FILES_ROOT 讀取，預設為 /srv
        """
        if root_path is None:
            root_path = os.getenv('FILES_ROOT', '/srv')
        
        self.root_path = Path(root_path).resolve()
        
        # 確保根目錄存在
        if not self.root_path.exists():
            self.root_path.mkdir(parents=True, exist_ok=True)
    
    def _normalize_path(self, path: str) -> Path:
        """
        規範化路徑並檢查安全性
        
        Args:
            path: 要規範化的路徑（可以是相對或絕對路徑）
            
        Returns:
            規範化後的 Path 物件
            
        Raises:
            ValueError: 如果路徑不安全（路徑遍歷攻擊）
        """
        if not path or path == "":
            return self.root_path
        
        # 移除開頭的斜線，統一處理為相對路徑
        path = path.lstrip('/')
        
        # 組合路徑
        normalized = (self.root_path / path).resolve()
        
        # 檢查路徑是否在根目錄內（防止路徑遍歷攻擊）
        try:
            normalized.relative_to(self.root_path)
        except ValueError:
            raise ValueError(f"路徑不安全: {path}")
        
        return normalized
    
    def _get_file_info(self, file_path: Path) -> Dict:
        """
        取得檔案資訊
        
        Args:
            file_path: 檔案路徑
            
        Returns:
            檔案資訊字典
        """
        stat = file_path.stat()
        is_dir = file_path.is_dir()
        
        # 格式化檔案大小
        if is_dir:
            size = None
            size_formatted = "-"
        else:
            size = stat.st_size
            size_formatted = self._format_file_size(size)
        
        # 格式化修改時間
        modified = datetime.fromtimestamp(stat.st_mtime)
        modified_formatted = modified.strftime("%Y-%m-%d %H:%M")
        
        return {
            "name": file_path.name,
            "type": "directory" if is_dir else "file",
            "size": size,
            "size_formatted": size_formatted,
            "modified": modified.isoformat(),
            "modified_formatted": modified_formatted,
            "path": str(file_path)
        }
    
    def _format_file_size(self, size: int) -> str:
        """
        格式化檔案大小
        
        Args:
            size: 檔案大小（位元組）
            
        Returns:
            格式化後的大小字串
        """
        if size == 0:
            return "0 Bytes"
        
        units = ['Bytes', 'KB', 'MB', 'GB', 'TB']
        unit_index = 0
        size_float = float(size)
        
        while size_float >= 1024 and unit_index < len(units) - 1:
            size_float /= 1024
            unit_index += 1
        
        return f"{size_float:.2f} {units[unit_index]}".rstrip('0').rstrip('.')
    
    def get_file_list(self, path: str = "") -> Dict:
        """
        取得指定路徑下的檔案列表
        
        Args:
            path: 相對路徑，預設為空字串（根目錄）
            
        Returns:
            包含路徑和檔案列表的字典
            
        Raises:
            ValueError: 如果路徑不安全
            FileNotFoundError: 如果路徑不存在
            PermissionError: 如果沒有讀取權限
        """
        try:
            target_path = self._normalize_path(path)
            
            if not target_path.exists():
                raise FileNotFoundError(f"路徑不存在: {path}")
            
            if not target_path.is_dir():
                raise ValueError(f"路徑不是目錄: {path}")
            
            # 讀取目錄內容
            files = []
            for item in sorted(target_path.iterdir()):
                try:
                    file_info = self._get_file_info(item)
                    files.append(file_info)
                except (PermissionError, OSError):
                    # 跳過無法讀取的檔案
                    continue
            
            # 先顯示目錄，再顯示檔案
            files.sort(key=lambda x: (x["type"] != "directory", x["name"].lower()))
            
            return {
                "path": str(target_path),
                "files": files
            }
            
        except (ValueError, FileNotFoundError, PermissionError):
            raise
        except Exception as e:
            raise Exception(f"讀取檔案列表時發生錯誤: {str(e)}")
    
    def get_file_tree(self, path: str = "", max_depth: int = 10) -> Dict:
        """
        取得檔案樹狀結構
        
        Args:
            path: 相對路徑，預設為空字串（根目錄）
            max_depth: 最大深度，防止無限遞迴
            
        Returns:
            檔案樹狀結構字典
            
        Raises:
            ValueError: 如果路徑不安全
            FileNotFoundError: 如果路徑不存在
        """
        try:
            target_path = self._normalize_path(path)
            
            if not target_path.exists():
                raise FileNotFoundError(f"路徑不存在: {path}")
            
            return self._build_tree(target_path, max_depth)
            
        except (ValueError, FileNotFoundError):
            raise
        except Exception as e:
            raise Exception(f"建立檔案樹狀結構時發生錯誤: {str(e)}")
    
    def _build_tree(self, path: Path, max_depth: int, current_depth: int = 0) -> Dict:
        """
        遞迴建立檔案樹狀結構
        
        Args:
            path: 當前路徑
            max_depth: 最大深度
            current_depth: 當前深度
            
        Returns:
            樹狀結構字典
        """
        # 如果達到最大深度，只返回當前節點資訊，不包含子節點
        if current_depth >= max_depth:
            # 返回當前節點，但 children 為空陣列
            return {
                "name": path.name if path != self.root_path else "根目錄",
                "path": str(path),
                "type": "directory" if path.is_dir() else "file",
                "children": []
            }
        
        is_dir = path.is_dir()
        
        result = {
            "name": path.name if path != self.root_path else "根目錄",
            "path": str(path),
            "type": "directory" if is_dir else "file",
            "children": []
        }
        
        if is_dir:
            try:
                for item in sorted(path.iterdir()):
                    try:
                        child_tree = self._build_tree(item, max_depth, current_depth + 1)
                        if child_tree is not None:
                            result["children"].append(child_tree)
                    except (PermissionError, OSError):
                        # 跳過無法讀取的檔案
                        continue
            except (PermissionError, OSError):
                # 無法讀取目錄
                pass
        
        return result
    
    def create_directory(self, path: str = "", name: str = "") -> Dict:
        """
        建立新資料夾
        
        Args:
            path: 相對路徑，預設為空字串（根目錄）
            name: 資料夾名稱
            
        Returns:
            包含成功訊息和路徑的字典
            
        Raises:
            ValueError: 如果路徑不安全或資料夾名稱無效
            FileExistsError: 如果資料夾已存在
            PermissionError: 如果沒有寫入權限
        """
        import re
        
        # 驗證資料夾名稱
        if not name or name.strip() == "":
            raise ValueError("資料夾名稱不能為空")
        
        # 移除前後空白
        name = name.strip()
        
        # 檢查資料夾名稱是否包含不允許的字元
        # Windows 和 Linux 都不允許的字元: < > : " / \ | ? *
        invalid_chars = r'[<>:"/\\|?*\x00-\x1f]'
        if re.search(invalid_chars, name):
            raise ValueError("資料夾名稱包含不允許的字元")
        
        # 檢查是否為保留名稱（Windows）
        reserved_names = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 
                         'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 
                         'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9']
        if name.upper() in reserved_names:
            raise ValueError(f"資料夾名稱 '{name}' 是保留名稱，不能使用")
        
        try:
            # 規範化父目錄路徑
            parent_path = self._normalize_path(path)
            
            if not parent_path.exists():
                raise FileNotFoundError(f"父目錄不存在: {path}")
            
            if not parent_path.is_dir():
                raise ValueError(f"路徑不是目錄: {path}")
            
            # 建立新資料夾路徑
            new_dir_path = parent_path / name
            
            # 檢查資料夾是否已存在
            if new_dir_path.exists():
                raise FileExistsError(f"資料夾已存在: {name}")
            
            # 建立資料夾
            new_dir_path.mkdir(parents=False, exist_ok=False)
            
            return {
                "success": True,
                "message": "資料夾建立成功",
                "path": str(new_dir_path)
            }
            
        except (ValueError, FileNotFoundError, FileExistsError, PermissionError):
            raise
        except Exception as e:
            raise Exception(f"建立資料夾時發生錯誤: {str(e)}")
    
    def get_file_content(self, path: str) -> Dict:
        """
        讀取檔案內容
        
        Args:
            path: 檔案相對路徑
            
        Returns:
            包含檔案內容、類型、大小等資訊的字典
            
        Raises:
            ValueError: 如果路徑不安全或檔案類型不支援
            FileNotFoundError: 如果檔案不存在
            PermissionError: 如果沒有讀取權限
        """
        import base64
        
        MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
        
        # 文字檔副檔名
        TEXT_EXTENSIONS = {'.txt', '.json', '.py', '.js', '.html', '.css', '.md', 
                          '.yml', '.yaml', '.xml', '.csv', '.log', '.sh', '.bat',
                          '.conf', '.config', '.ini', '.env', '.properties', '.sql',
                          '.java', '.cpp', '.c', '.h', '.hpp', '.php', '.rb', '.go',
                          '.rs', '.swift', '.kt', '.scala', '.ts', '.tsx', '.jsx',
                          '.vue', '.svelte', '.dart', '.lua', '.pl', '.r', '.m',
                          '.mm', '.h', '.hpp', '.cxx', '.cc', '.asm', '.s', '.S'}
        
        # 圖片檔副檔名
        IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp',
                           '.ico', '.tiff', '.tif', '.heic', '.heif'}
        
        try:
            target_path = self._normalize_path(path)
            
            if not target_path.exists():
                raise FileNotFoundError(f"檔案不存在: {path}")
            
            if target_path.is_dir():
                raise ValueError(f"路徑是目錄，不是檔案: {path}")
            
            # 檢查檔案大小
            file_size = target_path.stat().st_size
            if file_size > MAX_FILE_SIZE:
                raise ValueError(f"檔案過大（{self._format_file_size(file_size)}），無法預覽（限制：{self._format_file_size(MAX_FILE_SIZE)}）")
            
            # 判斷檔案類型
            file_ext = target_path.suffix.lower()
            file_type = None
            
            if file_ext in TEXT_EXTENSIONS:
                file_type = "text"
            elif file_ext in IMAGE_EXTENSIONS:
                file_type = "image"
            else:
                raise ValueError(f"不支援的檔案類型: {file_ext}")
            
            # 讀取檔案內容
            if file_type == "text":
                # 讀取文字檔
                try:
                    with open(target_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                except UnicodeDecodeError:
                    # 如果 UTF-8 解碼失敗，嘗試其他編碼
                    try:
                        with open(target_path, 'r', encoding='latin-1') as f:
                            content = f.read()
                    except Exception:
                        raise ValueError("無法讀取檔案內容（編碼問題）")
            elif file_type == "image":
                # 讀取圖片檔並轉換為 base64
                with open(target_path, 'rb') as f:
                    image_data = f.read()
                    content = base64.b64encode(image_data).decode('utf-8')
            
            return {
                "success": True,
                "name": target_path.name,
                "type": file_type,
                "content": content,
                "size": file_size,
                "path": str(target_path)
            }
            
        except (ValueError, FileNotFoundError, PermissionError):
            raise
        except Exception as e:
            raise Exception(f"讀取檔案內容時發生錯誤: {str(e)}")
