# File Browser REA 執行與畫面證據

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

指定 commit 已成功建置成可執行的 Go＋Vue 服務，並在隔離測試資料下驗證登入、檔案瀏覽、新增資料夾、TUS 上傳、重新命名及永久刪除。REA 保存被動瀏覽器觀察與 16 張畫面；桌面、平板與手機的布局可直接作為 FileHub 改寫參考。

## 1. 建置身分與隔離條件

| 項目 | 本次條件 |
| --- | --- |
| 原始碼 | `git archive` 匯出 `833d908884d5c801f30f5c098d7977177eb3a36b`，來源工作樹保持不變 |
| 前端 | Node 24 Alpine、pnpm 10.33.4、`pnpm install --frozen-lockfile`、`pnpm run build` |
| 後端 | Go 1.25 Alpine，`CGO_ENABLED=0 go build`；Go 可依 `go.mod` 自動選擇相容工具鏈，詳見建置紀錄 |
| 版本字串 | `study-833d9088`，linker 注入完整來源 commit |
| 研究映像 | `filehub-filebrowser-study:833d9088` |
| Image ID | `sha256:0f27878337483693b4a66e3f588d1dd63a563689da61cdc78d68d5ade094c225` |
| `/filebrowser` SHA256 | `67ecfe431daabffe8739b4cefd44f3e31896e450e57d547297609f0ea11ad67c` |
| 服務 | `127.0.0.1:18765`，容器內 `8080`；command runner 關閉 |
| 資料 | 暫存目錄 `/srv` 與 `/data`；測試管理員 `study`；未掛載原 FileHub 或使用者實際檔案 |
| 瀏覽器 | 獨立暫存 profile、Headless Chrome `155.0.8059.85`，CDP 僅 loopback `19227` |
| 畫面尺寸 | 桌面 1440×1000、平板 800×1024、手機 390×844；屬視窗模擬，未模擬真實觸控裝置 |

建置方式保存在 Dockerfile.study.txt（本機 `evidence/Dockerfile.study.txt`），完整輸出在 build.log（本機 `evidence/build.log`）。型別檢查、Vite build 與 Go build 均成功。Vite 有大型 chunk、Browserslist 資料及 template／custom.css 的建置警告；沒有因此宣稱專案所有單元或整合測試通過。這是本機來源建置，不是下載並分析官方發行二進位。

## 2. REA 與操作工具分工

使用 `list_browser_targets` 選定本次服務的 page，之後以 `inspect_web_page` 與 `capture_web_screenshot` 觀察。操作由獨立 Playwright 連線完成。建立資料夾、上傳、重新命名與刪除採延遲觸發，讓 REA 在操作前附加並記錄 12 秒觀察窗內的請求。

REA 回傳的 authority 為 `external-service`，不會自行證明頁面來自哪個 Git commit；本報告透過來源快照、建置紀錄、image／binary digest 與研究服務綁定建立對照。REA 的 DOM、script inventory 也不能當成所有 JavaScript 模組都已執行的證明。

全部 24 筆原始 REA records 保存於 rea-evidence-bundle.json（本機 `evidence/rea-evidence-bundle.json`）。其中包含初始尺寸校正與一次未涵蓋操作的登入觀察：該登入觀察的網路列表為空，不用它支持登入請求結論。登入請求另外由 browser-observations.json（本機 `evidence/browser-observations.json`） 的 Playwright 事件記錄支持。

## 3. 實際操作與請求

| 操作 | 觀察到的順序及結果 | 證據 |
| --- | --- | --- |
| 登入 | `POST /api/login` 200 → `/files/` → `/api/usage/`、`/api/resources/` 200 | browser observations：`login-and-desktop-mosaic`；截圖 01、02 |
| 新增資料夾 | UI 輸入 `Runtime-created` → `POST /api/resources/Runtime-created/?override=false` 200 → `GET /api/resources/` 200 → 列表出現項目 | REA-FOLDER；截圖 03 |
| 23 bytes 小檔案上傳 | 預檢目錄 GET 200 → `POST /api/tus/runtime-upload.txt?override=false` 201 → `PATCH /api/tus/runtime-upload.txt` 204 → 目錄 GET 200 | REA-UPLOAD |
| 同名上傳 | 再次上傳同名檔顯示 replace／skip／resume／逐檔決定選項；本次取消，不覆寫 | browser observations：`upload-conflict-dialog`；截圖 04 |
| 重新命名 | `PATCH /api/resources/runtime-upload.txt?action=rename&destination=%2Fruntime-renamed.txt&override=false&rename=false` 200 → 目錄 GET 200 | REA-RENAME；截圖 15 |
| 檔案內容核對 | 主機暫存檔案內容仍為上傳的 `Runtime upload fixture` 與換行 | runtime-checks.json（本機 `evidence/runtime-checks.json`）；不屬 REA 檔案系統證據 |
| 刪除 | 確認後 `DELETE /api/resources/runtime-renamed.txt` 204 → 目錄 GET 200 → 檔案消失 | REA-DELETE、runtime checks；截圖 16 |
| 編輯／預覽／空目錄 | 開啟 notes.txt 的 Ace 編輯器、SVG 圖片預覽與 Empty 空目錄 | 截圖 09、10、11；沒有儲存編輯內容 |
| 設定／帳號 | 開啟個人設定與管理員帳號列表 | 截圖 07、08；沒有變更權限或密碼 |

「Resume previous transfer」按鈕存在，不代表跨重新整理／重啟的續傳已驗證；實際分支語意見 [04](04-user-flows-and-state.md)。刪除的永久性由來源 `RemoveAll` 及暫存檔案消失共同支持；這不表示 FileHub 應沿用同一政策。

| 簡稱 | 完整 REA Evidence ID |
| --- | --- |
| REA-FOLDER | `ev_f3f6ce71eeb1ea7947704a2609fe7af31aaf0ee88e5dd1d7433816e0c2b1d347` |
| REA-UPLOAD | `ev_5f2701e62f77ae1fe00679fa29a4c4a63b9980d5a2f63997890899ac7019aeb9` |
| REA-RENAME | `ev_1fc713f200da0f71e07106dcfab4a8d1ecb6f8d2fca7bfdce330643f08d6b198` |
| REA-DELETE | `ev_598182f7258125dc3005745713f81d687f583c4701cbc4b568ea789a404d0d07` |

## 4. 可直接對照的畫面

### 桌面工作空間與列表

登入後本次預設為 mosaic；切換後依序觀察 gallery 與 list。側欄寬度實測 256px、頁首高 64px，與 16px 基準下的 `16em`／`4em` 一致。不同模式沒有建立另一套檔案資料來源。

桌面 mosaic 工作空間（本機 `evidence/02-files-desktop.png`）

桌面 list 檢視（本機 `evidence/06-files-list.png`）

### 衝突處理

同名檔案提示的選項及說明確實出現，但來源用字與續傳語意不能直接當作 FileHub 的 UX 規格。新系統應明確區分覆寫、略過、保留兩者及續傳條件。

同名上傳衝突（本機 `evidence/04-upload-conflict.png`）

### 圖片預覽與手機導覽

圖片預覽使用黑色全幅覆層與右上操作；手機將側欄移出視窗，再由 menu 開啟覆蓋式導覽。小螢幕列表隱藏部分 metadata，長檔名可換行。

圖片預覽（本機 `evidence/10-image-preview.png`）

手機檔案列表（本機 `evidence/13-mobile-files.png`）

手機側欄（本機 `evidence/14-mobile-sidebar.png`）

### 完整畫面索引

每張圖的完整 Evidence ID、SHA256、byte count 與 viewport 見 screenshot-manifest.json（本機 `evidence/screenshot-manifest.json`）。PNG 均直接由 REA 原始 bytes 解出，另核對 SHA256，未裁切或改圖。

| 編號 | 畫面 | 尺寸 |
| --- | --- | --- |
| 01（本機 `evidence/01-login-desktop.png`） | 登入，輸入欄位為空 | 1440×1000 |
| 02（本機 `evidence/02-files-desktop.png`） | mosaic 工作空間 | 1440×1000 |
| 03（本機 `evidence/03-new-folder-dialog.png`） | 新增資料夾 | 1440×1000 |
| 04（本機 `evidence/04-upload-conflict.png`） | 同名上傳衝突 | 1440×1000 |
| 05（本機 `evidence/05-files-gallery.png`） | gallery 檢視 | 1440×1000 |
| 06（本機 `evidence/06-files-list.png`） | list 檢視 | 1440×1000 |
| 07（本機 `evidence/07-profile-settings.png`） | 個人設定 | 1440×1000 |
| 08（本機 `evidence/08-user-management.png`） | 帳號管理 | 1440×1000 |
| 09（本機 `evidence/09-text-editor.png`） | Ace 文字編輯器 | 1440×1000 |
| 10（本機 `evidence/10-image-preview.png`） | SVG 圖片預覽 | 1440×1000 |
| 11（本機 `evidence/11-empty-folder.png`） | 空目錄 | 1440×1000 |
| 12（本機 `evidence/12-tablet-files.png`） | 平板 list 檢視 | 800×1024 |
| 13（本機 `evidence/13-mobile-files.png`） | 手機 list 檢視 | 390×844 |
| 14（本機 `evidence/14-mobile-sidebar.png`） | 手機側欄開啟 | 390×844 |
| 15（本機 `evidence/15-rename-dialog.png`） | 重新命名 | 1440×1000 |
| 16（本機 `evidence/16-delete-confirmation.png`） | 刪除確認 | 1440×1000 |

## 5. 畫面核對發現

- 桌面與手機側欄可見水平捲軸。overflow-checks.json（本機 `evidence/overflow-checks.json`）量到桌面 `nav.clientWidth=256`、`scrollWidth=278`；平板為 160／192；手機為 256／278。整頁未量到超過視窗的寬度，仍不代表內部沒有溢位。FileHub 的側欄需要獨立驗收。
- 預覽覆層為黑色，設定頁則有明顯卡片陰影。這是來源風格，不等於新 FileHub 的視覺定案。
- 登入頁依瀏覽器語言顯示繁中，測試使用者偏好為英文，之後頁面主要內容為英文；某些首次導航的 title 仍為繁中。本次未做完整翻譯一致性驗證。
- 操作期間 Playwright 記錄未出現 `pageerror`；REA 四個操作觀察窗內沒有保留到 console events。這是有限時窗結果，不是全站無錯誤保證。

## 6. 未驗證的範圍

尚未實測分享密碼／到期／撤銷、一般使用者權限矩陣、帳號停用、JWT 重播／撤銷、runner、代理認證、NFS、跨磁碟搬移、多人衝突、大目錄效能、TUS 中斷／過期／重啟、各種影音／PDF／EPUB 格式、真實觸控、完整鍵盤及輔助科技操作。這些項目的來源分析在 02–05，改寫後的驗收要求在 07。

REA 網路與 console 只涵蓋 attach 之後的活動；不含 Cookie、授權標頭、request／response bodies 或 storage values。來源內容、控制頁面的工具，以及 REA 證據各自保留角色，不把沒有捕獲的內容推論為不存在。

## 7. 研究環境收尾

完成後已關閉本次獨立 Chrome、移除專用研究容器及 image tag，並核對原有五個執行中容器維持不變。這些 localhost 位址現在不是可用的示範網站；畫面與請求證據保存在本儲存庫。cleanup-receipt.json（本機 `evidence/cleanup-receipt.json`）
