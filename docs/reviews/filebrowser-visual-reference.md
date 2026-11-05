# File Browser 全畫面參考與 FileHub 視覺差距

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

日期：2026-10-30。這次完成參考畫面審查與後續規劃，尚未實作 P8；FileHub 產品仍為 `0.39.1`／schema 12。

## 1. 新的視覺依據

使用者要求「更像 File Browser，可以照抄畫面」，並指定全部畫面都要看。因此後續以指定版本 **File Browser 的實際畫面、比例、圖示與互動位置**為主要視覺依據，取代 P7 的 Stripe／Linear 方向。保留 FileHub 品牌、繁體中文、React／TypeScript、既有後端與安全契約。

P7 解決了控制列堆疊、頁面空間與功能整合，但仍採管理介面的標題、Ant Design 表格、外框按鈕及淺色選取。這些與 File Browser 的整體構圖不同，單獨調藍色或縮小間距無法對齊。比較基線為 P7.9 的 0.39.1 合成資料畫面（本機 `../validation/P7.9.md`）與目前原碼；本次未擷取使用者的 8088 私有資料。

已逐張檢視原有 16 張與本次新增 49 張，共 **65 張**，包含三種檢視及桌面／手機的主要頁面。完整清單、原圖與環境在全畫面索引（本機 `filebrowser-visual-reference/README.md`），雜湊在 manifest（本機 `filebrowser-visual-reference/manifest.json`）。這是畫面覆蓋紀錄，不宣稱所有條件分支或功能已測完。

## 2. 畫面巡覽與對應修改

下表「現況」指 FileHub 0.39.1；「目標」是待實作方向。實作順序及進度只維護在[主計畫 P8](../../IMPLEMENTATION_PLAN.md#p8-file-browser-畫面還原)。

| 畫面家族 | 已檢視的實際畫面 | FileHub 現況與目標 |
| --- | --- | --- |
| 登入、驗證失敗 | 登入（本機 `filebrowser-visual-reference/screenshots/17-login.png`）、錯誤（本機 `filebrowser-visual-reference/screenshots/18-login-error.png`） | 440px 卡片改為約 256px 的置中表單、64px 品牌圖形、簡單輸入與滿寬藍按鈕；保留 label、autocomplete、錯誤及 session 行為 |
| 工作空間、側欄、麵包屑 | 桌面列表（本機 `filebrowser-visual-reference/screenshots/19-list.png`）、平板（本機 `../filebrowser-study/evidence/12-tablet-files.png`）、手機側欄（本機 `filebrowser-visual-reference/screenshots/45-mobile-sidebar.png`） | 改為橫跨全頁的 64px 頂列、小品牌、搜尋及右側圖示；功能側欄在頂列下方，內容緊接麵包屑。入口／scope 繼續可達，側欄不是目錄樹 |
| 三種檢視 | 列表（本機 `filebrowser-visual-reference/screenshots/19-list.png`）、圖磚 mosaic（本機 `filebrowser-visual-reference/screenshots/22-mosaic.png`）、圖庫 gallery（本機 `filebrowser-visual-reference/screenshots/23-gallery.png`） | 目前只有列表／縮圖。分別建立矩形詳細列、橫向圖示＋資訊圖磚、大型預覽圖庫；不能把圖磚誤當圖庫。排序、分頁、選取及授權共用 |
| 選取、右鍵、更多 | 桌面選取（本機 `filebrowser-visual-reference/screenshots/24-file-selected.png`）、右鍵選單（本機 `filebrowser-visual-reference/screenshots/52-context-menu.png`）、手機選取（本機 `filebrowser-visual-reference/screenshots/42-mobile-selected.png`）、更多（本機 `filebrowser-visual-reference/screenshots/44-mobile-more.png`） | 淺色列與常駐 checkbox／逐列按鈕改為藍底白字選取、頂列情境動作、手機底部工具列；以可鍵盤操作的選取模式取代常駐 checkbox 欄，保留完整名稱與可達的單項操作 |
| 搜尋 | 開啟（本機 `filebrowser-visual-reference/screenshots/20-search-open.png`）、結果（本機 `filebrowser-visual-reference/screenshots/21-search-results.png`）、手機（本機 `filebrowser-visual-reference/screenshots/43-mobile-search.png`） | 搜尋移到頂列，展開後有返回／清除與結果工作區；保留目前目錄 filter 與遞迴搜尋的不同語意。來源四種格式捷徑沒有對應 API，這輪不放無效控制 |
| 新建、改名、刪除、衝突 | 新建資料夾（本機 `../filebrowser-study/evidence/03-new-folder-dialog.png`）、新建檔案（本機 `filebrowser-visual-reference/screenshots/50-new-file-dialog.png`）、改名（本機 `../filebrowser-study/evidence/15-rename-dialog.png`）、刪除（本機 `../filebrowser-study/evidence/16-delete-confirmation.png`）、衝突（本機 `../filebrowser-study/evidence/04-upload-conflict.png`） | 採窄版置中、2px 圓角、標題／內容／右下角平面按鈕。FileHub 刪除仍是移至垃圾桶，衝突仍不覆寫；新建空白檔案目前沒有功能，不顯示假入口 |
| 複製、搬移、資訊、打包、說明 | 複製（本機 `filebrowser-visual-reference/screenshots/26-copy-dialog.png`）、搬移（本機 `filebrowser-visual-reference/screenshots/27-move-dialog.png`）、資訊（本機 `filebrowser-visual-reference/screenshots/25-file-info.png`）、格式（本機 `filebrowser-visual-reference/screenshots/40-download-formats.png`）、說明（本機 `filebrowser-visual-reference/screenshots/41-keyboard-help.png`） | 目的地、確認及既有說明採同一浮層樣式；來源 tar 等格式、checksum 查詢與快捷鍵僅按 FileHub 實際能力呈現，不因外觀加未接後端的按鈕 |
| 圖片、文字、CSV | 圖片（本機 `../filebrowser-study/evidence/10-image-preview.png`）、手機圖片（本機 `filebrowser-visual-reference/screenshots/56-mobile-preview.png`）、編輯器（本機 `../filebrowser-study/evidence/09-text-editor.png`）、CSV（本機 `filebrowser-visual-reference/screenshots/53-csv-view.png`） | 現有小型預覽 Modal 改為全畫面、頂部檔名／關閉／授權下載、中央內容。文字繼續唯讀，CSV 可沿用純文字；不因此引入編輯儲存、Ace 或內容 HTML |
| PDF、影音、電子書、降級 | PDF（本機 `filebrowser-visual-reference/screenshots/57-pdf-preview.png`）、音訊（本機 `filebrowser-visual-reference/screenshots/58-audio-preview.png`）、影片（本機 `filebrowser-visual-reference/screenshots/59-video-preview.png`）、EPUB（本機 `filebrowser-visual-reference/screenshots/60-epub-preview.png`）、不支援格式（本機 `filebrowser-visual-reference/screenshots/61-unsupported-preview.png`） | 全畫面框架可共用，PDF 保留 FileHub 的 PDF.js 第一頁 canvas。來源 PDF 使用瀏覽器 object viewer；影音、EPUB、CSV 表格 renderer 尚非 FileHub 功能，不將參考播放器當成這輪新增功能 |
| 個人、全域與帳號設定 | 個人（本機 `filebrowser-visual-reference/screenshots/33-profile-full.png`）、全域（本機 `filebrowser-visual-reference/screenshots/31-global-settings-full.png`）、帳號列表（本機 `../filebrowser-study/evidence/08-user-management.png`）、帳號表單（本機 `filebrowser-visual-reference/screenshots/32-user-form.png`）、手機（本機 `filebrowser-visual-reference/screenshots/46-mobile-settings.png`） | 橫向分頁、簡單白色表單卡、桌面雙欄／手機單欄。FileHub 保留個人／帳號／儲存授權分類及 grant 模型，不複製來源主機路徑輸入、註冊或公告 |
| 分享建立與管理 | 建立表單（本機 `filebrowser-visual-reference/screenshots/28-share-create.png`）、建立後（本機 `filebrowser-visual-reference/screenshots/29-share-created.png`）、管理（本機 `filebrowser-visual-reference/screenshots/30-share-management.png`） | 分享短表單與管理表格對齊來源比例；FileHub 連結只在建立時顯示、期限 1–30 天與撤銷不變，不增加可重讀分享秘密的列表 |
| 公開分享與密碼 | 密碼（本機 `filebrowser-visual-reference/screenshots/34-public-password.png`）、密碼錯誤（本機 `filebrowser-visual-reference/screenshots/35-public-wrong-password.png`）、單檔（本機 `filebrowser-visual-reference/screenshots/36-public-file.png`）、資料夾（本機 `filebrowser-visual-reference/screenshots/38-public-folder.png`）、手機單檔（本機 `filebrowser-visual-reference/screenshots/37-public-file-mobile.png`）、手機資料夾（本機 `filebrowser-visual-reference/screenshots/39-public-folder-mobile.png`） | 簡單 metadata／下載卡、檔案列表及手機堆疊；公開頁仍與身份 session 分離，密碼前不顯示檔名。來源側欄登入入口與 QR 不強制複製，FileHub 私有導覽不進公開頁 |
| 上傳與進度 | 選取入口（本機 `filebrowser-visual-reference/screenshots/51-upload-picker.png`）、收合（本機 `filebrowser-visual-reference/screenshots/47-upload-panel.png`）、展開（本機 `filebrowser-visual-reference/screenshots/48-upload-panel-expanded.png`）、手機（本機 `filebrowser-visual-reference/screenshots/49-upload-panel-mobile.png`） | 目前整個右側 TaskDrawer 改為右下角可收合的上傳／工作浮動面板，手機底部全寬；Controller、committed bytes、發布確認與取消／未知狀態不變 |
| 空白、拒絕、錯誤 | 空目錄（本機 `../filebrowser-study/evidence/11-empty-folder.png`）、403（本機 `filebrowser-visual-reference/screenshots/error-403.png`）、404（本機 `filebrowser-visual-reference/screenshots/error-404.png`）、500（本機 `filebrowser-visual-reference/screenshots/error-500.png`） | 置中的圖形與短說明、可用的重試／返回；FileHub 問題編號與授權失效處理保留，不以清掉錯誤達成版面密度 |
| 深色 | 登入（本機 `filebrowser-visual-reference/screenshots/54-dark-login.png`）、圖庫（本機 `filebrowser-visual-reference/screenshots/55-dark-files.png`） | 已看實際深色色票；FileHub 目前只有淺色。P8 先還原現有頁面的淺色外觀，深色切換與持久偏好需另列功能工作，不放假主題開關 |
| FileHub 特有頁面 | 來源沒有相同的垃圾桶、持久工作與多入口授權畫面 | 使用同一字體、圖示、分頁、表格與卡片語言延伸；功能入口、錯誤與必要狀態繼續可見 |

### 三種檢視的實際差異

列表以名稱／大小／修改時間排列，選取及操作集中到頂列：

File Browser 詳細列表（本機 `filebrowser-visual-reference/screenshots/19-list.png`）

圖磚是圖示在左、文字在右的短卡片，與現在 FileHub 的縮圖卡不同：

File Browser 圖磚（本機 `filebrowser-visual-reference/screenshots/22-mosaic.png`）

圖庫放大圖像或檔案圖示，名稱置於下方；手機可單欄：

File Browser 圖庫（本機 `filebrowser-visual-reference/screenshots/23-gallery.png`）

## 3. 可量測的樣式依據

以下來自固定版本 CSS，桌面數值另以 1440×1000 實際 DOM 核對，原始結果見 measurements.json（本機 `filebrowser-visual-reference/measurements.json`）。這些是上游觀察值，成為 P8 的目標；尚未套用到 FileHub。

| 項目 | 來源值／觀察 | FileHub 還原方式 |
| --- | --- | --- |
| 頂列 | 高 64px、全頁寬；品牌圖形約 40px | WorkspaceShell 改為 header 橫跨兩欄；搜尋與情境動作由同一位置協調 |
| 側欄 | 桌面 256px；800px 視窗為 160px；≤736px 改可開關的 256px 側欄 | 以 1024／736px 檢查響應式，不沿用 P7 的 961px 換位；保留 Drawer 的焦點控制 |
| 內容與路徑 | 桌面 main x=288px、右側 16px；麵包屑高 48px；800px main x=192px | 檔案頁移除重複 h1／常駐控制列；入口狀態與實際錯誤保留適當位置 |
| 搜尋 | x=72px、y=8px、400×47px，淺灰底 | 中文 placeholder 與範圍可達；搜尋展開不重建工作 controller |
| 字體 | Roboto／sans-serif，內文 16px；一般工具圖示 24px | 本機封裝經核對授權的字型／圖示，中文有明確 fallback，不依賴外站字型 |
| 主色與圖示 | 主藍 `#2196f3`、資料夾 `#1d99f3`、操作圖示 `#546e7a` | 集中 palette／CSS 變數／ConfigProvider 同步；取代字元形狀的檔案圖示 |
| 表面與文字 | 背景 `#fafafa`、表面 `#fff`、搜尋 `#e6e6e6`、主要字 `#6f6f6f`、強調字 `#333` | 依角色對應 token；文字、焦點及狀態可辨識性另驗，不盲目套用全域規則 |
| 詳細列 | 正常短名 65px 高，圖示 32px；無逐列操作欄 | 固定正常列基線，長名另可閱讀完整值；保留分頁與能力判斷 |
| 圖磚 | 1440px 下首張約 272×80px；圖示 64px | 橫向 tile，非垂直縮圖卡；欄數由可用寬度決定 |
| 圖庫 | 同寬首張約 272×208px，圖像區 192px、一般圖示 128px | 圖片等比／裁切策略明確，仍使用安全縮圖、lazy load、取消及 blob URL 清理 |
| 選取 | `#2196f3` 實色背景、白字與白圖示 | 檢查文字與鍵盤焦點；手機底部列不遮住最後一項 |
| 卡片與浮層 | 設定／短對話框 2px 圓角、節制陰影；一般短浮層寬 25em，部分有自身寬度 | 用元件 token 與自有 scoped class 還原；長內容允許捲動、footer 與關閉可達 |

來源刻意不同的品牌、翻譯、入口數量與 FileHub 狀態文字，不作逐像素相等要求；其餘共同骨架、尺寸、留白、圖示與選取樣式需在同條件畫面中對照。不能只用「感覺接近」或既有無溢位測試結案。

## 4. 原碼與 FileHub 修改位置

來源路徑均相對唯讀的 `C:\Users\win10\Desktop\Github\filebrowser`，commit 固定 `833d908884d5c801f30f5c098d7977177eb3a36b`。下表是實作參考，並非直接恢復 Vue 元件。

| 主題 | 上游原碼 | FileHub 主要位置（相對 `apps/web/src/`） |
| --- | --- | --- |
| 色票、字體、圖示與基礎樣式 | [`_variables.css`][variables]、[`fonts.css`][fonts]、`base.css`、`_buttons.css`、`_inputs.css` | `theme/index.ts`、`app/Providers.tsx`、`app/ToolIcon.tsx`、`styles.css` |
| 殼層、側欄與手機 | [`Layout.vue`][layout]、`HeaderBar.vue`、`Sidebar.vue`、[`header.css`][header]、[`mobile.css`][mobile] | `features/files/WorkspaceShell.tsx`、`WorkspaceNavigation.tsx`、`Workspace.tsx`、`FileToolbar.tsx`、`PathNavigation.tsx`、`app/AccountMenu.tsx` |
| 檢視、選取與情境動作 | [`FileListing.vue`][listing]、`ListingItem.vue`、[`listing.css`][listing-css]、`listing-icons.css`、`ContextMenu.vue`、`header/Action.vue` | `features/files/FileListing.tsx`、`ResourceActions.tsx`、`SelectionToolbar.tsx`、`features/previews/Thumbnail.tsx` |
| 搜尋 | [`Search.vue`][search]、`header.css`、`mobile.css` | `features/search/SearchControls.tsx`、`SearchPanel.tsx`、`features/files/Workspace.tsx` |
| 短對話框 | [`prompts/`][prompts] 的 BaseModal／NewDir／Rename／Delete／Copy／Move／Share／Info | `features/files/WriteDialog.tsx`、`features/operations/DestinationDialog.tsx`、`features/shares/ShareDialog.tsx`、`features/trash/TrashPanel.tsx`、共用樣式 |
| 全畫面預覽 | [`Preview.vue`][preview]、`Editor.vue`、`ExtendedImage.vue`、`CsvViewer.vue` | `features/previews/PreviewDialog.tsx`、`binary.ts`、`pdf.ts`、`queue.ts` |
| 登入、設定及分享 | [`Login.vue`][login]、`login.css`、[`settings/`][settings]、`dashboard.css`、[`Share.vue`][share]、`_share.css`、`Errors.vue` | `features/auth/Login.tsx`、`features/settings/`、`features/shares/`、`features/trash/`、`app/SystemOverview.tsx` |
| 浮動進度 | [`UploadFiles.vue`][upload]、`upload-files.css` | `features/tasks/TaskDrawer.tsx`、`features/uploads/UploadPanel.tsx`、`features/operations/OperationPanel.tsx`；controller ownership 保留 |

第三種檢視需要明確的契約工作。目前 `PreferencesSchema.defaultView` 與 SQLite `preferences_view` CHECK 僅接受 `list`／`thumbnails`；不能只改 CSS 或在前端斷言型別。P8.3 新增 `mosaic`，保留既有 `thumbnails` wire value 對應圖庫，新增 migration 並驗舊資料保存。不要改寫已套用的 `0011_opposite_orphan.sql`，也不將根 query 的 `view=settings` 誤當成檔案檢視模式。

## 5. 可直接沿用與必須保留的界線

上游固定版本採 [Apache-2.0][license]，允許在其條件下複製、修改與散布。實際取用 CSS、程式或資產時，在 P8.1 建立逐項來源／commit／原路徑／修改紀錄，保留授權與適用聲明；若來源附有 NOTICE 也一併處理。Roboto 與 Material Icons 另核對實際使用檔案的授權。本次保存的是研究畫面，尚未將其字型／圖示／CSS 複製到產品。[授權條件原文][apache]

- **視覺還原：** 比例、配色、字體、圖示、卡片、頂列、側欄、選取位置、對話框及全畫面預覽，可依授權直接改寫為 React 與 scoped CSS。Ant Design 繼續提供必要的可存取互動，不以其預設外觀作目標。
- **行為相容：** 既有資料夾開啟、鍵盤選取、URL／分頁、草稿、回傳焦點及取消語意保留；不順便切換成上游雙擊規則。Workspace 仍擁有 UploadController／OperationController。
- **資料安全：** 沿用 FileHub session／CSRF、opaque 入口、grant、原子不覆寫、垃圾桶、持久工作及自有 upload protocol。上游 JWT storage、主機路徑輸入、永久刪除與直接內容 DOM 不移植。
- **實際能力：** 未接 API 的格式捷徑、編輯儲存、tar、影音／EPUB、主題偏好、開放註冊與 shell 不加入假控制。垃圾桶、多入口及工作面板按來源視覺語言延伸，不能為了像畫面而移除。
- **可用性修正：** 來源側欄內容溢位、全域清 outline 或手機內容遮擋，不作還原要求；保持至少 44px 主要觸控區、焦點、長名可讀與真實錯誤。

## 6. 證據身分與限制

| 項目 | 本次紀錄 |
| --- | --- |
| Source | 固定 commit `833d908884d5c801f30f5c098d7977177eb3a36b`；開始／結束均保持來源乾淨，分析用 git archive 副本 |
| Image | `sha256:0f27878337483693b4a66e3f588d1dd63a563689da61cdc78d68d5ade094c225`，重新 build 的結果與既有研究 image 相同 |
| Binary | `/filebrowser` SHA-256 `67ecfe431daabffe8739b4cefd44f3e31896e450e57d547297609f0ea11ad67c`，在本次容器實際核對 |
| Browser | Windows Chromium `156.0.8078.4`；1440×1000／390×844，另核對 800×1024 尺寸；完整頁圖片可高於視窗 |
| 新畫面 | 49 張 Playwright 原始 PNG，五張分享畫面在擷取時遮蔽合成 ID／QR；未事後修圖 |
| REA | 五筆完整 inline records，含登入頁被動觀察及兩張擷取；只 allow 本次 loopback Origin，不收 storage／console 文字或秘密 |
| 隔離 | read-only rootfs、UID 1000、drop ALL、tmpfs 合成資料、無使用者 volume；本次瀏覽器、容器及新 image tag 已清理 |
| 既有服務 | 七個原有服務的 container ID／StartedAt 未變；FileHub `filehub_state`／`filehub_files`／`filehub_cache` 未作測試資源使用 |

REA 完整紀錄見 selected-rea-records.json（本機 `filebrowser-visual-reference/selected-rea-records.json`）。桌面列表對應 `ev_ce27fdaeb987b22ce01ea66cfcb2855dbc352a2446ae8301d358fb8d24265788`，手機預覽對應 `ev_21deac8314f2bafb448904daffb188f6ac3f1b2df68ca64a88a940aa8bb32b55`；其餘 ID 在同檔。原始 16 張及原 bundle 保持 bytes 不變。

被動 CDP 的 authority 為外部服務，不能單獨證明 Docker image 身分；由本次 build／執行檔 hash／容器 ownership 補足關聯。擷取過程分為兩個自有瀏覽器生命週期，不宣稱同一連續 trace。上傳進行中畫面以暫停自有測試請求取得，最後放行完成；它不是吞吐量或斷線恢復驗收。

PDF 圖中的工具列屬 Chromium 原生 viewer；音訊已載入、影片有實際影格、EPUB 有合成章節，但沒有驗所有 codec、DRM、字幕、翻頁或編輯儲存。403／404／500 是對應路由的畫面，並非誘發服務故障。註冊與命令執行在這個 fixture 關閉，只查其來源分支，未為畫面研究開啟。深色只檢視登入與檔案頁，不宣稱全頁深色驗收。

本次不重跑 FileHub 的原生／E2E／發行集合，因未修改產品程式。文件、來源定位、65 張 hash、額外 REA 產物與清理核對依驗證紀錄（本機 `../validation/filebrowser-visual-reference.md`）。下一份實作為 P8.1。

[variables]: https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/css/_variables.css
[fonts]: https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/css/fonts.css
[layout]: https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/views/Layout.vue
[header]: https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/css/header.css
[mobile]: https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/css/mobile.css
[listing]: https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/views/files/FileListing.vue
[listing-css]: https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/css/listing.css
[search]: https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/components/Search.vue
[prompts]: https://github.com/filebrowser/filebrowser/tree/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/components/prompts
[preview]: https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/views/files/Preview.vue
[login]: https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/views/Login.vue
[settings]: https://github.com/filebrowser/filebrowser/tree/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/views/settings
[share]: https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/views/Share.vue
[upload]: https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/components/prompts/UploadFiles.vue
[license]: https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/LICENSE
[apache]: https://www.apache.org/licenses/LICENSE-2.0
