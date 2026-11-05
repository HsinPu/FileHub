# P0.1 工具鏈與 workspace 決策

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

日期：2026-10-27。狀態：已實作，Windows x64 的 P0.1 驗證通過；結果見 P0.1 驗證摘要（本機 `../validation/P0.1.md`）。本文件補齊[已確認工具鏈](../toolchain-recommendation.md)之外的初始依賴及工程設定。

後續 P0.5 已以相同精確依賴及 frozen lockfile 完成固定 Linux image／Compose 驗證；digest 與平台邊界見[部署決策](P0-deployment.md)。下文保留 P0.1 當時的決策與範圍。

P0.6 已啟用既定 React／Ant Design／Vite／Playwright 版本，新增 static plugin 的精確版本與 client 邊界見[前端決策](P0-web.md)。

## 版本與範圍

首次建立開發版本 `0.1.0`。根 `package.json` 是版本來源，三個私有 workspace 同版；後續實質程式變更依 SemVer 同步更新，純文件不增加版號。這個版本只有工具鏈及可編譯入口，尚無可啟動的 FileHub API 或網站。

| 類別 | 精確版本 |
| --- | --- |
| 已定案執行環境 | Node.js `24.22.1` LTS、pnpm `12.16.0` |
| 已定案資料存取 | better-sqlite3 `13.0.3`、Drizzle ORM `0.45.4`、Kit `0.31.11`；本次原生 driver 實測 SQLite `3.53.4` |
| 編譯／lint | TypeScript `6.0.3`、ESLint `10.13.0`、`@eslint/js` `10.0.1`、typescript-eslint `8.72.0` |
| HTTP／schema | Fastify `5.12.7`、`typebox` `1.4.3`、`@fastify/type-provider-typebox` `6.3.0`、`ajv-formats` `3.0.1` |
| 測試 | Vitest `5.0.5`、`@playwright/test` `1.64.1`；本次只執行 Vitest 工具鏈相容性案例 |
| 前端依賴 | React／React DOM `19.3.1`、Ant Design `6.6.8`、Vite `8.3.5`、`@vitejs/plugin-react` `6.1.2` |
| 型別套件 | `@types/node` `24.19.2`、`@types/better-sqlite3` `9.6.0`、`@types/react`／`@types/react-dom` `19.3.0` |

各版本均已核對 npm metadata，並在本機乾淨安裝。完整直接依賴在[根 manifest](../../package.json)、[server](../../apps/server/package.json)、[web](../../apps/web/package.json)、[contracts](../../packages/contracts/package.json)；直接依賴精確鎖版，內部相依使用 `workspace:*`，傳遞依賴由單一 [pnpm-lock.yaml](../../pnpm-lock.yaml) 固定。

## 選擇理由

- TypeScript 7 已有發布版本，但目前選定的 typescript-eslint 宣告 TypeScript `>=4.8.4 <6.1.0`。採 `6.0.3` 以符合相容範圍；typescript-eslint 採已發布一週的 `8.72.0`，避免安裝時為當日新版本自動增加發布等待例外。[固定版本 metadata](https://registry.npmjs.org/typescript-eslint/8.72.0)
- API schema 使用 `typebox` 1.x 與 Fastify Type Provider 6.x，保持 JSON Schema 與 TypeScript 型別一致，伺服器使用 Fastify 的執行期驗證。Provider 的 peer 為 `typebox ^1.1.14`；不混用 `@sinclair/typebox` 0.x。公開 schema 之後放 contracts，DB schema 留在 server；P0.2 才開始定義產品 API。[官方 provider 文件](https://github.com/fastify/fastify-type-provider-typebox)
- 使用 TypeScript project references 建置 contracts → server／web；`typecheck` 使用獨立 no-emit 設定與 source alias，不依賴先存在的 dist。原始碼與測試採 strict、未使用宣告、索引及 optional property 檢查；`skipLibCheck` 只略過第三方宣告檔的內部檢查。
- 後端與公開契約以 ESM／NodeNext 編譯，web 使用 Bundler module resolution、DOM 與 JSX 型別。web／contracts 不注入 Node 全域型別，ESLint 另禁止其引用 Node builtins、server 及 workspace 私有路徑。
- Vitest 只收集目前的工具鏈測試；Playwright 及正式單元／整合／系統 runner 在對應 P0 工作建立，不用空測試或未啟動的瀏覽器宣稱通過。

## 工具與安裝政策

`.node-version`、根 `engines` 及 `packageManager` 固定已定版本；`pnpm-workspace.yaml` 啟用 engine／peer 檢查及精確版本保存。pnpm 12 不再接受舊版的 `packageManagerStrict`、`packageManagerStrictVersion`、`managePackageManagerVersions` 設定，本專案沒有保留這些失效選項。

pnpm 12 的設定放在 workspace YAML；`minimumReleaseAgeStrict: true` 防止安裝時靜默新增發布等待例外，依賴 build scripts 只明確允許 esbuild／rolldown。安裝後出現的兩項 deprecated 傳遞依賴來自固定 Kit 使用的 `@esbuild-kit/core-utils`／`esm-loader`，未以未驗證 override 替換。[pnpm 設定](https://pnpm.io/settings)

本次 Node／pnpm 從官方來源下載並核對 archive checksum／integrity，放在 Git 忽略的 `.tools/`；pnpm store／cache 也在此目錄，未更新全域工具。新環境需先準備精確 Node／pnpm，然後執行 README 的 frozen install。Windows 與 Linux 必須各自安裝原生依賴；Linux image、digest 與正式雙服務驗證留 P0.5。

目前 `build` 產生三個 workspace 的 JS／宣告檔，不產生 SPA；Fastify factory 留 P0.2、正式 DB adapter／migration 留 P0.3、worker 留 P0.4、React 頁面與瀏覽器啟停留 P0.6。
