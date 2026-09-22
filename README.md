# FileHub

React + TypeScript + Ant Design 的檔案工作空間，搭配 FastAPI 與 SQLite。
提供登入、目錄樹、搜尋、縮圖與 PDF 預覽、資料夾上傳、ZIP 打包下載、重新命名、批次複製搬移、垃圾桶還原與剪貼簿操作。

## Linux 安裝與設定

主機需已安裝 Git、Docker 與 Docker Compose。單純安裝測試，完成前四步即可；不需先設定 `.env` 或外部資料夾。

### 1. 下載專案

```bash
git clone https://github.com/HsinPu/FileHub.git
cd FileHub
```

如果已下載過，進入原本的 FileHub 專案目錄更新即可：

```bash
git pull
```

### 2. 啟動服務

在專案目錄執行：

```bash
docker compose up -d --build --wait
```

預設不需設定 `.env` 或掛入外部資料夾，檔案會存放在 Docker 資料卷。`--wait` 會等待服務通過健康檢查。

### 3. 建立管理員帳號與密碼

第一次安裝執行：

```bash
docker compose exec filehub python -m backend.app.cli bootstrap
```

依提示輸入管理員帳號及密碼。密碼由你自行設定，沒有預設密碼；輸入密碼時終端機不會顯示字元。已有管理員時不需重複執行。

### 4. 開啟網站

瀏覽器開啟 `http://你的Server-IP:9005`，使用剛建立的帳密登入。登入後即可新增資料夾及上傳檔案，不需另外設定主機路徑。

若其他電腦連不到，確認 Linux 防火牆允許用戶端連入 TCP `9005`。

### 5. 設定外部資料夾（選用）

**使用 Linux 上既有的資料夾**：第一次先建立設定檔；已有 `.env` 時直接編輯，不要覆蓋：

```bash
cp .env.example .env
nano .env
```

每個資料夾新增一行，左邊是入口名稱，右邊是 Linux 實際路徑：

```dotenv
FILEHUB_MOUNT_nfs=/nfs
FILEHUB_MOUNT_shared=/data/shared
FILEHUB_MOUNT_reports=/mnt/reports
```

名稱不可重複，以小寫英文字母開頭，可使用小寫字母、數字與底線。主機資料夾必須已存在；若使用 NFS，先在 Linux 上完成掛載。

儲存後套用資料夾設定：

```bash
sh filehub.sh up -d --build --wait
```

### 6. 登錄資料夾並分配權限（需要分配目錄時）

1. 到「設定 → 目錄管理 → 新增目錄」，填寫顯示名稱與相對路徑。
2. 到「帳號管理」，將一般帳號設為「多目錄授權」，選擇目錄並設定瀏覽、下載、上傳等權限。

相對路徑範例：

| 資料夾來源 | 管理頁填寫 |
| --- | --- |
| 在 FileHub 根目錄建立的 shared 資料夾 | shared |
| 掛入的 /nfs/reports | nfs/reports |
| 掛入的 /data/shared | shared |
| 掛入的 /mnt/reports | reports |

管理頁不用填 `/files/` 或主機完整路徑。只會顯示一般帳號獲得授權的入口；不能同時登錄重疊的父子目錄。同一掛載下新增普通子資料夾，只需在管理頁登錄與授權，不必修改 `.env` 或重啟。

預設開放 `0.0.0.0:9005`，可在 `.env` 用 `DOCKER_BIND_IP`、`DOCKER_PORT` 調整。資料卷會保留檔案、帳號與金鑰；不要使用 `docker compose down -v`，它會刪除資料卷。

更多部署、權限與備份說明見 [Docker 說明](docs/DOCKER.md) 與 [目錄管理](docs/DIRECTORY_MANAGEMENT.md)。

## 設定

Docker 部署可在 `.env` 設定 `DOCKER_BIND_IP`（預設 0.0.0.0）、`DOCKER_PORT`（預設 9005）、`COOKIE_SECURE`，以及由 `filehub.sh` 讀取的 `FILEHUB_MOUNT_*`。以下路徑設定適用於本機開發；Docker 使用 Compose 指定的容器路徑。

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
- Docker Compose 預設對主機所有 IPv4 介面開放 9005；防火牆請限制允許來源。使用 HTTPS 反向代理時可將 `DOCKER_BIND_IP` 設為 `127.0.0.1`，並保留正確的 Host／scheme。
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
- 單檔分享支援期限、選填密碼及撤銷；受限帳號只能存取指定根目錄。詳見 [第四階段操作與權限](docs/PHASE4.md)。分享網址使用開啟網站的位址；跨電腦使用時請以 Server IP 或網域登入，正式網路分享應部署 HTTPS。
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

瀏覽器測試逐份測試檔啟動 127.0.0.1:18005 的隔離伺服器，每份重新建立暫存帳號、資料庫與檔案，避免登入限流或共享資料互相污染，不碰真實資料庫。
完整執行結果摘要位於 `frontend/test-results/isolated-summary.json`。
若該埠被占用，可設定 `$env:E2E_PORT = '18006'`。截圖位於 `.cache/screenshots/`，失敗 trace 位於 `frontend/test-results/`。

## 健康與目錄診斷

- `/api/health`：程序存活檢查，維持 Docker 原有健康檢查用途。
- `/api/ready`：檢查 SQLite 簡單查詢與背景工作執行緒；正常回傳 HTTP 200，未就緒回傳 HTTP 503。只公開整體狀態，不公開內部路徑。
- 兩者都不探測外部 NFS，因此容器 healthy 或 ready 不代表所有掛載目錄均可讀寫。
- 在「設定 → 目錄管理」手動重新檢查；十秒未取得結果會提示重試，不直接判定離線。前次結果會標示尚未更新，沒有自動輪詢。
- 「已停用」是入口設定；「無法存取」是檔案系統狀態，兩者不同。寫入能力只是權限判斷，檢查不會建立或刪除測試檔。
- 瀏覽器取消等待不能保證中斷 Linux 核心中阻塞的 NFS 存取，仍須檢查主機掛載和網路。

API 回應包含 `X-Request-ID`，可配合 `docker compose logs filehub` 查詢請求識別碼、操作種類、狀態碼、耗時與錯誤類別。
Docker 關閉原本會記錄完整 URL 的存取紀錄，改用不含查詢字串、Cookie、密碼、分享憑證或檔案內容的請求紀錄；反向代理的紀錄需自行設定遮蔽。
請求耗時量到回應標頭產生為止，不代表下載串流已完成；背景任務結果仍以工作進度為準。

### 單程序與備份

所有平台均維持 **一個 worker、一個 FileHub 服務實例**；檔案修改鎖和背景工作協調是程序內狀態，不能直接增加 workers 或多個容器共同寫入。

備份前停止服務，並一併備份下列三部分；不要只備份 SQLite：

| 儲存位置 | 備份內容 |
| --- | --- |
| `database` volume → `/app/database` | SQLite、任務紀錄與封存資料 |
| `config` volume → `/app/config` | 登入簽章金鑰等設定 |
| `files` volume → `/files` 及額外主機掛載 | 實際檔案、回收桶及掛載資料；主機掛載須另行備份 |

另保存部署用 `.env` 與 Compose 設定。停止服務不會停止其他 NFS 使用者，需由儲存端確保備份一致性。
本次優化沒有資料庫遷移，回退本次變更可沿用既有資料切回先前應用程式版本。
列表效能量測方法、實測結果與限制見 [優化驗證紀錄](docs/OPTIMIZATION.md)。

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
