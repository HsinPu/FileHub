import logging
import os
from datetime import datetime

# 確保 logs 目錄存在
LOG_DIR = "logs"
if not os.path.exists(LOG_DIR):
    os.makedirs(LOG_DIR)

def get_logger(name="Files-App"):
    """
    建立並回傳一個日誌記錄器
    
    Args:
        name: 記錄器名稱，預設為 "Files-App"
        
    Returns:
        logging.Logger: 配置好的記錄器
    """
    logger = logging.getLogger(name)
    
    # 如果已經有處理程序，就不再重複新增（避免重複日誌）
    if not logger.handlers:
        logger.setLevel(logging.INFO)
        
        # 定義日誌格式
        formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
        
        # 檔案路徑：app 在前面，後接日期 (例如: logs/app-2024-01-08.log)
        today = datetime.now().strftime("%Y-%m-%d")
        log_file = os.path.join(LOG_DIR, f"app-{today}.log")
        
        # 檔案處理程序
        file_handler = logging.FileHandler(log_file, encoding="utf-8")
        file_handler.setFormatter(formatter)
        
        # 控制台處理程序 (輸出到終端機)
        stream_handler = logging.StreamHandler()
        stream_handler.setFormatter(formatter)
        
        # 將處理程序新增到記錄器
        logger.addHandler(file_handler)
        logger.addHandler(stream_handler)
        
    return logger

# 導出預設的 logger 實例
logger = get_logger()
