# Docker 執行

需求：Docker Engine / Docker Desktop（Linux containers）與 Docker Compose。
在 `FileHub` 儲存庫根目錄執行以下指令，不需要在主機安裝 Node 或 Python。

## 第一次使用

```powershell
docker compose up -d --build --wait
docker compose exec filehub python -m backend.app.cli bootstrap
```

第二個指令會互動要求帳號與密碼。既有帳號不會被覆寫，密碼不會輸出到日誌。
開啟 [http://127.0.0.1:9005](http://127.0.0.1:9005)。將檔案放進主機的 `srv/` 即可瀏覽。

若使用 Linux，先以自己的帳號建立 `srv/`，並確保容器 UID/GID 1000 有讀取與建立子目錄的權限。
容器以非 root 使用者執行，不會替你遞迴更改既有檔案的擁有者。

## 持久化與設定

| 資料 | 位置 |
| --- | --- |
| 帳號、登入連線 | Compose `database` volume，容器 `/app/database` |
| 隨機登入金鑰 | Compose `config` volume，容器 `/app/config/session.key` |
| 管理的檔案 | 主機 `./srv` bind mount，容器 `/files` |

本機 Python 啟動的 `database/users.db` 與 Docker 的 database volume 是不同資料庫；不會自動搬移或覆寫本機帳號。
`docker compose down` 保留資料；不要加 `-v`，除非你確定要刪除帳號與金鑰 volumes。

可在根目錄 `.env` 設定（Compose 只傳入列出的設定，不會把整份 `.env` 打包進映像）：

```dotenv
DOCKER_PORT=9005
DOCKER_FILES_DIR=C:/Users/win10/Documents/MyFiles
COOKIE_SECURE=false
```

`DOCKER_FILES_DIR` 指主機路徑，`FILES_ROOT` 則是容器內的 `/files`，不要混用。
修改掛載或連接埠後執行 `docker compose up -d --wait` 套用。

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
New-Item -ItemType Directory -Force backups/database, backups/config
docker compose cp filehub:/app/database/. ./backups/database/
docker compose cp filehub:/app/config/. ./backups/config/
docker compose start
```

另外備份主機 `DOCKER_FILES_DIR` 指定的檔案。備份含帳號資料與金鑰，不要加入 Git。
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

## 已驗證（2026-09-09）

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

沿用原 Compose 專案名稱、`database` 與 `config` 資料卷，以及原主機掛載路徑。若日後搬動或重新命名專案目錄，請使用 `-p <原專案名稱>` 或設定 `COMPOSE_PROJECT_NAME`，並核對現有資料卷；不要讓目錄改名建立另一組空白資料卷。

本次更名不搬移 SQLite、金鑰或回收桶，也不修改登入與上傳的內部格式。歷史紀錄中的舊映像標籤保持原樣。上方歷史 Docker 驗證不代表 FileHub 更名版本已完成 Docker 實測。
