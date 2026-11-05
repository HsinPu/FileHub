# P0.6 前端入口、同源產物與瀏覽器驗證

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

日期：2026-10-28。應用程式 `0.6.0`，DB schema revision 仍為 1。前置為 [P0.5](P0-deployment.md)，驗證見 P0.6（本機 `../validation/P0.6.md`），視覺規範見 [DESIGN](../../DESIGN.md)。

後續 [P0.7](P0-ci-and-fixtures.md) 已共用 Node／目錄 helpers 與 system service wrapper，瀏覽器輸出改為 `test-results/e2e`，並建立 `verify:core`／`verify:p0` 及 CI，當時版本 `0.7.0`。下文保留 P0.6 的前端決策，P0 平台與結果見 P0.7 摘要（本機 `../validation/P0.7.md`）；最新功能依根 README／主計畫。

## 畫面與工程邊界

本份提供最小「系統概覽」：真實 API／DB readiness、重新檢查、載入／未就緒／錯誤狀態，以及尚未開放登入／檔案操作的明確說明。只有首頁與 fragment 導覽，不建立假檔案、帳號、上傳按鈕或未接後端的功能頁；工作空間在 P1.4 擴充。

沿用已鎖定 React／React DOM `19.3.1`、Ant Design `6.6.8`、Vite `8.3.5`／React plugin `6.1.2`，沒有更換已定案版本。ConfigProvider 的繁體中文、palette、字體、控制項與圓角集中於 `apps/web/src/theme/`、`app/Providers.tsx`；CSS 自有元件使用同一組變數，不覆寫 `.ant-*` 內部選擇器。[Ant Design ConfigProvider](https://ant.design/components/config-provider/)

`main.tsx` 才掛載 React；`src/index.ts` 只公開 client，不建立 DOM。前端僅引用 contracts 與瀏覽器套件，不引用 server／Node I/O。Vite config 是獨立的 Node 工程設定，由 tools typecheck 驗證；不把 Node 全域型別加入瀏覽器程式。

## API client

- 相對路徑 `/health/ready`，same-origin credentials／mode、no-store、拒絕 redirect，不需要另一份公開 API origin 或 CORS 設定。
- 以前後端共用的 TypeBox schema 逐次驗外部 `unknown`。web 明確新增既有 `typebox@1.4.3` 依賴，沒有借用未宣告的傳遞依賴。
- 健康回應區分 `200 + ready` 與 `503 + not_ready`；不把正常未就緒狀態當一般 HTTP 例外。額外欄位、未知狀態或不相符的 HTTP 語意皆拒絕。
- 其他錯誤使用固定繁體中文訊息；合法公開錯誤只取 code、HTTP status、requestId，不反射任意 message／HTML／exception。畫面可提供問題編號供回報。
- 每次預設 5 秒 timeout，接受呼叫端 AbortSignal，結束移除 listener／timer；重新發起或卸載會取消舊請求，舊結果不可覆蓋新狀態。這是瀏覽器等待契約，不能中斷伺服器同步 SQLite 或核心 I/O。

## 正式產物與路由

`pnpm build` 先執行 TypeScript project references，再執行 Vite。`apps/web/dist` 保留 JS／宣告，部署用 HTML／CSS／JS 放在 `apps/web/build`，避免 Vite emptyOutDir 刪掉 TypeScript outputs。build、dist、測試輸出分別由 Git／Docker／ESLint 忽略；不將產物當原碼 lint。[Vite 靜態部署](https://vite.dev/guide/static-deploy)

後端新增精確依賴 `@fastify/static@10.1.7`，其已安裝 plugin 宣告 Fastify `5.x`，並通過目前 `5.12.7` 的實測。查詢時最新 `10.1.8` 剛發布，發布說明為 dotfiles 文件修正；採已發布數日的 `10.1.7`，不新增發布等待例外，明確設定 dotfiles deny。[固定版本原碼](https://github.com/fastify/fastify-static/blob/v10.1.7/index.js)、[10.1.8 發布說明](https://github.com/fastify/fastify-static/releases/tag/v10.1.8)

- `buildApp` 接受明確 `webRoot` 才註冊 web plugin，原有純 API factory 測試不需依賴網站檔案；正式 API main 使用模組相對的 `apps/web/build`，不依賴 cwd。
- 啟動時要求 index.html／assets 存在；缺少前端產物即啟動失敗，main 按既有生命週期關 DB。
- 只開 `/`、`/index.html` 與 build assets 的明確路由。assets 註冊 `wildcard: false`，不公開整個 repo、source、DB、dotfiles 或開發端點。未知 `/api/*`、`/health/*`、缺少資產及其他路徑保持 JSON 404；未加入全域 SPA fallback，之後新增 UI route 時需明確擴充。
- HTML 為 `no-store`，帶雜湊的 assets 為 `public, max-age=31536000, immutable`；兩者皆 nosniff。plugin 的 setHeaders 也會用於 sendFile(index)，必須明確保留 HTML 不快取，不能只依 sendFile 的 cacheControl 選項。[static plugin](https://github.com/fastify/fastify-static/tree/v10.1.7)
- Docker builder 建立同一份 SPA，runtime 複製到 `/app/apps/web/build`；仍用同 image 的 API／worker／migration、UID 1000 與唯讀 rootfs。正式服務不使用 Vite dev／preview server。

開發時可 `pnpm dev:web`，Vite 只綁 loopback 5173，將 `/health` proxy 到原生 API 的 127.0.0.1:3000；正式瀏覽器驗證使用 Fastify 提供的 build。

## Playwright ownership 與矩陣

固定 Playwright `1.64.1` 的 Chromium `156.0.8078.4`（revision 1248），代表視窗 1440×1000、800×1024、390×844，light／zh-TW／Asia/Taipei／scale 1／reduced motion。這是 Windows 視窗矩陣，未模擬真實手機觸控，也不宣稱其他瀏覽器已驗。

`scripts/playwright.mjs` 在載入 registry **之前**設定本機 `.tools/playwright-browsers`，install／test 共用位置，尊重明確的路徑 override。wrapper／API child 清理互斥的 NO_COLOR／FORCE_COLOR 設定，不使用停用全部警告的方式掩蓋程式問題。

每個測試先建立 `filehub-p06-*` 暫存 root 與正式 file-backed DB／migration，再啟動編譯 API 的測試 wrapper，使用 OS 動態 loopback 埠。IPC 控制只在測試檔：回報實際位址與 owned PID，收尾等待 app 關閉／DB 連線釋放與自然 exit 0，再核對 realpath 刪除自己的目錄；失敗只終止自身 child。Browser／context 由 Playwright 管理，不重用一般服務。[Playwright fixtures](https://playwright.dev/docs/test-fixtures)

真實 DB revision 失配驗 503 與恢復；HTTP／網路替身只用於前端錯誤呈現，不當作實際後端故障證明。`pnpm check`、`pnpm test:e2e`、`pnpm test:compose` 分開執行；E2E 不自動跳過缺少瀏覽器。P0.7 再提供統一驗收入口、CI 設定及 Windows／隔離 Debian 矩陣，hosted jobs 尚未執行。
