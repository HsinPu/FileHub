# FileHub

FileHub 是自行部署的網頁檔案管理工具，支援內建儲存與已掛載的外部資料夾。使用瀏覽器管理檔案、分享內容與追蹤背景工作；檔案本體保留在檔案系統，SQLite 只保存管理資料。

目前版本 **0.40.18**，資料庫 schema **13**。正式部署目標是單台 Linux 主機，以 Docker Compose 啟動同一 image 的 API 與 worker，各一個實例。Windows 原生環境供唯讀開發；寫入功能使用 Linux 容器。

## 主要功能

- 帳號登入、管理員／成員權限、儲存入口與子目錄授權。
- 詳細列表、圖磚、圖庫、排序、分頁、名稱篩選與有界遞迴搜尋。
- 單檔下載、安全圖片／純文字／PDF 第一頁預覽。
- Linux 上的新建資料夾、改名、垃圾桶與還原、分段上傳及重新選檔續傳。
- 持久背景複製、搬移、ZIP 打包、逐項結果與取消。
- 檔案／資料夾分享、密碼、到期與撤銷，以及使用者偏好設定。
- 管理 CLI、健康檢查、停機完整備份與新目標還原。

入口預設唯讀；上傳及其他寫入需明確啟用入口、授權與可寫掛載。支援範圍及操作步驟見下方文件。

## 技術

| 範圍 | 使用技術 |
| --- | --- |
| 前端 | React 19.3.1、TypeScript 6.0.3、Ant Design 6.6.8、Vite 8.3.5 |
| 後端 | Node.js 24.22.1、Fastify 5.12.7 |
| 管理資料庫 | SQLite WAL、better-sqlite3 13.0.3、Drizzle ORM 0.45.4 |
| 開發工具 | pnpm 12.16.0、Vitest 5.0.5、Playwright 1.64.1 |
| 部署 | Docker Compose、Linux amd64、共用 image 的 API／worker |

精確依賴以 [package.json](package.json)、[lockfile](pnpm-lock.yaml) 與[工具鏈決策](docs/decisions/P0-tooling.md)為準。

## 環境需求

- Git，用於下載 FileHub 原始碼。
- Docker Linux／amd64 backend 與支援 `up --wait` 的 Compose plugin。
- SQLite state 使用主機本機檔案系統，**DB／WAL／SHM 不可放 NAS、NFS 或 SMB**；外部檔案來源先由主機掛載。
- 原生開發使用 Node.js **24.22.1**、pnpm **12.16.0**。Linux 原生 build 另需 C11 compiler 與 libc headers；Docker builder 已包含。

## 使用 Docker Compose 啟動

首次安裝時，在新機下載 `main` 並從範例建立 `.env`。

```shell
git clone --branch main https://github.com/HsinPu/FileHub.git
cd FileHub
cp .env.example .env
```

以下指令使用預設埠 8088。如需改埠，先修改 `.env`，並更新最後一行的健康檢查網址。詳見[設定](#設定)。

```shell
docker compose config --quiet
docker compose build migrate
docker compose up -d --wait --wait-timeout 45 api worker
docker compose ps -a
curl --fail http://127.0.0.1:8088/health/ready
```

這會從原始碼建置本機 `filehub:0.40.18`，先完成 migration，再啟動兩服務。預期 `migrate` 結束碼為 0，API／worker 為 healthy，健康端點回傳 `{"status":"ready"}`。在安裝 FileHub 的機器上開啟預設網址 [http://127.0.0.1:8088/](http://127.0.0.1:8088/)。

初次安裝**沒有預設帳密**。在互動終端建立管理員，密碼由隱藏提示輸入，至少 15 字元：

```shell
docker compose exec api node apps/server/dist/cli.js bootstrap admin
docker compose exec api node apps/server/dist/cli.js entry-add managed "內建資料" /data/files
```

登入後即可瀏覽已註冊入口。啟用寫入前依[寫入操作](docs/operations/writes.md)完成停機、入口 opt-in 與授權；成員帳號與外部目錄另見[帳號](docs/operations/identity.md)、[入口](docs/operations/entries.md)及[部署操作](docs/operations/deployment.md)。

```shell
docker compose stop api worker
```

停止服務會保留資料。預設持久 volumes 為 `filehub_state`、`filehub_files`、`filehub_cache`；勿以 `down -v` 清除使用中的資料。升級前須停寫並準備已驗還原的[完整備份](docs/operations/full-backup.md)，不能只複製使用中的 `.db`。

## 設定

| 設定 | 預設／用途 |
| --- | --- |
| `FILEHUB_IMAGE` | `filehub:0.40.18`，三角色共用同一版本 |
| `FILEHUB_BIND_ADDRESS`／`FILEHUB_HTTP_PORT` | 預設 `0.0.0.0:8088`，讓 FileHub 在主機的 IPv4 網路介面接收連線 |
| `FILEHUB_PUBLIC_ORIGIN` | 本機預設為 `http://127.0.0.1:8088`，隨 `FILEHUB_HTTP_PORT` 調整。從其他電腦登入時設定實際使用的 HTTPS 網址 |
| `FILEHUB_STATE_DIR` | 原生為執行目錄的 `state`；Compose 預設 `/data/state` |
| `FILEHUB_EXTERNAL_SOURCE`／`FILEHUB_EXTERNAL_READ_ONLY` | 外部掛載範例，預設唯讀 |
| `FILEHUB_LOG_LEVEL` | `info`；避免輸出帳密、Cookie 或使用者檔案內容 |

如需沿用 8080，在 `.env` 設定 `FILEHUB_HTTP_PORT=8080` 即可。若也有手動指定 `FILEHUB_PUBLIC_ORIGIN`，請讓它與實際登入網址相符。

從另一台電腦登入時，讓 HTTPS 反向代理轉發到 FileHub 主機的 8088 埠，在 `.env` 設定 `FILEHUB_PUBLIC_ORIGIN=https://files.example.com`，並用實際設定的 HTTPS 網址開啟 FileHub。若舊 `.env` 把 `FILEHUB_BIND_ADDRESS` 設成 `127.0.0.1`，需讓另一台主機上的代理連到 8088 時，改成 `0.0.0.0` 後執行 `docker compose up -d --wait api worker`。詳見[帳號與登入來源](docs/operations/identity.md#同源設定與-http-契約)。

完整設定見 [.env.example](.env.example) 與[部署操作](docs/operations/deployment.md)。外部目錄使用 [compose.mounts.example.yaml](compose.mounts.example.yaml)，API／worker 必須有一致掛載；不自動建立來源目錄或遞迴修改權限。

## 開發與測試

```shell
pnpm install --frozen-lockfile
pnpm check
```

`check` 會核對版本、型別、lint、正式 build，並執行工具鏈、單元、整合、HTTP 與 system 測試；不要求 Docker 或瀏覽器。瀏覽器及容器測試分開執行：

```shell
pnpm test:e2e:install
pnpm test:e2e
pnpm test:compose:build
pnpm test:compose:run
```

Linux 首次安裝瀏覽器改用 `node scripts/playwright.mjs install --with-deps chromium`。整合命令、隔離 fixture 與發行條件見 [CONTRIBUTING.md](CONTRIBUTING.md) 及[發行流程](docs/operations/release.md)。測試結果依實際平台與版本判定，本機通過不代表 hosted CI 或其他瀏覽器已驗證。

原生啟動先 `pnpm build`、`pnpm db:migrate`、`pnpm admin bootstrap admin`，再分別執行 `pnpm start:api` 與 `pnpm start:worker`。兩程序須使用同一個本機 state。原生預設網址為 [http://127.0.0.1:3000/](http://127.0.0.1:3000/)；前端開發可用 `pnpm dev:web`，同源設定見[開發流程](CONTRIBUTING.md)。

後續開發與發佈使用 `main`。測試原始碼及必要 fixture 保留在 `tests/`、`apps/server/tests/`、`apps/web/tests/`。截圖、log、驗證報告、資料庫、建置產物與私人設定不納入原始碼發佈；範圍及本機歷史保留方式見[原始碼發佈規則](docs/operations/source-publication.md)。

## 操作與設計文件

| 文件 | 用途 |
| --- | --- |
| [上傳](docs/operations/uploads.md) | 分段、續傳、到期與取消 |
| [搜尋與預覽](docs/operations/search-and-preview.md) | 三種檢視、搜尋及安全預覽 |
| [背景工作](docs/operations/background-operations.md) | 複製、搬移、ZIP 與受控恢復 |
| [公開分享](docs/operations/shares.md)、[設定管理](docs/operations/settings.md) | 分享與管理介面 |
| [完整備份與還原](docs/operations/full-backup.md) | 停機、驗證及全新目標還原 |
| [架構](ARCHITECTURE.md)、[實作計畫](IMPLEMENTATION_PLAN.md) | 技術邊界、工作編號與進度 |
| [設計規範](DESIGN.md)、[File Browser 研究](docs/filebrowser-study/01-source-and-architecture.md) | 現行介面規範與固定來源版本研究 |

## 功能與驗收邊界

單檔上傳上限 1 GiB；搜尋有深度、掃描與結果上限；ZIP 為 STORE 打包並有容量及到期限制。垃圾桶提供還原，尚未提供永久清空；未提供目錄樹、檔案內容編輯、session 自動續期或舊 Python 資料庫匯入。預覽不執行 HTML／SVG／Markdown 內容。

Docker Desktop 與指定 NFSv3 唯讀故障 fixture 的結果不代表所有實體 Linux、NAS、NFS／SMB 寫入或瀏覽器皆已驗證。正式使用前仍須依實際資料量、掛載、備份安排與[人工驗收清單](docs/reviews/acceptance-status-2026-11-04.md)確認；工程交付不代替使用者簽收。

## 貢獻與問題回報

開發前閱讀 [AGENTS.md](AGENTS.md) 與 [CONTRIBUTING.md](CONTRIBUTING.md)。變更採小份實作、驗證與提交，保留資料及平台限制。問題與需求請至 [GitHub Issues](https://github.com/HsinPu/FileHub/issues)，勿附上真實密碼、Cookie、分享秘密或使用者資料庫。

## 授權

本儲存庫目前未另行宣告 FileHub 程式或文件的授權。參考 File Browser 的固定版本為 [833d908](https://github.com/filebrowser/filebrowser/tree/833d908884d5c801f30f5c098d7977177eb3a36b)；取用的樣式、字型與圖示依 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)及附帶的授權原文處理，不能將上游授權自動視為整個 FileHub 的授權。
