# 配色與 SVG Logo 比較預覽

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

此目錄是[配色與品牌檢查](../../reviews/p10-color-and-logo-review.md)的獨立設計工具，含三份可編輯 SVG；建立時正式 FileHub 為 P9／0.40.14。後續進度依[主計畫 P10](../../../IMPLEMENTATION_PLAN.md#p10-配色與-svg-識別候選)。

使用者後續要求改用 Image Gen 設計，新增[文件交疊 H 圖像第二稿](logo-image-v2.md)與透明 PNG。此稿獨立保存供比較；下列互動預覽與既有截圖仍展示原 SVG，不把舊驗收套用到新 PNG。

2026-11-01 已核准 H 圖像並完成正式 React 的 P10.1（本機 `../../validation/P10.1.md`），後續 P10.2（本機 `../../validation/P10.2.md`） 已完成白色畫布，程式為 0.40.16；本目錄的比較工具與舊證據保持原樣，8088 已依 P10.4（本機 `../../validation/P10.4.md`）交付 0.40.16。

後續採[白色畫布方向](../../decisions/P10-white-canvas.md)，P10.2 已完成實作與受影響 Windows 驗證，P10.3 已完成、P10.4 已完成交付，詳見[驗收稽核](../../reviews/acceptance-readiness-2026-11-01.md)。這個舊比較工具未換成白色新稿，不能用來代表最新設計或正式交付。

## 開啟與比較

在根目錄使用已定案 Node：

```shell
node docs/design/P10/serve.mjs
```

開啟輸出的 loopback 動態網址。配色可切換「墨藍＋暖金」與「P9 色票（同版面）」，場景可看 SVG 尺寸板、三檢視、設定、登入、公開頁與工作。「看正式 P9 原圖」另開對應合成證據。

這是 HTML／CSS 原型，沿用 P9 設計工具的合成資料。上傳、儲存與下載都是排版示意；不讀取或建立正式身份，也不讀寫 API、Cookie 或 browser storage，不要輸入真實帳密。CSP 禁止 connect，server 只允許 GET 的明列預覽、SVG、本機字型及 P9 合成原圖；不服務整個儲存庫。停止用 Ctrl+C。

## SVG

| 資產 | 使用背景 |
| --- | --- |
| [彩色](assets/filehub-symbol.svg) | 白／淺底，墨藍資料夾與暖金頁籤 |
| [單色](assets/filehub-symbol-mono.svg) | 白／淺底、單色標示 |
| [反白](assets/filehub-symbol-reverse.svg) | 深底 |

均為原生 path，負形 F 透明，沒有內嵌 PNG、文字字型或外部依賴；同一 viewBox。預覽的 FileHub 字標仍為 HTML 文字。反白版不代表新增產品深色模式。若用 `<img>` 可直接選對應變體；若內嵌多份 inline SVG，需處理重複 title ID。

## 重跑與證據

```shell
node docs/design/P10/verify.mjs
```

需根 README 的固定 workspace 與 Playwright Chromium，瀏覽器路徑規則沿用專案。每次建立自己的 server／headless browser，結果輸出到新的 `.tools/p10-design-<隨機值>/`，finally 關閉自有程序；不讀取 8088 的私有分頁或改原資料。

本次 Windows Chromium 156.0.8078.4、DPR 1、light／reduced motion；1440×1000、800×1024、390×844、320×640 的 30 張原圖保存在 evidence（本機 `evidence/checks.json`），來源及 PNG SHA 同檔。每張已實際檢視；桌面與手機完整代表場景、平板／320px 部分場景，不聲稱所有尺寸全場景。

| 代表畫面 | 圖片 |
| --- | --- |
| Logo／大小／三變體 | 桌面（本機 `evidence/desktop-brand-p10.png`）、平板（本機 `evidence/tablet-brand-p10.png`）、手機（本機 `evidence/mobile-brand-p10.png`）、320px（本機 `evidence/narrow-brand-p10.png`） |
| 列表比較 | 候選（本機 `evidence/desktop-list-p10.png`）、P9 色票（本機 `evidence/desktop-list-p9.png`）、手機候選（本機 `evidence/mobile-list-p10.png`）、手機 P9 色票（本機 `evidence/mobile-list-p9.png`） |
| 設定比較 | 候選（本機 `evidence/desktop-settings-p10.png`）、P9 色票（本機 `evidence/desktop-settings-p9.png`）、手機（本機 `evidence/mobile-settings-p10.png`） |
| 登入比較 | 候選（本機 `evidence/desktop-login-p10.png`）、P9 色票（本機 `evidence/desktop-login-p9.png`） |
| 其他 | 圖磚（本機 `evidence/desktop-mosaic-p10.png`）、圖庫（本機 `evidence/desktop-gallery-p10.png`）、選取（本機 `evidence/desktop-selected-p10.png`）、工作（本機 `evidence/mobile-tasks-p10.png`）、公開頁（本機 `evidence/mobile-public-p10.png`） |

這些是設計證據，不代替 React、Ant Design、後端或真實授權／寫入驗收。初次平板品牌卡片溢出已修正並重跑，見驗證摘要（本機 `../../validation/P10-design.md`）。

## 來源

預覽從專案 P9 設計工具延伸；P9 歷史檔保持原樣。字型仍引用既有 Roboto／Material Icons，授權與版本依 [THIRD_PARTY_NOTICES](../../../THIRD_PARTY_NOTICES.md)。SVG 是本次繪製；沒有另宣告整個 FileHub 的授權。
