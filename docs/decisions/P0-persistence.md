# P0.3 SQLite、migration 與 DB 還原

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

日期：2026-10-27。狀態：已實作並通過 Windows x64 驗證。應用程式版本 `0.3.0`，DB schema revision 為 1。範圍依[主計畫 P0.3](../../IMPLEMENTATION_PLAN.md#p0-契約工具鏈與可啟動骨架)，結果見驗證摘要（本機 `../validation/P0.3.md`）。第三方版本沿用 [P0 工具鏈](P0-tooling.md)。

後續 [P0.4](P0-worker-lifecycle.md) 已接入獨立 worker 與共用關閉流程，[P0.5](P0-deployment.md) 已驗固定 Linux image／Compose gate、DB 維護 CLI 與新 volume 還原；schema revision／SQL／metadata 維持不變。下文保留 P0.3 的決策與當時範圍。

## 連線與本機 state

`apps/server/src/persistence/database.ts` 提供正式 better-sqlite3／Drizzle adapter，schema 留在後端，不匯出到公開 contracts。`FILEHUB_STATE_DIR` 預設為 cwd 下的 state，DB 固定命名 `filehub.db`；自訂路徑須絕對、本機且非 UNC／裝置路徑。路徑格式無法辨識 mapped drive、NFS 或 volume driver，部署仍須核對實際掛載。

| 設定 | 本份決定與理由 |
| --- | --- |
| SQLite runtime | 精確核對 `3.53.4`，與已鎖 driver 一致；升級 driver 時一併更新 gate 與驗證 |
| Journal | WAL；migration 才啟用，runtime 不轉換未知 DB |
| Foreign keys | 每條連線 ON，實測拒絕違反 FK 的寫入 |
| Synchronous | FULL；優先保存已提交的管理狀態，尚未做斷電可靠性實驗 |
| Busy | 預設 100ms，環境變數允許 0–1000ms，程式化 adapter 呼叫也驗證上限；沒有外加重試 |
| Checkpoint | `wal_autocheckpoint=1000` pages，使用 SQLite 自動 checkpoint；不是 WAL 大小硬上限 |

實際版本高於 WAL-reset 修補門檻 3.51.3，依據為 [SQLite WAL §11](https://sqlite.org/wal.html#walreset)。DB／WAL／SHM 必須共用本機目錄，不放 NAS／NFS／SMB，詳見[架構 §8](../../ARCHITECTURE.md#8-資料庫與部署邊界)。

better-sqlite3 的操作與 Drizzle transaction 同步執行。交易只做短 SQL／metadata 變更，不放 async callback、檔案 I/O 或等待其他程序；driver 會拒絕回傳 Promise，但不能據此宣稱已取消外部副作用。`SQLITE_BUSY` 由 driver 明確回報，不隱藏無限重試。timeout 設定不是查詢期限，也不保證相同 wall-clock 上限；Windows 實測已觀察到同步等待延遲 HTTP。

## Ownership 與 readiness

`openDatabase` 只開既有 DB，缺少 state／DB 時失敗且不建立檔案。匯入 persistence、API 或 migration 模組沒有建 DB、listen 或解析環境的副作用。

正式 API `main` 建立並擁有 DB connection，將 `database.isReady()` 作為借用 probe 注入 factory；正常關閉、factory／listen 失敗都清理自身 DB。fixture 自有的連線不受影響。factory 沒有注入 probe 時預設 503，取代 P0.2 的過渡預設值。

每次 readiness 核對當前 SQLite／連線設定、完整 migration 紀錄與 singleton revision，不沿用就緒快取。schema／hash 改動或 DB 關閉後會回未就緒；liveness 仍只表達程序能回應。若 DB 檔本身不存在或不能開啟，API 在 listen 前失敗。錯誤回應與 CLI 日誌不輸出 DB 路徑、原始 SQL 或內部錯誤。

## 最小 schema 與 migration

目前只有 `schema_state`：固定 `id=1`、`revision=1`；以及 Drizzle 自有的 `__drizzle_migrations`。不預建帳號、session、入口或工作 tables。應用程式 SemVer 與 DB revision 分開管理；本份 revision 與 migration 數量一致，後續每份 migration 都要更新 revision 並驗證已知前綴升級。

開發使用 `apps/server/drizzle.config.ts` 執行 `pnpm db:generate`。已提交的產物為：

- `apps/server/drizzle/0000_initial_schema.sql`：Kit 產生建表 SQL，再審查加入 singleton revision 的初始資料。
- `apps/server/drizzle/meta/_journal.json`、`0000_snapshot.json`：Kit 產生的 journal／snapshot。

SQL 以 LF 保存，防止 Windows checkout 改變 hash；已套用檔案不修改，後續使用新 migration。重新 generate 已確認沒有 schema 差異，metadata check 通過。

執行順序為 `pnpm build` → `pnpm db:migrate` → `pnpm start:api`。migration CLI 只解析 DB 設定，不要求 API port 合法；成功／失敗均關閉連線，以 exit code 判斷結果。正式環境使用編譯入口與 ORM runtime migrator，不使用 Kit 或 schema push。

本機已安裝的 Drizzle ORM `0.45.4` migrator 依最後時間戳判斷待執行檔，沒有核對既有 hash。本專案補上以下前置條件：[固定版本實作](https://github.com/drizzle-team/drizzle-orm/blob/0.45.4/drizzle-orm/src/sqlite-core/dialect.ts)。

1. 只接受空 DB，或本版 migration 的完整已知前綴。
2. 核對每筆 hash／時間戳及目前 revision；拒絕未知 schema、缺漏、修改或較新紀錄。
3. 使用 Drizzle 的交易執行待套用 SQL，完成後再核對 readiness；不做降版。

判空包含所有非內部 schema objects，不能只查 tables，否則只有 view 的 DB 會被誤接管。排除 `sqlite_` 內部名稱使用 GLOB，底線是字面值；LIKE 的底線萬用字元會錯誤略過 `sqliteLegacy` 這類自訂表。這兩個邊界已有實際回歸案例。

SQL 失敗會 rollback；Drizzle 建立 journal table 的步驟在該交易外，可能留下空 journal，修正尚未套用的 SQL 後可重試。第一版升級仍需停止 API／worker 與其他 DB 寫入者，不讓常駐服務競爭 migration。

SQL／metadata 由模組位置解析，不依賴 cwd。P0.5 製作 image 時須保留 `apps/server/drizzle/` 與編譯後入口的相對布局；只複製 dist 不足。Compose 的 migration 成功 gate 仍待 P0.5 驗證。

## DB 備份還原 harness

`persistence/backup.ts` 提供程式化 harness，未提供完整操作 CLI：

| 函式 | 契約 |
| --- | --- |
| `backupDatabase(database, newDirectory)` | 借用就緒且不在交易中的連線；建立全新目錄，使用 driver backup API，驗證成功才回傳 DB 路徑 |
| `restoreDatabaseBackup(filename, config)` | 先唯讀檢查備份，再建立全新 state 目錄，以 backup API 還原、套用連線設定並驗 readiness，最後關閉自身連線 |

檢查包含 `integrity_check`、`foreign_key_check`、runtime 版本及 schema／migration 相容性。拒絕既有目的目錄，不覆寫或刪除既有 state；失敗可能留下本次新建的部分產物，函式不回報成功。測試清理由 fixture 在核對 realpath 後處理。

transfer 每輪 100 pages，progress callback 設 5 秒合作式期限；不能搶占同步或核心 I/O，且不代表 integrity 檢查的整體期限。driver 的 backup API 納入已提交 WAL 資料；其他連線持續寫入可能使備份重新開始，因此正式備份仍需協調寫入。[固定 driver backup API](https://github.com/WiseLibs/better-sqlite3/blob/v13.0.3/docs/api.md#backupdestination-options---promise)

本份實測範圍為隔離 DB、WAL 資料及還原後讀寫，不包含原始檔案、必要金鑰／設定、外部儲存快照、兩服務停機協調或業務工作恢復。完整操作流程留 P6.3；worker 與 Linux／Compose 分別留 P0.4、P0.5。
