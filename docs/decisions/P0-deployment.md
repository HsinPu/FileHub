# P0.5 Linux Compose 與健康檢查決策

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

日期：2026-10-28。應用程式版本 `0.5.0`，DB schema revision 仍為 1。前置為 [P0.4](P0-worker-lifecycle.md)，實測見 P0.5 驗證（本機 `../validation/P0.5.md`），操作見[部署與 DB 維護](../operations/deployment.md)。

後續 [P0.6](P0-web.md) 已加入同源 SPA 與 Chromium fixture，[P0.7](P0-ci-and-fixtures.md) 整理共用驗收／CI，當時版本為 `0.7.0`，API／worker／migration 拓樸不變。下文保留 P0.5 當時決策與範圍；最新版本與操作依[部署文件](../operations/deployment.md)及根 README。

## Image 與程序

- 第一版固定 `linux/amd64`、Debian Bookworm／glibc，Node `24.22.1`。基底為 `node:24.22.1-bookworm-slim@sha256:2dd9a4f758e173b65fee15388f7706af6fb01ef50cf7a2c0538711d67a6981ae`；這是 amd64 manifest，並非多平台 index digest。Dockerfile frontend 亦固定 digest。
- Builder 安裝 pnpm `12.16.0`，僅允許其 bootstrap scripts，使用原 lockfile frozen install／TypeScript build；不複製 Windows `node_modules`。`pnpm --filter @filehub/server deploy --prod --legacy --frozen-lockfile` 打包可攜的 server 與 contracts；採 legacy deploy 配合目前的 workspace links，不為部署改用另一套 lockfile。正式 runtime 不安裝 Kit／TypeScript／Vitest，帶入已提交的 SQL／metadata。
- `migrate`、`api`、`worker` 全部引用同一 `FILEHUB_IMAGE`。本機預設 tag `filehub:0.5.0`，驗證比較實際 image ID；本機 tag 可被重建，不宣稱等同 immutable registry digest。正式搬移 image 可預先載入同一產物，或明確 pull 固定 registry digest 再設定 image，兩服務不得混版。
- Node 直接作 PID 1，ENTRYPOINT 是 exec form，不隔著 shell；本份無子程序工作，SIGTERM 直接交給 API／worker 的既有 handlers。之後增加外部工具時需重新評估 reaping／init 與取消語意。

## Compose 與持久化

`migrate` 為一次性服務，成功才透過 `service_completed_successfully` 放行兩個常駐服務，各一個實例。migration 失敗不會由 app 代跑；升級先停止兩服務，再更換 image／migration，不能把 depends_on 當作執行中的協調鎖。[Docker 啟動順序](https://docs.docker.com/compose/how-tos/startup-order/)

| 邊界 | 已落地設定 |
| --- | --- |
| 身分 | 三角色均為 `1000:1000`；image 只準備自身空目錄權限，不在啟動時遞迴 chown 主機資料 |
| 容器根檔案系統 | read-only、drop ALL capabilities、no-new-privileges |
| 資源 | 每角色 512 MiB、1 CPU、128 PIDs；正式負載出現後另量測調整 |
| 關閉 | SIGTERM，Compose grace 20 秒，app 預設期限 5 秒；不保證能搶占同步／核心 I/O |
| state | `local` named volume → `/data/state`，DB／WAL／SHM 同目錄；預設無 driver options，禁止改為 NFS／CIFS volume |
| 內建原檔／cache | 分別為 `files:/data/files`、`cache:/data/cache`，兩服務掛相同 volume 與路徑；產品操作仍待後續階段 |
| 暫存 | 每容器獨立 tmpfs：`/tmp` 64 MiB、`/run/filehub` 1 MiB（UID/GID 1000、0700）；其容量計入容器記憶體限制 |
| 網路 | API 容器內 `0.0.0.0:3000`，主機預設只綁 `127.0.0.1:8080`；worker 不發布埠 |
| 外部目錄 | `compose.mounts.example.yaml` 以相同 Linux source／`/mounts/example` 掛入兩服務，預設唯讀，不自動建立缺少的主機目錄 |

tmpfs 隨容器停止移除，不能保存工作或當作共享儲存。[Docker tmpfs](https://docs.docker.com/engine/storage/tmpfs/)

## 健康契約

- API：healthcheck 以真實 loopback HTTP 請求 `/health/ready`，要求 200 與 `status: ready`；`/health/live` 仍只表示 HTTP 可回應。
- Worker：設定 `FILEHUB_WORKER_HEARTBEAT_FILE` 才啟用跨程序快照，Compose 固定為私有 `/run/filehub/worker.json`。原生開發預設停用，啟用時要求 Linux `/proc`。
- 每次既有 idle loop 完成 DB probe 後發布 version、instance UUID、PID、程序 starttime、state、ready、檢查次數與時間。非同步寫入合併等待中的更新，以同目錄暫存檔＋rename 發布，錯誤回報 owner；停止等待最後快照完成後關 DB。worker `main` 因初始發布而改為 async，呼叫端須 await。
- Healthcheck 要求快照 schema 有效、idle／ready、時間非未來且不超過 `max(5000ms, 3 × poll interval)`，並核對 `/proc/<pid>/stat` 的存活程序與 starttime，再以正式 DB adapter 驗 readiness。不能只由另一個程序連 DB 成功就宣稱 loop 正常。starttime 防 PID 重用；UUID 用於區分快照實例，沒有拿來當 job lease／fencing token。[Linux proc](https://docs.kernel.org/filesystems/proc.html)
- Docker 探測週期 5 秒、單次 timeout 2 秒、3 次失敗、start period 3 秒；unhealthy 的標記有探測延遲。`unless-stopped` 處理程序退出，不能宣稱它會因 unhealthy 自動重啟。外部掛載健康留獨立入口模型，不把本份測試目錄 EACCES 當作服務必須死亡。

## DB 維護邊界

`db-maintenance.js backup <新目錄>` 與 `restore <備份絕對路徑>` 沿用 P0.3 的 backup API、integrity／外鍵／migration 檢查。操作者先停止 API／worker 及其他 DB 寫入者；CLI 不自動協調其他容器。還原只接受全新 state 子目錄，不能覆寫既有 state，也不能直接指定 Docker 已存在的 mount 根目錄。

本份驗證新 named volume 的 `/data/state/restored`：先還原，再用相同 `FILEHUB_STATE_DIR` 啟動三角色。保留原 volume 以便檢查；不手動刪除 WAL／SHM。此流程只覆蓋 DB，原檔、金鑰、帳號／工作狀態及完整回復操作留 P6.3。

## 驗證範圍

`test:compose` 是獨立 Vitest project，明確要求 Docker Linux／amd64 與已建 image，缺少時失敗；`pnpm check` 維持不需要 Docker 的本機集合。Compose fixture 使用唯一 project／標籤、動態 loopback 埠、暫存 env file 及專屬 volumes，清理前核對 ownership，只刪自己的資源。既有服務的 container ID／StartedAt 於前後比對。

實際平台為 Windows 的 Docker Desktop WSL2 Linux backend、ext4 state 與 Linux bind fixture；不能推論裸機 Linux、ARM64 或真實 NAS／NFS／SMB、斷線與核心 I/O 行為已通過。
