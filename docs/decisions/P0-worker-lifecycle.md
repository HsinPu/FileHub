# P0.4 idle worker 與共同生命週期

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

日期：2026-10-28。狀態：已實作並通過 Windows x64 驗證。應用程式版本 `0.4.0`，DB schema revision 維持 1。範圍依[主計畫 P0.4](../../IMPLEMENTATION_PLAN.md#p0-契約工具鏈與可啟動骨架)，結果見驗證摘要（本機 `../validation/P0.4.md`）。

後續 [P0.5](P0-deployment.md) 已加入 Linux Compose／heartbeat 健康契約與真正 OS signal 驗證；worker main 改為 async，呼叫端須 await。下文保留 P0.4 當時未啟用 heartbeat 的決策與測試範圍。

## 程序入口與設定

API 與 worker 使用同一份 server build，各以獨立 Node 程序啟動，不在 worker 內建立 HTTP server。第三方工具、DB adapter、SQL／metadata 與 [P0.3](P0-persistence.md) 相同；沒有新增 DB tables、套件或 migration。

| 入口 | 責任 |
| --- | --- |
| `src/server.ts` 的 main | 擁有 API app／DB，提供 HTTP 與 live／ready，啟動及失敗清理 |
| `src/worker.ts` 的 main | 擁有獨立 DB／idle loop，初始 DB 未就緒時失敗，停止後關閉自身 DB |
| `src/worker/idle.ts` 的 `startIdleWorker` | 借用同步 readiness 函式，以 timer 定期取樣，不關閉呼叫端資源 |
| `src/lifecycle/shutdown.ts` | API／worker 共用關閉 Promise、期限及 signal callbacks，移除自身 handlers |

匯入任何入口都不讀啟動設定、不開 DB、啟動 loop 或 listen；只有直接執行時才依 `import.meta.main` 啟動。內部 service 回傳 diagnostics getter 供維運／程序測試取樣，不加入公開 HTTP DTO，也不暴露 DB connection。

`parseWorkerConfig` 與 API 共用 DB、log level、shutdown timeout；worker 不解析 API host、port 或 readiness timeout。`FILEHUB_WORKER_POLL_INTERVAL_MS` 預設 1000，允許 50–60000；完整設定與啟動方式見 [README](../../README.md#設定)。

順序為 build → 一次性 db:migrate → 在兩個終端分開 start:api／start:worker。若 cwd 不同，必須明確指定同一絕對 state 路徑；服務不自行建立 DB 或套 migration。API 保留 live／ready 分離，worker 則要求初次 DB 檢查成功才開始循環。

## Idle loop 與可觀察狀態

每輪同步執行正式 adapter 的 `isReady()`，不持有長交易，不寫入業務或 heartbeat tables。這個版本只建立可啟停基礎；operation、原子 claim、lease、fencing、取消、重試與檔案副作用仍依後續階段實作。

| 狀態 | 觸發與語意 |
| --- | --- |
| idle | DB 目前取樣就緒，尚無工作執行器 |
| unavailable | 執行中的 DB 檢查失敗或回 false，後續繼續檢查 |
| stopping | 已要求停止，ready 立即為 false，不再開始下一輪 |
| stopped | loop 已結束；服務 close／done 再完成 DB 清理 |
| failed | 非預期 loop／observer 錯誤，done 拒絕並由 owner 清理資源 |

`getStatus()` 回不可變 snapshot，包含 state、ready、checks、lastCheckedAt。它是最後一次取樣，並非持久工作紀錄或即時跨程序健康證明。onCheck 是同步觀察 callback，目前只供記錄狀態，不能作非同步工作執行介面。

info 記 `worker_state` 狀態變化與 `worker_stopped`；unavailable 使用 warn，debug／trace 另記每輪 `worker_tick`。欄位只含固定事件、PID 與上述狀態，不輸出路徑、SQL、原始設定或 exception。CLI 啟動／執行失敗以非零退出並輸出固定安全訊息。

Docker worker healthcheck、循環 freshness／heartbeat 的外部觀測契約留 P0.5；不能只用另一個程序成功連上 DB 就宣稱 worker loop 健康。

## 停止與 ownership

`createShutdown` 只執行一次關閉流程，重複呼叫共用 Promise；成功或失敗都移除期限 timer。API 超時保留原本的 HTTP connections 強制關閉行為；worker 先 abort timer 等待 loop 完成，再關閉 DB。正常的長 poll 不需等滿 interval 才停止。[Node 24.22.1 timers](https://raw.githubusercontent.com/nodejs/node/v24.22.1/doc/api/timers.md)

服務呼叫端應等待 close／done，不能只等待借用 idle controller 的 stop 就宣稱 DB 已釋放。unexpected loop 錯誤也會觸發服務清理；CLI 觀察 done 的拒絕並以非零結束。signal 關閉失敗時入口會非零終止，library helper 不自行呼叫 process.exit。

deadline 是合作式等待期限，無法搶占同步 SQLite、同步 callback 或核心中阻塞的 I/O；不承諾 hard wall-clock 中斷。更長工作與失去 ownership 後的副作用控制須由後續工作執行模型處理。

SIGINT／SIGTERM 只在 main 明確註冊，首次 signal 後移除自身兩個 handlers，不移除其他 listener。Windows 不提供與 Linux 相同的 SIGTERM 投遞語意；`process.emit` 能驗 Node callback，但不能當 Linux OS signal 驗證。[固定版本 process 文件](https://raw.githubusercontent.com/nodejs/node/v24.22.1/doc/api/process.md)

## 驗證與後續

`test:system` 先 build 再執行真正 API／worker 程序；兩個 cwd 使用同一絕對暫存 state。受控 IPC 只存在 `tests/system/fixtures/service.mjs`，正式入口不註冊測試控制命令。測試核對兩個 PID、各自 DB diagnostics、真實 HTTP、狀態變化、分開停止／重啟，以及關閉後 DB／signals／程序退出與 fixture 移除。

沒有 IPC 的正式 worker CLI 另外驗證多輪 debug ticks；此例以本次 ChildProcess 物件強制終止，和正常 callback 關閉分開記錄。所有 fixture 都只清理自己建立的程序及核對過的暫存路徑。

下一份 P0.5 固定 Linux image／Compose、同 image 的 migration 成功 gate、本機 state、身份／掛載、健康契約及真正 OS signal；P0.4 不建立 Docker 設定或宣稱該環境通過。
