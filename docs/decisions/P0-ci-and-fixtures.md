# P0.7 共用 fixtures 與 CI 決策

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

日期：2026-10-28。應用程式 `0.7.0`，DB schema revision 1；既定 Node、pnpm 與套件版本不變。本份完成 P0 的工程驗收入口；登入、檔案與持久工作仍依主計畫後續實作。

## 共用測試資源

- `tests/helpers/temporary-directory.ts` 不依賴測試 runner。只建立 `filehub-…-` 前綴的隨機目錄，保存 realpath、device／inode；dispose 先拒絕 junction／symlink、替換目錄與邊界外目標，再移除自己的根目錄。重複呼叫共用同一 Promise，拒絕後保留現場。
- `tests/helpers/node-process.ts` 共用實際 Node 子程序、IPC、輸出與退出等待；只終止自身建立的 child，不搜尋 PID。等待上限 8 秒，緊急停止 2 秒；輸出合計上限 65,536 字元、未消費 IPC 上限 256 筆。正常案例仍要求自然退出、DB 關閉及 signal callbacks 移除。
- `tests/helpers/environment.ts` 過濾繼承的 `FILEHUB_*`、Node 啟動選項／compile cache 與衝突的色彩設定，再套用 fixture 明確值；不更改父程序設定。
- DB、toolchain、HTTP、system、Compose 與 Playwright 使用共用目錄 helper。Playwright 與 system 共用 `tests/system/fixtures/service.mjs`，移除重複 wrapper；IPC 仍只存在測試入口。
- runner 的 hooks 保留在各層 fixture；建立者先關閉連線／程序或自己的 Docker 資源，再 dispose。這些是受控測試資源的 ownership 防護，不作正式檔案服務的路徑授權實作。

新增 6 個真實 FS／子程序案例，涵蓋重複清理、symlink／junction 替換、同路徑目錄被換掉、非法前綴／環境隔離、提前退出與輸出上限。既有 WAL、API／worker、HTTP 與瀏覽器斷言保留。

Compose 的前後比對只包含未帶 `filehub.test-run` ownership label 的原有服務；其他獨立驗收容器可正常完成／退出，不將它們當作必須持續運行的正式服務。每份 fixture 仍核對自己的 token 後清理。

## 可重現的命令

根 `package.json` 為命令契約：

| 命令 | 責任 |
| --- | --- |
| `pnpm check:project` | 核對 Node、工具鏈、四個 private package 版本、直接依賴精確版本及 image tag／label 一致性 |
| `pnpm check` | metadata、獨立 typecheck、lint、一次 build、toolchain、unit、integration、HTTP／system；不要求 browser 或 Docker |
| `pnpm test:integration` | 先 build，再執行 integration；乾淨 checkout 亦可使用 |
| `pnpm test:integration:run`、`test:e2e:run` | 使用已完整 build 的本機產物，供總驗收避免重複 build |
| `pnpm test:compose:build` | 以根版本作 tag，從 `.env.example` 建置正式 migration／API／worker 共用 image，不啟動服務；15 分鐘有界等待 |
| `pnpm test:compose:run` | 只執行隔離 Compose tests，要求已建對應版本 image |
| `pnpm verify:core` | `check` 後執行 Chromium 三視窗；browser 需先安裝 |
| `pnpm verify:p0` | `verify:core`、正式 image build、Compose tests；完整 P0 本機入口 |

本份乾淨 Linux 驗證曾發現 API ownership 整合測試在 build 前執行，因缺少 `apps/web/build/index.html` 失敗。已將完整 build 放到整合測試前；typecheck 仍獨立 no-emit，不能以 Windows 工作目錄殘留產物判定乾淨環境可用。

## GitHub Actions

[workflow](../../.github/workflows/ci.yml) 在 main push、pull request 或手動執行時觸發：

1. `core` matrix：Ubuntu 24.04、Windows Server 2022；由 `.node-version` 及 `packageManager` 安裝固定 Node／pnpm，明確 frozen install，安裝 Chromium，再執行 `verify:core`。Linux 額外安裝 Playwright OS dependencies。
2. `compose`：前述兩個 core jobs 成功後，在 Ubuntu 24.04 重新 frozen install，建正式 image，再跑四個隔離 Compose cases。

目前 core timeout 110 分鐘、compose 20 分鐘。內容唯讀權限、checkout 不保存 credentials、不使用 dependency cache；取消同一 ref 的舊 run。2026-11-05 依原始碼發佈範圍移除 browser 失敗附件上傳；測試仍執行，工作日誌由 CI 提供，截圖／trace／報告不另上傳。

| Action | 已核對 tag | 固定 commit SHA |
| --- | --- | --- |
| actions/checkout | v7.0.1 | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| actions/setup-node | v7.1.0 | `949feb2413d6458794dcd2491c4babbbce0c15c1` |
| pnpm/action-setup | v6.1.0 | `ea17c68df8912ef543352723c149a84f56e3d413` |

以官方 release 與 Git refs 核對 SHA；actionlint `1.7.12` 作 workflow 語法／型別驗證。Actions 的 Node runtime 與專案 Node 分開；setup-node 選取專案指定版本。官方依據：[setup-node](https://github.com/actions/setup-node)、[pnpm setup](https://github.com/pnpm/action-setup)、[Playwright CI](https://playwright.dev/docs/ci)、[runner images](https://github.com/actions/runner-images)。

本次依要求只 commit、不 push，因此尚無 GitHub hosted run；本機等價命令及 actionlint 通過，不能宣稱 hosted matrix 已成功。第一次遠端執行仍需檢查實際結果。

## Linux 本機驗收與限制

另提供 `docker/ci.Dockerfile` 及專用 allowlist dockerignore：固定同一 Node Bookworm base digest，在 Linux 重新 frozen install 原生依賴、安裝 Chromium／OS libraries，再以 UID/GID 1000 執行 `verify:core`。不帶入主機 `.git`、`.tools`、node_modules、dist、web build 或真實 env；`.env.example` 明確允許供 metadata 檢查。

驗證容器無 host mounts、Docker socket 或公開 port；設定 2 CPU、2 GiB RAM、512 PIDs、256 MiB shm。可寫容器層供建置及暫存 fixtures；與正式唯讀 runtime image 分開。這是 Debian 12／Docker Desktop WSL2 的本機驗收，不等於 Ubuntu hosted runner 或效能／容量基準。

平台、資源設定、重跑與清理命令見 [P0 驗收操作](../operations/p0-checklist.md)，本次實測及未驗項目見 P0.7 摘要（本機 `../validation/P0.7.md`）。
