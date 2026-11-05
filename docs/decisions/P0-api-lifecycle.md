# P0.2 API 契約與生命週期

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

日期：2026-10-27。狀態：已實作，Windows x64 驗證通過。對應[主計畫 P0.2](../../IMPLEMENTATION_PLAN.md#p0-契約工具鏈與可啟動骨架)，結果見驗證摘要（本機 `../validation/P0.2.md`）。新增最小 API，版本由 `0.1.0` 升為 `0.2.0`；第三方工具版本沿用 [P0.1 決策](P0-tooling.md)。

本文件記錄 P0.2 的決策；[P0.3](P0-persistence.md) 已接入正式 DB。P0.3 起 factory 缺 probe 預設未就緒，API main 擁有 DB 並檢查設定／schema／migration history；以下 P0.2 預設就緒行為屬當時的過渡狀態。

## 公開契約

TypeBox schemas 與推導型別放在 `packages/contracts/src/errors.ts`、`health.ts`，由套件入口公開；不含 Fastify、DB entities 或 Node I/O。

| 路由／情況 | HTTP | 回應 |
| --- | --- | --- |
| `GET /health/live` | 200 | `{"status":"ok"}` |
| `GET /health/ready`，probe 成功 | 200 | `{"status":"ready"}` |
| probe 回 false、拋錯、逾時或正在關閉 | 503 | `{"status":"not_ready"}` |
| 格式錯誤／schema 驗證失敗 | 400 | `BAD_REQUEST` |
| 未知路由 | 404 | `NOT_FOUND` |
| 超過 1 MiB body | 413 | `PAYLOAD_TOO_LARGE` |
| 不支援的內容格式 | 415 | `UNSUPPORTED_MEDIA_TYPE` |
| 一般服務未就緒錯誤 | 503 | `SERVICE_UNAVAILABLE` |
| 未預期錯誤 | 500 | `INTERNAL_ERROR` |

一般錯誤格式為 `{ code, message, requestId, details? }`。訊息固定，`details` 目前只允許驗證位置 `body | querystring | params | headers`，不附原始輸入或驗證器診斷。readiness 的 503 使用 health 狀態格式。應用程式產生 UUID，忽略呼叫端提供的 request ID，回 `x-request-id` 與 `cache-control: no-store`。

error handler 安裝在 root Fastify instance，使後續封裝 plugins 繼承；功能模組新增錯誤需先擴充契約與測試，不能直接回傳 exception。

## 設定與啟動

`parseConfig(environment)` 明確呼叫才讀取設定並回傳 frozen config；沒有 import 階段的設定解析。預設值與範圍見 [README](../../README.md#設定)、[.env.example](../../.env.example)。只接受明確 IP 與十進位整數；非法設定在建立 app 前失敗，CLI 列出變數名稱及要求，不回顯值。

`pnpm start:api` 執行編譯後的 `server.js`；Node 的 `--env-file-if-exists=.env` 載入可選設定檔，既有環境變數優先。factory 不讀 `.env`，測試可直接提供隔離的設定。

## 資源 ownership 與關閉

| 入口 | 責任 |
| --- | --- |
| `buildApp({ config, dependencies })` | 建立 Fastify、plugins 與 hooks；不 listen、不建立 DB、不掃描檔案 |
| `dependencies.readiness(signal)` | 借用的檢查函式，回 boolean／Promise；其外部資源由呼叫端關閉 |
| `listenApp(app, config)` | 開啟 listener；啟動失敗時清理 app，清理也失敗時保留兩個內部錯誤 |
| `closeApp(app, timeoutMs)` | 同 app 共用一個關閉 Promise；逾時關閉 HTTP connections 並拒絕 |
| `server.ts` 的 `main` | 解析設定、組裝、註冊 SIGINT／SIGTERM 並 listen；關閉時移除 handlers |

`server.ts` 僅在 `import.meta.main` 時自動呼叫 `main`；匯入編譯產物不啟動服務、不註冊 handlers。library 不呼叫 `process.exit`；API signal callback 的關閉失敗會讓程序以非零終止。

readiness 每次有獨立 AbortSignal／timer，`preClose` 通知在途檢查；逾時、結束後清理 timer／listener。預設 probe 只表示目前沒有正式依賴的最小 API 就緒。P0.3 必須接入 DB adapter 與 schema 相容性，不能以此預設結果替代 DB 驗證。

關閉與 readiness deadline 限制非同步等待；無法搶占同步 JavaScript、同步 SQLite 或核心中阻塞的 NFS I/O。注入 probe 應遵守 AbortSignal，之後建立的 adapters 也須明定自身 ownership 與關閉順序。

## 日誌與驗證分層

Fastify `5.12.7` 使用 `LogController({ disableRequestLogging: true })`，避免已 deprecated 的頂層選項。預設不記原始 URL、headers 或 exception；500 僅記固定事件 `request_failed`，並保留 logger 的 requestId。設定 auth／cookie 欄位遮蔽作額外邊界，後續模組仍不得將原始秘密寫入自訂日誌。

Vitest 的 toolchain、unit、integration、http projects 分開收集。`test:http` 先 build，再驗真實 loopback HTTP 與編譯產物子程序；Playwright 瀏覽器流程留 P0.6。Windows 的 Node signal callback 測試不證明 Linux OS signal 行為。

參考 File Browser 固定 commit `833d908884d5c801f30f5c098d7977177eb3a36b` 的 `http/http.go`、`http/static.go`、`cmd/root.go` 及[報告 03 §1–3](../filebrowser-study/03-backend-and-api.md)，只取組裝與請求流程需求；公開契約與生命週期依 FileHub 架構重新實作。
