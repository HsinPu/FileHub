# P9 設計預覽

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

此目錄是[視覺研究與提案](../../reviews/p9-design-review.md)的獨立設計工具，**沒有修改或部署正式 FileHub**。實作順序與進度見[主計畫 P9](../../../IMPLEMENTATION_PLAN.md#p9-視覺層級與一致性)。

## 開啟

在儲存庫根目錄，使用已定案 Node：

```shell
node docs/design/P9/serve.mjs
```

開啟終端輸出的 `http://127.0.0.1:<動態埠>/docs/design/P9/preview.html`；以 Ctrl+C 停止。helper 僅綁定 loopback，明列允許的三個預覽檔、四個既有授權字體與 P8 合成參考圖，不服務 `.env`、私人資料或整個儲存庫。

頂部選擇列表、圖磚、圖庫、已選取、長名稱、空目錄、讀取失敗、partial、個人設定、工作、登入或公開分享；「看 P8 原圖」開啟對應桌面基線。上傳／新建只打開示意表單，下載／儲存只提示，沒有真實資料操作。請勿輸入真實帳密。

這是設計審查用 HTML／CSS／JavaScript；正式實作仍用既有 React／Ant Design 元件、公開 API 與 controller。本預覽的資料夾開啟、選取／更多動作、權限、表單提交及搜尋均為有限示意，不能當成功能驗收。圖庫示範無安全縮圖的 placeholder，沒有假的內容圖片。部分管理分類只呈現標籤；正式版全部入口必須保留。

## 可重跑檢查

先依根 README 安裝固定 workspace 與 Playwright Chromium，再執行：

```shell
node docs/design/P9/verify.mjs
```

檢查會自行啟停專屬 server／browser，在 `.tools/p9-design-<隨機值>/` 輸出新圖與 `checks.json`，不覆寫本次保存的原圖。使用與專案相同的 `PLAYWRIGHT_BROWSERS_PATH`；未設定時預設根 `.tools/playwright-browsers`。沒有瀏覽器直接失敗，不 skip。

## 本次畫面

Windows Chromium 156.0.8078.4；light／deviceScaleFactor 1；1440×1000、800×1024、390×844。全部是合成資料、無正式身份與密鑰。上方審查列不屬產品；尺寸與密度取捨見[提案 §6](../../reviews/p9-design-review.md#6-驗收與取捨)。

| 場景 | 桌面 | 平板 | 手機 |
| --- | --- | --- | --- |
| 詳細列表 | 原圖（本機 `evidence/desktop-list.png`） | 原圖（本機 `evidence/tablet-list.png`） | 原圖（本機 `evidence/mobile-list.png`） |
| 圖磚 | 原圖（本機 `evidence/desktop-mosaic.png`） | 原圖（本機 `evidence/tablet-mosaic.png`） | 原圖（本機 `evidence/mobile-mosaic.png`） |
| 圖庫 | 原圖（本機 `evidence/desktop-gallery.png`） | 原圖（本機 `evidence/tablet-gallery.png`） | 原圖（本機 `evidence/mobile-gallery.png`） |
| 選取 | 原圖（本機 `evidence/desktop-selected.png`） | 原圖（本機 `evidence/tablet-selected.png`） | 原圖（本機 `evidence/mobile-selected.png`） |
| 長名稱 | 原圖（本機 `evidence/desktop-long.png`） | 原圖（本機 `evidence/tablet-long.png`） | 原圖（本機 `evidence/mobile-long.png`） |
| 空目錄 | 原圖（本機 `evidence/desktop-empty.png`） | 原圖（本機 `evidence/tablet-empty.png`） | 原圖（本機 `evidence/mobile-empty.png`） |
| 讀取失敗 | 原圖（本機 `evidence/desktop-error.png`） | 原圖（本機 `evidence/tablet-error.png`） | 原圖（本機 `evidence/mobile-error.png`） |
| 部分結果 | 原圖（本機 `evidence/desktop-partial.png`） | 原圖（本機 `evidence/tablet-partial.png`） | 原圖（本機 `evidence/mobile-partial.png`） |
| 個人設定 | 原圖（本機 `evidence/desktop-settings.png`） | 原圖（本機 `evidence/tablet-settings.png`） | 原圖（本機 `evidence/mobile-settings.png`） |
| 工作 | 原圖（本機 `evidence/desktop-tasks.png`） | 原圖（本機 `evidence/tablet-tasks.png`） | 原圖（本機 `evidence/mobile-tasks.png`） |
| 登入 | 原圖（本機 `evidence/desktop-login.png`） | 原圖（本機 `evidence/tablet-login.png`） | 原圖（本機 `evidence/mobile-login.png`） |
| 公開分享 | 原圖（本機 `evidence/desktop-public.png`） | 原圖（本機 `evidence/tablet-public.png`） | 原圖（本機 `evidence/mobile-public.png`） |

另驗手機工作與選取並存（本機 `evidence/mobile-tasks-selected.png`）。檢查項目、每張 SHA、色對比與量測見 checks.json（本機 `evidence/checks.json`）；本次實際命令與界線見 P9-design 驗證（本機 `../../validation/P9-design.md`）。這些圖片由本次預覽直接擷取，未修改 PNG；P8 的歷史畫面保持原始 bytes。

## 資產

預覽引用現有 `apps/web/src/assets/fonts/` 的本機 Roboto 與 Material Icons；未新增／修改第三方資產。來源、授權及聲明沿用 [THIRD_PARTY_NOTICES.md](../../../THIRD_PARTY_NOTICES.md)。預覽 CSS 為本次提案；不另宣告整個 FileHub 的授權。
