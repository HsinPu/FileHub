# FileHub 工具鏈定案

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

第三方版本確認日期：2026-10-27；P0 工程基線更新：2026-10-28。既定第三方版本及 P0.6 lockfile 持續沿用；應用程式與 schema 版本隨功能階段更新，以[根 README](../README.md)為準。歷史結果見 P0.1（本機 `validation/P0.1.md`）–P0.6（本機 `validation/P0.6.md`），P0 共用驗收／乾淨 Linux／CI 摘要（本機 `validation/P0.7.md`）與[決策](decisions/P0-ci-and-fixtures.md)列明工程命令、平台及 Actions 固定 SHA；後續功能驗證依主計畫。

## 已確認版本

| 項目 | 已確認精確版本 | 選擇理由與證據 |
| --- | --- | --- |
| Node.js | `24.22.1`，24 LTS 分支 | 採已發布的 LTS 安全修訂版；符合 driver 要求的 Node ≥22。[官方發布](https://nodejs.org/en/blog/release/v24.22.1) |
| SQLite driver | `better-sqlite3@13.0.3` | 適合短交易、prepared statements、明確 SQL 與本機備份；固定 tag 的 Node engines 與 SQLite 版本可核對。[發布](https://github.com/WiseLibs/better-sqlite3/releases/tag/v13.0.3)、[套件設定](https://raw.githubusercontent.com/WiseLibs/better-sqlite3/v13.0.3/package.json) |
| SQLite 引擎 | 隨上述 driver 的 `3.53.4` | 上游 compilation 文件列出此版本，已高於既定 WAL-reset 修補門檻；P0.5 Linux 兩服務亦實測此版本，升級時仍須重驗。[固定版本說明](https://raw.githubusercontent.com/WiseLibs/better-sqlite3/v13.0.3/docs/compilation.md) |
| ORM／query builder | `drizzle-orm@0.45.4` | 使用非 prerelease 的發布版本，保留 TypeScript schema、查詢型別與明確 SQL。[發布](https://github.com/drizzle-team/drizzle-orm/releases/tag/0.45.4) |
| Migration 產生工具 | `drizzle-kit@0.31.11` | 產生可審查並提交的 SQL／migration metadata，與 runtime migrator 分工。[發布](https://github.com/drizzle-team/drizzle-orm/releases/tag/drizzle-kit@0.31.11) |
| Package manager | `pnpm@12.16.0` | 支援 workspace，固定工具與單一 lockfile；此發布亦包含安全修正。[發布](https://github.com/pnpm/pnpm/releases/tag/v12.16.0)、[workspace](https://pnpm.io/workspaces) |

以上版本已在 P0.1 manifests／workspace／單一 lockfile 落地；其餘精確依賴與理由見 [P0 工具鏈決策](decisions/P0-tooling.md)。P0.5 已固定 `node:24.22.1-bookworm-slim` 的 linux/amd64 manifest digest，Windows／Linux 正式 adapter 均核對 SQLite `3.53.4`／WAL；digest、production deploy、UID／掛載與健康契約見[部署決策](decisions/P0-deployment.md)。Docker Desktop WSL2 結果不代表真實 NFS 或所有 Linux 主機已驗。

## 為何選這組

FileHub 的管理資料與工作紀錄需要型別支援，但原子 claim、條件更新及 lease 仍要能直接審查 SQL。Drizzle 的範圍適合此需求：一般 CRUD 用 typed query builder，必要處保留參數化 SQL，資料存取集中在後端 persistence 邊界。ORM schema 不直接當公開 API DTO。

Prisma 也能透過 SQLite adapter、raw SQL 與交易完成這些需求；本案優先選較直接的 Drizzle 存取方式，不額外引入 generated Client。Node 24.22.1 的 `node:sqlite` 文件仍將 API 列為 RC，第一版優先採 better-sqlite3；後續另立評估再換 driver。[Prisma 7 SQLite](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/sqlite)、[Node 24.22.1 SQLite API](https://raw.githubusercontent.com/nodejs/node/v24.22.1/doc/api/sqlite.md)

Drizzle `0.45.4` 宣告的 better-sqlite3 peer 範圍為 `>=7`，包含已選 driver；這只是版本宣告允許，不是本專案已驗證相容。查核時官方網站也有 `@rc` 範例，不能將新版範例、migration 格式或行為直接套到上述穩定發布版本。[固定 tag 套件設定](https://raw.githubusercontent.com/drizzle-team/drizzle-orm/0.45.4/drizzle-orm/package.json)

## 存取、migration 與安裝流程

- API／worker 各自擁有 DB connection，共用同一本機 DB 目錄與相同 driver。better-sqlite3 查詢與交易是同步操作；限制查詢、交易與 busy 等待時間，量測 API 延遲，不能靠 Promise 包裝消除阻塞。交易 callback 不使用 `async`／`await`，檔案 I/O 在交易之外。[driver API](https://github.com/WiseLibs/better-sqlite3/blob/v13.0.3/docs/api.md)
- TypeScript schema → Kit 產生 SQL／metadata → 檢查破壞性變更與資料轉換 → 空 DB 與舊版 fixture 升級測試 → Git 提交。正式環境不使用 schema `push` 自動同步。
- Kit 作開發／建置工具；正式 image 包含已編譯的一次性 migration 入口、SQL／metadata，以及 ORM runtime migrator。沿用正式 driver 與連線初始化，不要求正式環境保留 Kit 或在開機時產生 migration。[固定 tag migrator](https://raw.githubusercontent.com/drizzle-team/drizzle-orm/0.45.4/drizzle-orm/src/better-sqlite3/migrator.ts)
- Migration 成功才啟 API／worker；升級先停止兩服務並備份。備份使用 SQLite／driver 能力並驗還原，migration 不能取代備份。
- P0.1 已建立 `pnpm-workspace.yaml`、`pnpm-lock.yaml`、`.node-version` 與精確 `packageManager: "pnpm@12.16.0"`，外部直接依賴固定版本，本機 frozen install 已通過；CI／Docker 在對應工作沿用 `pnpm install --frozen-lockfile`，不依賴浮動 `latest`。[安裝契約](https://pnpm.io/cli/install#--frozen-lockfile)
- Windows 與 Linux 各自安裝依賴；正式 native module 在目標 Linux image 內解析／建置，不複製 Windows `node_modules`。建議先驗 Debian／glibc 基底，只有缺適用 prebuild 時才評估所需建置工具。需要的依賴 build scripts 逐項明確允許，不全面開放。

## P0 實作驗證要求

1. 核對 npm 發布版本、完整性、peer／engine 條件與固定版本 API；建立 lockfile，驗證 Windows 開發與正式 Linux image 的乾淨安裝、型別檢查與 build。
2. 在 API／worker 正式產物各執行 `SELECT sqlite_version()` 並核對 WAL、外鍵與連線設定，確認同 image、同 SQLite，且 DB／WAL／SHM 位於共同本機持久目錄。
3. 以 file-backed DB、獨立連線及雙程序驗證有界 busy handling、原子 claim、失效 owner 拒絕更新、重啟與資料持久化；工作相關案例依功能階段加入。
4. 驗空 DB migration、既有 schema 升級、失敗阻擋兩服務啟動，以及隔離還原；連同 API 延遲量測與程序資源清理記錄結果。

P0.7 已建立 `check:project`／`verify:core`／`verify:p0` 與 CI workflow。Windows 及隔離 Debian 核心／Chromium、正式 Linux Compose 分開驗證；CI image 重新 frozen install Linux 原生依賴，不帶主機 node_modules／build／秘密。重跑與已驗／未驗平台見 [P0 操作檢查表](operations/p0-checklist.md)。SQLite runtime 仍為 3.53.4，既有 migration bytes 不變。

版本升級另做小份變更，閱讀 release notes、重跑適用驗證，再更新 lockfile／image。固定版本是為了可重現，不表示長期停留在舊安全修訂版。
