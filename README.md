# FileHub

React + TypeScript + Ant Design 的檔案工作空間，搭配 FastAPI 與 SQLite。
提供登入、目錄樹、搜尋、縮圖與 PDF 預覽、資料夾上傳、ZIP 打包下載、重新命名、批次複製搬移、垃圾桶還原與剪貼簿操作。

## 使用 Docker

使用 Docker Engine 與 Compose，或啟動 Docker Desktop（Linux containers），在本專案根目錄執行：

```powershell
docker compose up -d --build --wait
docker compose exec filehub python -m backend.app.cli bootstrap
```

設定初始帳號後，開啟 [http://127.0.0.1:9005](http://127.0.0.1:9005)。檔案、帳號與金鑰分別保存於 Docker 資料卷，不需要建立或掛入主機資料夾；登入後即可上傳檔案。
部署設定、備份與既有帳號搬移請見 [Docker 說明](docs/DOCKER.md)。
管理頁可新增共享目錄、選擇深層子目錄並分配帳號權限，不必逐筆修改 `.env`。選用 NFS 掛載、目錄狀態與操作權限請見 [目錄管理](docs/DIRECTORY_MANAGEMENT.md)。

## 本機開發（選用）

以下 PowerShell 指令均從儲存庫根目錄執行：

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements-dev.txt
.\.venv\Scripts\python.exe -m backend.app.cli bootstrap
```

後端：

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

另一個終端啟動前端：

```powershell
cd frontend
npm ci
npm run dev
```

瀏覽 `http://127.0.0.1:5173`。Vite 將 `/api` 代理至後端，保持同源 Cookie 與 Origin 檢查。
使用不同後端連接埠時，啟動 Vite 前設定 `$env:API_PROXY_TARGET = 'http://127.0.0.1:8001'`。

Linux/macOS 使用 `python3 -m venv .venv` 與 `.venv/bin/python`，其餘 npm 指令相同。
正式執行先於 frontend 執行 `npm run build`，FastAPI 會提供 `frontend/dist`。不需要另外部署 Node 伺服器。

## 設定

Docker 部署可在 `.env` 設定 `DOCKER_PORT`（預設 9005）與 `COOKIE_SECURE`。以下路徑設定適用於本機開發；Docker 使用 Compose 指定的容器路徑。

複製 `.env.example` 為 `.env`，只有需要變更時才設定。環境變數優先於 `.env`。

| 設定 | 預設／用途 |
| --- | --- |
| `FILES_ROOT` | 專案 `srv/`；管理員可存取全部，一般帳號依指定子目錄與權限存取 |
| `DATABASE_PATH` | 專案 `database/users.db`，沿用舊版帳號 |
| `SECRET_KEY` | 未提供時產生隨機金鑰，保存在 `config/session.key` |
| `COOKIE_SECURE` | 本機 HTTP 為 `false`；HTTPS 部署設為 `true` |

相對檔案系統路徑固定以儲存庫根目錄解析，不受啟動位置影響。
請保存 `config/session.key`；替換它會讓所有登入失效。Windows 下金鑰與資料庫依賴帳號目錄的 NTFS 權限保護。
`FILES_ROOT` 不可涵蓋程式、設定、日誌或帳號資料庫目錄；資料夾內的符號連結／junction 不開放瀏覽。

## 登入與部署

- 公開註冊關閉。第一個帳號由 `docker compose exec filehub python -m backend.app.cli bootstrap` 建立；後續由管理員在「帳號管理」設定角色、狀態、根目錄與操作權限。
- 新密碼使用 Argon2，保留驗證舊 bcrypt 密碼的能力。
- JWT 儲存在 HttpOnly、SameSite=Strict Cookie；不使用 localStorage 保存權杖。
- Session 存在資料庫中；登出撤銷目前連線，修改密碼驗證舊密碼並撤銷所有連線。
- 寫入 API 要求 `X-Requested-With: Files-App`；有 Origin 時驗證同源，不開 CORS。
- Docker Compose 預設只將連接埠發布到主機 loopback。若要網路部署，使用 HTTPS 反向代理並保留正確的 Host／scheme；只信任指定代理。
- 登入節流目前為單一程序、每來源 IP 五分鐘 10 次；本版以單一 worker 執行為基準。

## 功能範圍與限制

- 搜尋目前已載入目錄的檔名，不是全磁碟搜尋。
- 目錄樹只載入展開層級；列表仍一次讀取目前目錄，再由前端分頁，超大型單層目錄尚未最佳化。
- 文字／圖片預覽上限 10 MB，文字支援 UTF-8／Big5；圖片能否顯示依瀏覽器格式支援而定。縮圖每頁 24 項，延遲載入原圖；圖片預覽可前後切換。
- PDF.js 逐頁繪製 PDF，限制 50 MB／200 頁；不支援加密文件，特殊格式失敗時可下載原檔。
- 支援多檔／拖放上傳，單檔上限 512 MB，一次加入最多 100 個，同時傳輸 2 個；可取消與重試。同名項目回報衝突，不覆寫。
- 檔名單擊選取、雙擊開啟、Enter 開啟；核取方塊與 Ctrl／Command 支援多選。右鍵或「•••」開啟操作選單。
- 提供單檔下載、檔案／資料夾重新命名。原生寫入支援 Windows／Linux；macOS 請使用 Docker。
- Docker Desktop Windows 掛載的寫入相容模式限單一 worker／容器；請勿啟動多個服務同時寫入同一目錄。完整操作規則見 [第一階段驗收](docs/PHASE1.md)。
- 批次複製／搬移支援資料夾、同名略過／保留兩者、取消、逐項結果及任務紀錄；每批最多 100 個來源，同時執行一個批次。
- 垃圾桶支援還原及另選目的地；一般帳號限自己的授權範圍與刪除項目，管理員可查看全部。不提供永久刪除或自動清空。
- 剪下／複製／貼上按鈕與 Ctrl／Command+C、X、V；Delete 開啟移至垃圾桶確認。剪貼簿只作用於此頁面，重新整理後清除。
- 資料夾選取／拖放保留階層，最多 1,000 項、32 層、合計 5 GB；根目錄同名可略過或保留兩者。選取器無法帶入空目錄，拖放目錄可保留。
- 多檔／資料夾 ZIP 背景打包可取消；來源上限 1 GB／10,000 項，完成後保留一小時。詳見 [第三階段操作與驗收](docs/PHASE3.md)。
- 單檔分享支援期限、選填密碼及撤銷；受限帳號只能存取指定根目錄。詳見 [第四階段操作與權限](docs/PHASE4.md)。目前 loopback 分享網址僅供本機開啟，網路分享需另行部署 HTTPS。
- 服務假設本機檔案系統由可信任的使用者管理；不提供對抗本機惡意程序競態替換檔案的隔離沙箱。

## 驗證

```powershell
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m ruff check backend
cd frontend
npm run build
npx playwright install chromium
npm run test:e2e
```

瀏覽器測試自行啟動 127.0.0.1:18005 的隔離伺服器，使用暫存帳號與測試檔案，不碰真實資料庫。
若該埠被占用，可設定 `$env:E2E_PORT = '18006'`。截圖位於 `.cache/screenshots/`，失敗 trace 位於 `frontend/test-results/`。

## 升級與回復

原始檢查點為 Git `6b2dcdf`。新版移除 `app/` 舊模板、JS 及 Controller，舊的根目錄 `main.py` 相容入口已移除；使用 Docker Compose 啟動，開發時使用 `backend.app.main:app`。
升級前停止舊服務並備份 `database/`、`.env`、`config/session.key` 與原本的檔案根目錄。
新版不搬移或清空檔案，也不重建 `users` 表；新增登入連線、任務、垃圾桶與上傳批次表。舊版權杖需重新登入。
若需回復，使用獨立舊版 checkout 搭配升級前的資料庫備份；新版 Argon2 密碼不能交給舊版 passlib 設定驗證。

架構與 API 見 [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md)，改版驗收見 [docs/MIGRATION.md](docs/MIGRATION.md)。

## FileHub 更名相容性

產品名稱已由 Files-App 改為 FileHub。部署統一使用 Docker Compose，Windows BAT 安裝與啟動入口已移除。
登入 Cookie、JWT issuer、寫入要求識別、回收桶與上傳暫存格式保留原名稱，以維持既有資料相容性。
Docker 服務改名為 `filehub`、映像改為 `filehub:local`；已有部署請先閱讀 [更名升級說明](docs/DOCKER.md#filehub-更名升級)。
GitHub 儲存庫已更名為 `HsinPu/FileHub`。
