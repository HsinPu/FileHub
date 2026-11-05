# Linux Compose 部署與 DB 維護

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

適用 `0.40.18` 的同源登入／檔案工作空間、API／worker 與帳號／入口／恢復 CLI。Linux worker 增加有界上傳維護，預設每 60000ms 最多四筆；操作與未決結果處理見[上傳說明](uploads.md)。技術契約見 [P0.5 決策](../decisions/P0-deployment.md)，平台／資源界線與驗收命令見 [P0 檢查表](p0-checklist.md)，初始化至瀏覽下載見[唯讀操作](read-only-workspace.md)，最新結果依根 README／P10.7（本機 `../validation/P10.7.md`）。

## 首次啟動

需求：Docker Linux／amd64 backend 與支援 `service_completed_successfully`、`up --wait` 的 Compose plugin；本次實測 Engine 29.6.1、Compose v5.3.0。DB 的 Docker data root 必須在主機本機檔案系統，不能將 state volume 改成 NAS／NFS／SMB。Docker Desktop 的 Linux VM 可供開發驗證；正式目標仍為單台 Linux 主機。

在儲存庫根目錄複製 `.env.example` 為 `.env`，確認 image／主機埠。Compose 不使用原生開發的 `FILEHUB_HOST`／`FILEHUB_PORT`，容器內固定 `0.0.0.0:3000`；主機用 `FILEHUB_BIND_ADDRESS`／`FILEHUB_HTTP_PORT`。若原生 `.env` 有自訂 Windows `FILEHUB_STATE_DIR`，部署時改用獨立 env file 的 Linux 容器路徑。未設定時使用 `/data/state`。

```shell
docker compose config --quiet
docker compose build migrate
docker compose up -d --wait --wait-timeout 45 api worker
docker compose ps -a
curl --fail http://127.0.0.1:8080/health/ready
```

預期 `migrate` Exited (0)，API／worker 都 healthy，HTTP 回 `{"status":"ready"}`；`http://127.0.0.1:8080/` 提供登入／工作空間，`/?view=status` 為公開服務概覽。首次 named volumes 由 image 準備 UID/GID 1000 的空目錄權限；不會修復既有 volume 的錯誤 owner。`FILEHUB_IMAGE` 預設 `filehub:0.40.18`，建置一次給三角色使用。若指定已發布的 registry digest，先自行 pull 該 digest，再直接 up，勿用 digest 作 build tag。

檢查三角色 `docker inspect` 的 `.Image` 相同、`.Config.User` 均 `1000:1000`，及兩服務 state 的 `.Mounts` 指向相同 named volume。無 override 時為 `filehub_state`、`filehub_files`、`filehub_cache`。主機預設僅 loopback；是否對外發布依後續部署需求另行處理。

```shell
docker compose stop api worker
```

正常關閉 exit code 0，worker 日誌含 `worker_stopped`。停止保留 volumes。之後可再次 up；升級／維護先依下節處理，`restart` 不會重新執行 migration。這份操作不需要 `down -v`；刪除正式 volumes 會移除資料。

## 外部目錄

Linux 主機先掛好實際儲存，設定已存在的絕對路徑，例如 `.env`：

```dotenv
FILEHUB_EXTERNAL_SOURCE=/srv/filehub/external
FILEHUB_EXTERNAL_READ_ONLY=true
```

```shell
docker compose -f compose.yaml -f compose.mounts.example.yaml config --quiet
docker compose -f compose.yaml -f compose.mounts.example.yaml up -d --wait api worker
```

兩服務會同路徑掛在 `/mounts/example`，預設唯讀；P2 寫入需在停機後確認主機權限／ACL，再將 `FILEHUB_EXTERNAL_READ_ONLY=false` 套用至兩服務，並明確啟用 entry／grant write，見[寫入操作](writes.md)。缺少來源目錄會失敗，不會自動 mkdir 或遞迴 chown。需用相同 `-f` 組合進行後續管理。掛載後再用[入口 CLI](entries.md)註冊／授權；限定 NFSv3 唯讀來源故障見 P5.5（本機 `../validation/P5.5.md`）；SMB、NFS 寫入與硬體 NAS 未驗。

## DB-only 管理快照與停機升級

正式資料升級依 [完整備份與回復](full-backup.md)；以下僅為本機 Compose 預設 project 名稱 `filehub` 的 DB-only 管理快照範例，不包含原檔或 guard。先停止兩服務與其他 DB 使用者，核對均不在 Running；命令本身不會替你停機。目的目錄必須不存在，快照會包含 `filehub.db`。

```shell
docker compose stop api worker
docker compose ps -a
docker volume create filehub_backups
docker compose run --rm --no-deps -v filehub_backups:/data/backups migrate apps/server/dist/db-maintenance.js backup /data/backups/before-upgrade
```

備份使用 SQLite backup API 並驗完整性；不單獨複製使用中的 `.db`。`filehub_backups` 是額外 named volume，仍須由操作者匯出／保存至適當的獨立備份位置，不能把同一 Docker 主機內的副本當作災難復原保障。

確認完整快照可還原後，使用預定的新 image：本機建置可再執行 `docker compose build migrate`，已載入的固定 digest 則略過 build。兩服務保持停止，執行：

```shell
docker compose up -d --force-recreate --wait --wait-timeout 45 api worker
docker compose ps -a
```

新 migration 必須成功，API／worker 才放行；失敗保留停止狀態並檢查固定錯誤日誌，不能跳過 gate 強開服務。不要同時執行兩組升級命令。跨 schema 回退必須另驗相容性，不提供混版滾動升級保證。

## DB-only 還原到新 volume

這個較窄的 smoke 只適用尚無入口、寫入／trash／upload／operation／artifact 等檔案業務狀態的管理 DB。已有原檔或 owner guard 的正式資料改用 [完整還原](full-backup.md)：單獨 DB 會缺少 root identity／payload／guard，migration 可能明確拒絕，不能刪 row／guard 或跳過 gate 強開。

保留原服務停止與原 state。建立未使用過的 project，例如 `filehub-restore`，及獨立 `.env.restore`；由 `.env.example` 複製後調整：

```dotenv
FILEHUB_IMAGE=filehub:0.40.18
FILEHUB_STATE_DIR=/data/state/restored
FILEHUB_BIND_ADDRESS=127.0.0.1
FILEHUB_HTTP_PORT=8080
```

下列 `create migrate` 只準備容器與新 mount 根目錄，不執行 migration；restore 建立全新的 `restored` 子目錄。備份 volume 只讀掛入。

```shell
docker compose -p filehub-restore --env-file .env.restore create migrate
docker compose -p filehub-restore --env-file .env.restore run --rm --no-deps -v filehub_backups:/data/backups:ro migrate apps/server/dist/db-maintenance.js restore /data/backups/before-upgrade/filehub.db
docker compose -p filehub-restore --env-file .env.restore up -d --wait --wait-timeout 45 api worker
docker compose -p filehub-restore --env-file .env.restore ps -a
curl --fail http://127.0.0.1:8080/health/ready
```

預期兩服務 healthy，並核對應有資料。若目錄已存在，restore 拒絕覆寫；請改用另一個全新 project／目錄。後續所有命令持續使用相同 project 與 env file，勿又切回根 `.env` 的 state 路徑。原 volume、原檔與快照保留供檢查，不手動刪 WAL／SHM。

目前 schema 13 包含帳號／入口／grant、寫入／回收／上傳與 operations 管理紀錄，DB-only 快照會保存這些 metadata。上述流程沒有還原內建原檔、外部掛載內容、ZIP、guard／私有控制檔、金鑰或設定；不能據此宣稱完整工作可續行。完整 FileHub 備份／可攜還原改用 [P6.3 完整維護工具](full-backup.md)，包含所有入口、必要 state 與設定；DB-only 步驟不能取代它。

## 自動驗證

正式發行另依[發行流程](release.md)跑 `pnpm test:release`，驗新安裝、schema 10→13、12→13 與各原 image 的隔離快照回復；支援範圍不擴大為未知 Python DB 匯入。

使用專案指定 Node／pnpm，安裝指定 browser 後執行完整 P0 驗收（Linux 安裝命令及純核心入口見 [P0 檢查表](p0-checklist.md)）：

```shell
pnpm test:e2e:install
pnpm verify:p0
```

`verify:p0` 先驗核心與 browser，再用根版本 tag 建正式 image，最後執行隔離 Compose cases。只跑 Compose 時依序 `pnpm test:compose:build`、`pnpm test:compose:run`。不重用正式服務，建立唯一 project、動態 loopback 埠與專屬 volumes；只清理標籤吻合的測試資源。缺少 Docker 或 image 直接失敗，不算 skip 通過。測試涵蓋同 image／UID／WAL、migration gate、真實 SIGTERM、worker SIGSTOP 過期、容器重建、DB 還原及 Linux bind 的唯讀／可寫／EACCES；P2.4 加入正式 HTTP 寫入／還原 bytes 與跨 PID namespace 的 owner proof。

P3.4 的五項 Compose 驗收另涵蓋上傳 session／hash 在兩服務重啟後保留、worker 自動到期清理，以及正式 image 在獨立 8 MiB tmpfs 實際 ENOSPC、保留 prefix／原檔、清理後重傳。容量 fixture 不使用主機掛載；這不是正式容量或真實 NAS 故障保證。

P5 的 `pnpm test:nfs` 與 `verify:p0` 分開：建立自己的 NFSv3 唯讀來源、核心 RPC 停滯／worker 終止，以及獨立 1 MiB tmpfs 的複製 ENOSPC。SQLite 仍在本機，不放 NFS；正式 Compose 不新增 mount capability。已驗平台及未驗範圍依 [P5.5 故障決策](../decisions/P5-fault-acceptance.md)與驗證（本機 `../validation/P5.5.md`），不以這份 fixture 推論任意 NAS 可寫或服務重開後的 stale handle 行為。
