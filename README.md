# Files-App

一個基於 FastAPI 的現代化檔案管理系統，提供直觀的網頁介面來瀏覽、查看和管理檔案。

## 功能特色

- 📁 **檔案瀏覽**：樹狀圖和列表兩種方式瀏覽檔案結構
- 🔍 **檔案搜尋**：快速搜尋檔案和資料夾
- 👁️ **檔案預覽**：支援文字檔和圖片檔的即時預覽
- 📂 **資料夾管理**：建立和管理資料夾
- 🎨 **現代化 UI**：使用 Tailwind CSS 打造的響應式介面
- 🐳 **Docker 支援**：一鍵部署，輕鬆運行

## 技術棧

- **後端**：FastAPI (Python 3.11)
- **前端**：Tailwind CSS, JavaScript
- **容器化**：Docker & Docker Compose

## 安裝方式

### 使用 Docker Compose（推薦）

1. **克隆專案**
   ```bash
   git clone https://github.com/maxpu/Files-App.git
   cd Files-App
   ```

2. **啟動服務**
   ```bash
   docker-compose up -d
   ```

3. **訪問應用**
   打開瀏覽器訪問：http://localhost:9005

### 手動安裝

1. **安裝依賴**
   ```bash
   pip install -r requirements.txt
   ```

2. **設定環境變數**
   ```bash
   export FILES_ROOT=/srv  # 設定檔案根目錄路徑
   ```

3. **建立檔案目錄**
   ```bash
   mkdir -p /srv
   ```

4. **啟動應用**
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8000
   ```

5. **訪問應用**
   打開瀏覽器訪問：http://localhost:8000

## 配置說明

### 環境變數

- `FILES_ROOT`：檔案根目錄路徑（預設：`/srv`）

### Docker Compose 配置

- **端口映射**：`9005:8000`（主機端口:容器端口）
- **檔案掛載**：`./srv:/srv`（將本地 `srv` 目錄掛載到容器）

## 使用說明

1. **瀏覽檔案**：使用左側樹狀圖或中間列表瀏覽檔案
2. **查看檔案**：點擊「查看」按鈕預覽檔案內容
3. **建立資料夾**：點擊「新增資料夾」按鈕建立新資料夾
4. **搜尋檔案**：使用頂部搜尋框快速找到檔案

## 專案結構

詳細的專案結構說明請參考 [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md)

## 授權

本專案採用 MIT 授權。

## 貢獻

歡迎提交 Issue 和 Pull Request！
