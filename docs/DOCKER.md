# Docker 執行

需求：Docker Engine / Docker Desktop（Linux containers）與 Docker Compose。
在 `FileHub` 儲存庫根目錄執行以下指令，不需要在主機安裝 Node 或 Python。

## 第一次使用

```powershell
docker compose up -d --build --wait
docker compose exec filehub python -m backend.app.cli bootstrap
```

第二個指令會互動要求帳號與密碼。既有帳號不會被覆寫，密碼不會輸出到日誌。
開啟 [http://127.0.0.1:9005](http://127.0.0.1:9005)。登入後可直接上傳檔案。

Linux 不需要建立 `srv/` 或設定主機目錄權限。Docker 會建立檔案資料卷，容器以 UID/GID 1000 執行。

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
DOCKER_PORT=9005
COOKIE_SECURE=false
```

預設沒有主機資料夾掛載，也不讀取 `DOCKER_FILES_DIR`。
修改連接埠後執行 `docker compose up -d --wait` 套用。

## 選用：掛入 Linux /nfs，再由管理頁分配子目錄

先在 Linux 主機完成 NFS 掛載，確認 `/nfs` 的實際來源及容器 UID/GID 1000 所需的權限。目錄存在本身不代表 NFS 已掛載成功。

在 `compose.yaml` 的 `services.filehub.volumes` 保留原有三個資料卷，再附加以下項目（不是取代整個 volumes）：

```yaml
      - type: bind
        source: /nfs
        target: /files/nfs
        bind:
          create_host_path: false
```

若整個來源僅供讀取，可在同一項加入 `read_only: true`。`create_host_path: false` 防止來源不存在時自動建立空目錄；不能替你檢查 NFS 是否已掛上。

```bash
docker compose config
docker compose up -d --build --wait
```

管理頁登錄 `nfs/reports` 或 `nfs/departments/it`，再到帳號管理授權即可。日後在同一掛載內新增普通子目錄，只需登錄與授權，不必修改 `.env` 或重啟。若新增的是另一個 NFS 子掛載，先在主機掛好，再重新建立容器並驗證可見性：

```bash
docker compose up -d --force-recreate --wait
```

此版不自動調整掛載傳播、不以符號連結繞過容器邊界。跨檔案系統垃圾桶與搬移仍有限制。請用測試檔驗證目錄讀寫、不同帳號可見範圍、跨目錄複製、停用撤權，以及重建容器後設定保留。完整操作見 [目錄管理](DIRECTORY_MANAGEMENT.md)。目前開發環境沒有 Docker，此次未執行真實 Linux／NFS 驗收。

## 更新、檢查與停止

```powershell
docker compose up -d --build --wait
docker compose ps
docker compose logs --tail 100 filehub
docker compose stop
docker compose start
```

建置採兩個階段：Node 建置 React，最終 Python 映像僅保留 FastAPI、依賴及前端成品。
映像不包含本機帳號、金鑰、`.env`、測試資料或 node_modules。
容器 root filesystem 唯讀，可寫入位置僅限三個資料掛載與 `/tmp`。

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

Compose 預設只發布 loopback 9005。對外提供服務需另行設定 HTTPS 反向代理、Secure Cookie 與可信任的代理來源。
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
