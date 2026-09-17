# Docker 執行

需求：Linux、Docker Engine 與 Docker Compose；`filehub.sh` 使用系統 sh、awk、mktemp，不需要主機 Python 或 Node。
在 `FileHub` 儲存庫根目錄執行以下指令，不需要在主機安裝 Node 或 Python。

## 第一次使用

```bash
# 第一次安裝才複製；已有 .env 時請直接編輯。
cp .env.example .env
sh filehub.sh up -d --build --wait
sh filehub.sh exec filehub python -m backend.app.cli bootstrap
```

bootstrap 指令會互動要求帳號與密碼。既有帳號不會被覆寫，密碼不會輸出到日誌。
開啟 `http://你的Server-IP:9005`。預設 `0.0.0.0` 對所有主機 IPv4 介面開放；請依部署網路限制防火牆允許來源。登入後可直接上傳檔案。

僅使用預設資料卷時，不需要建立 `srv/` 或設定主機目錄權限。Docker 會建立檔案資料卷，容器以 UID/GID 1000 執行。

## 持久化與設定

| 資料 | 位置 |
| --- | --- |
| 帳號、登入連線、目錄登錄及授權 | Compose `database` volume，容器 `/app/database` |
| 隨機登入金鑰 | Compose `config` volume，容器 `/app/config/session.key` |
| 管理的檔案 | Compose `files` volume，容器 `/files` |

本機 Python 啟動的 `database/users.db` 與 Docker 的 database volume 是不同資料庫；不會自動搬移或覆寫本機帳號。
`docker compose down` 保留資料；不要加 `-v`，除非你確定要刪除檔案、帳號與金鑰 volumes。

可在根目錄 `.env` 設定（Compose 只傳入列出的設定，不會把整份 `.env` 打包進映像）：

```dotenv
DOCKER_BIND_IP=0.0.0.0
DOCKER_PORT=9005
COOKIE_SECURE=false
```

預設沒有主機資料夾掛載，也不讀取 `DOCKER_FILES_DIR`。
修改位址或連接埠後執行 `sh filehub.sh up -d --wait` 套用。只允許本機連線時，將 `DOCKER_BIND_IP` 改成 `127.0.0.1`。

## 選用：在 .env 設定多個主機資料夾

每行一個來源，名稱會成為容器 `/files` 下的入口：

```dotenv
FILEHUB_MOUNT_nfs=/nfs
FILEHUB_MOUNT_shared=/data/shared
FILEHUB_MOUNT_reports=/mnt/reports
```

| 設定 | 容器位置 | 管理頁登錄範例 |
| --- | --- | --- |
| FILEHUB_MOUNT_nfs=/nfs | /files/nfs | nfs/reports、nfs/departments/it |
| FILEHUB_MOUNT_shared=/data/shared | /files/shared | shared 或 shared/team |
| FILEHUB_MOUNT_reports=/mnt/reports | /files/reports | reports |

新增更多 `FILEHUB_MOUNT_名稱=來源` 即可，最多 100 筆。名稱以小寫英文字母開頭，只使用小寫字母、數字與底線，不可重複。來源必須是既有的 Linux 絕對路徑；空值或註解表示不掛載。含空白或 # 的路徑可寫 `FILEHUB_MOUNT_shared='/data/shared files #1'`。路徑按字面讀取，不支援變數展開、多行、控制字元、反斜線、美元符號、反引號及雙引號字元。

```bash
sh filehub.sh config
sh filehub.sh up -d --build --wait
sh filehub.sh exec filehub ls -la /files/nfs
```

工具保留原有三個資料卷，產生暫存 Compose 掛載設定，每個 bind mount 設定 `create_host_path: false`。不會自動建立不存在的主機來源。未設定任何掛載仍可啟動。執行結束會清除暫存檔；不會改寫 compose.yaml 或自動產生永久 override。

使用這些設定時，所有啟動／更新／重建請用 `sh filehub.sh ...`；直接 `docker compose up` 只讀基本設定，可能把已設定的外部掛載移除。工具使用固定 compose.yaml，不會自動合併自訂 compose.override.yaml 或 COMPOSE_FILE。FILEHUB_MOUNT_* 只由專案 .env 讀取，不從 shell 環境變數讀取；一般 Compose 變數仍依 Compose 規則處理。

移除掛載行後再次執行 `sh filehub.sh up -d --wait`，會重建受影響服務，但不刪除主機來源檔案。先停用對應共享入口；資料庫中的登錄與授權仍保留。同一掛載中新增普通子資料夾，只需到管理頁登錄與授權，不必改 .env 或重啟。

### NFS 與權限

先在 Linux 主機完成 NFS 掛載；目錄存在不代表 NFS 已掛載。主機／NFS 權限須允許容器 UID/GID 1000 存取，管理頁授權不會更改作業系統權限。

如果新增的是 NFS 子掛載，先在主機掛好，再重建容器並確認可見性：

```bash
sh filehub.sh up -d --force-recreate --wait
```

本工具不自動調整掛載傳播，不以符號連結繞過容器邊界。跨檔案系統垃圾桶與搬移仍有限制。請用測試檔確認讀寫、權限、複製與停用撤權。開發環境沒有 Docker，shell 測試不代表 Linux／NFS 實機驗收完成。

如需每個來源在 Docker 層唯讀等進階選項，可自行編寫 Compose bind mount 並直接使用 Compose；不要與自動掛載入口混用。Compose 的變數替換不能把單一變數展開成任意多筆 volumes，工具使用官方支援的多檔合併方式：[變數替換](https://docs.docker.com/reference/compose-file/interpolation/)、[合併 Compose 檔案](https://docs.docker.com/compose/how-tos/multiple-compose-files/merge/)。

## 更新、檢查與停止

```bash
sh filehub.sh up -d --build --wait
docker compose ps
docker compose logs --tail 100 filehub
docker compose stop
docker compose start
```

建置採兩個階段：Node 建置 React，最終 Python 映像僅保留 FastAPI、依賴及前端成品。
映像不包含本機帳號、金鑰、`.env`、測試資料或 node_modules。
容器 root filesystem 唯讀，可寫入位置包含三個資料卷、`/tmp`，以及依主機權限允許寫入的選用掛載。

## 備份

先停止服務確保 SQLite 備份一致，再複製資料。`docker compose cp` 支援已停止的容器。

```powershell
docker compose stop
New-Item -ItemType Directory -Force backups/database, backups/config, backups/files
docker compose cp filehub:/app/database/. ./backups/database/
docker compose cp filehub:/app/config/. ./backups/config/
docker compose cp filehub:/files/. ./backups/files/
docker compose start
```

上述步驟包含檔案資料卷。Linux 請將 `New-Item` 改為 `mkdir -p backups/database backups/config backups/files`。備份含帳號資料與金鑰，不要加入 Git。
第二階段需一起備份檔案根目錄內的 `.files-app-trash` 保留目錄與 SQLite；只備份其中之一無法完整還原垃圾桶。維持單一 worker／容器寫入同一目錄。
第三階段於 database volume 新增 `archives/` ZIP 暫存與資料庫版本 4 上傳批次表；整個 `/app/database` 備份會包含它們。ZIP 到期可重新打包，不影響原始檔案。
第四階段新增版本 5 帳號權限與管理紀錄、版本 6 分享表。既有帳號首次遷移為管理員，往後不重設角色。原帳號密碼與金鑰保留；分享驗證也使用原持久化金鑰。

## 從本機帳號移入 Docker

僅在新的 Docker 部署、尚未建立帳號時操作；先停止本機 Python 服務並備份原資料庫。
建立容器後停止服務，複製既有資料庫，再啟動：

```powershell
docker compose create
docker compose cp ./database/users.db filehub:/app/database/users.db
docker compose run --rm --no-deps --user 0 --cap-add CHOWN filehub chown 1000:1000 /app/database/users.db
docker compose up -d --wait
```

不要覆蓋已有帳號的 Docker 資料庫。搬移後需重新登入，原 bcrypt 密碼仍可驗證。

## 網路部署

Compose 預設發布 `0.0.0.0:9005`。如經 HTTPS 反向代理提供服務，可將 `DOCKER_BIND_IP` 設為 `127.0.0.1`，另設定 Secure Cookie 與可信任的代理來源。
目前 Uvicorn 明確停用 proxy headers；加入反向代理時，必須只對指定代理 IP 啟用 forwarded headers，並保留正確 Host，讓同源檢查運作。

參考：[Docker multi-stage build](https://docs.docker.com/build/building/multi-stage/)、[Compose volumes](https://docs.docker.com/reference/compose-file/volumes/)。

## 舊版主機掛載驗證紀錄（2026-09-09）

Docker Desktop Linux/amd64 實際建置成功。隔離 Compose 測試確認 UID 1000、健康檢查、React HTML、登入、文字預覽、主機掛載寫入與登出。
強制重建容器後，原登入 Cookie 與建立的資料夾仍可使用，確認資料庫及隨機金鑰持久化。
第二階段測試再加入巢狀複製、搬移、移至垃圾桶，重建容器後查詢任務、從垃圾桶還原並比對原始位元組。
第三階段增加資料夾批次上傳、ZIP 內容與空目錄、PDF Range 與字型資源，以及重建後 ZIP 下載。
測試只建立並清理唯一命名的測試專案，不影響一般部署資料。

重新驗證（需要主機開發依賴）：

```powershell
docker compose build
.\.venv\Scripts\python.exe -m backend.tests.docker_smoke
```

## FileHub 更名升級

服務名稱由 `files-app` 改為 `filehub`，映像由 `files-app:local` 改為 `filehub:local`。現有部署須先用舊版 Compose 停止舊服務，再使用新版啟動，避免兩個服務同時寫入同一份資料；切勿使用 `down -v`。

沿用原 Compose 專案名稱、`database` 與 `config` 資料卷，以及既有檔案來源（更名與儲存方式切換需分開處理）。若日後搬動或重新命名專案目錄，請使用 `-p <原專案名稱>` 或設定 `COMPOSE_PROJECT_NAME`，並核對現有資料卷；不要讓目錄改名建立另一組空白資料卷。

本次更名不搬移 SQLite、金鑰或回收桶，也不修改登入與上傳的內部格式。歷史紀錄中的舊映像標籤保持原樣。上方歷史 Docker 驗證不代表 FileHub 更名版本已完成 Docker 實測。

## 從舊版主機掛載切換

新版改用 `files` 資料卷，已移除 `compose.linux.yaml`。舊 `.env` 的 `DOCKER_FILES_DIR`、`SHARED_DIR`、`REPORTS_DIR`、`DOCUMENTS_DIR` 不再生效。舊主機檔案不會刪除，也不會自動搬移；直接切換會顯示空白檔案目錄。

已有資料的環境請先保留原 Compose 與完整備份，再規劃檔案、回收桶及資料庫的一致性搬移。本次設定以全新測試部署為主，尚未完成 Docker 實機驗證。
