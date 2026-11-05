# P0 驗收與操作檢查表

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

工程骨架檢查持續適用 `0.33.0` 的 API／worker／同源網站。從乾淨 checkout 驗完整核心；最新情境與結果依根 README，P1 操作見[唯讀工作空間](read-only-workspace.md)，P2 操作見[寫入／恢復](writes.md)，後續功能依 [IMPLEMENTATION_PLAN](../../IMPLEMENTATION_PLAN.md)。

## 環境與安裝

使用 Node `24.22.1`、pnpm `12.16.0`，根目錄執行：

```shell
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm check:project
```

Windows 工作站的隔離 PATH 見 P0.1 工具（本機 `../validation/P0.1.md#使用的隔離工具`）。不要跨平台複製 node_modules；better-sqlite3 與 bundler native binding 必須在目標平台安裝。

## 分層或完整驗收

| 範圍 | 命令 | 前置環境 |
| --- | --- | --- |
| 型別、lint、build、原生 tests | `pnpm check` | 固定 Node／pnpm、已 frozen install；數量見最新驗證摘要 |
| Chromium 安裝（Windows） | `pnpm test:e2e:install` | 可下載指定 browser |
| Chromium 與 Linux libraries 安裝 | `node scripts/playwright.mjs install --with-deps chromium` | Linux，OS 套件安裝權限 |
| 核心與 browser cases | `pnpm verify:core` | 上述 browser 安裝完成，數量見最新摘要 |
| 正式 image | `pnpm test:compose:build` | Docker Linux amd64 backend、registry／npm 網路 |
| 4 個 Compose cases | `pnpm test:compose:run` | 同版本正式 image、Docker／Compose |
| 完整核心與 Compose | `pnpm verify:p0` | 沿用 P0 命令名，Node、browser、Docker 均可用 |

`check` 僅 build 一次，先完成前端產物再跑 API 整合測試。單跑 `test:integration`／`test:http`／`test:system`／`test:e2e`／`test:compose` 會自行 build；`:run` 入口假設本機或 image 產物已建好。缺少 browser／Docker／image 時直接失敗，不算略過成功。

驗收使用自己的 file-backed DB、動態 loopback port、唯一 temp／Compose project；正常關閉 API／worker 與 DB，再核對資源 ownership 清理。Compose 會比對執行前未帶測試 ownership label 的原有服務 ID／啟動時間，不會重啟它們；其他隔離驗收容器可獨立退出。不要用 prune 或刪除正式 volumes 排除測試問題。

Playwright 為單 worker、無 retry，代表視窗是桌面 1440×1000、平板 800×1024、手機 390×844；情境數量依最新驗證摘要。`test-results/e2e/` 保存合成資料的截圖與失敗診斷，已由 Git 忽略；需要留存的圖須先檢視再加入驗證目錄。

## 隔離 Linux 核心驗收

不需掛載主機程式或 Docker socket。從專案根目錄建立 CI 專用 image，再執行（此段為 Linux shell）：

```shell
docker build --platform linux/amd64 -f docker/ci.Dockerfile -t filehub-ci:0.33.0 .
docker run --rm --cpus 2 --memory 2g --pids-limit 512 --shm-size 256m \
  --cap-drop ALL --security-opt no-new-privileges:true filehub-ci:0.33.0
```

此入口只驗 `verify:core`，不在容器內執行 Compose。需要保留失敗結果時，省略 `--rm` 並給獨有名稱／ownership label；停止後 `docker cp <自己的容器>:/workspace/test-results/e2e <自己的診斷目錄>`，核對名稱與 label 再只移除自己的容器。image 是測試工具，可自行移除明確的 `filehub-ci:0.33.0` tag；不要全域清理。

## 啟動、停機與回復

完整命令見[部署與 DB 維護](deployment.md)，每次操作核對：

1. 三角色使用同一版本 image；state／DB／WAL／SHM 位於本機檔案系統，外部掛載及 UID/GID 權限明確。
2. migration exit 0 後才啟 API／worker；兩者 healthy、`/health/live`／`/health/ready` 正常、首頁可用。
3. 更新前停止兩服務與其他 DB 使用者，使用 DB backup API／維護 CLI；不直接複製活躍 DB 而忽略 WAL。
4. 停止保留 volumes；還原只到全新 volume 中的新 state 子目錄，驗 integrity／schema 並再次啟動兩服務。
5. [P6.3 完整備份](full-backup.md)包含設定、全部入口與必要 state；DB-only 仍較窄，還原只到新目標且不重播不明工作。

## 平台與資源邊界

| 項目 | 實際狀態／限制 |
| --- | --- |
| Windows 10 x64 | 原生核心 tests／Chromium 三視窗已驗；signal 用 Node callback／IPC，非 POSIX signal 保證 |
| Debian 12 amd64，Docker Desktop WSL2 | 乾淨 Linux 核心／Chromium 與正式 Compose 已驗；state 在 ext4 |
| CI 設定 | Ubuntu 24.04、Windows Server 2022 core；Ubuntu Compose，workflow 已靜態驗證，hosted run 尚未執行 |
| 正式常駐服務資源 | 各 1 CPU／512 MiB／128 PIDs、唯讀 rootfs；tmpfs `/tmp` 64 MiB、`/run/filehub` 1 MiB；API host loopback 8080，worker 不開 port |
| 測試 CI 容器 | 2 CPU／2 GiB／512 PIDs／256 MiB shm；單 browser worker，可寫自有容器層；不是壓力／容量基準 |
| P3 容量 fixture | 正式 image、1 CPU／512 MiB、UID 1000、唯讀 rootfs／drop ALL／network none；專屬 8 MiB shm、16 MiB state／tmp tmpfs，沒有主機掛載 |
| 關閉與等待 | Compose stop grace 20 秒／app 5 秒；測試子程序等待 8 秒、緊急停止 2 秒；不能搶占同步 SQLite 或核心 I/O |
| 未驗平台 | 裸機 Linux、arm64、macOS、Windows 原生正式服務／Docker Windows containers、WebKit／Firefox、真實手機 |
| 未驗儲存 | 除已驗 NFSv3 唯讀來源的 exporter 暫停／恢復外，NAS／NFSv4／SMB、NFS 寫入、跨實體磁碟及硬體斷電未驗；SQLite 不得放網路 FS |

GitHub workflow、Actions 固定 SHA 與共用 helper 契約見[決策](../decisions/P0-ci-and-fixtures.md)。每次驗收記錄命令、版本、平台、結果及未驗條件；P0.7 實測見摘要（本機 `../validation/P0.7.md`）。
