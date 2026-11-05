# P10 白色畫布：設計規格與執行規劃

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

2026-11-01；規劃基線 `27cddcd`、程式 0.40.15／schema 13，規劃提交 `df29c84`。使用者確認方向後要求調整，P10.2 以 0.40.16 實作；P10.3 於 2026-11-04 完成 Linux 白底補驗、290 張原圖複核及 A06 判讀更正，P10.4 於 2026-11-04 完成正式交付。進度依[主計畫](../../IMPLEMENTATION_PLAN.md)，8088 已依 P10.4（本機 `../validation/P10.4.md`）交付 0.40.16。

## 1. 已確認的視覺方向

**整個工作區像同一張白色畫布：主內容、側欄與工具區連成一體，透過留白、文字及細分隔線建立層次。**

以 P10.1 登入後實際畫面（本機 `../validation/P10.1/after-desktop-workspace-first-screen.png`）為版面基準。保留目前布局、字體、深色檔名、三種檢視、藍色操作與 H 圖像 logo；這輪集中處理大面積背景及相鄰狀態的一致性。

這份規劃取代 2026-10-31 [早期候選色票](../reviews/p10-color-and-logo-review.md)的灰色版底／石灰側欄、主藍換色及暖金資料夾方案。暖金保留在已選定的 logo；操作與資料夾沿用目前色票。舊預覽、SVG 及原圖保留歷史，最新進度只看[主計畫](../../IMPLEMENTATION_PLAN.md#p10-配色與-svg-識別候選)。

## 2. 色彩角色

以下列出 0.40.15 基線及 0.40.16 已套用的值。色票唯一來源維持 [theme/index.ts](../../apps/web/src/theme/index.ts)，由 [Providers](../../apps/web/src/app/Providers.tsx)供應 Ant Design 與 CSS variables。

| 用途 | 0.40.15 基線 | 0.40.16 白色畫布 |
| --- | --- | --- |
| 全頁／主內容 background | `#f5f6f8` | `#ffffff` |
| 側欄 sidebar | `#f0f2f5` | `#ffffff` |
| 表格／卡片／浮層 surface | `#ffffff` | 保留 |
| 搜尋區 search | `#f5f6f8` | `#ffffff`，保留圖示、邊界與焦點 |
| 檔案及管理表頭 | owner CSS 的 `#f9fafb` | 白底，保留字重、對齊與細分隔線 |
| 圖庫未載入／無圖區 | owner CSS 的 `#f1f4f8` | 白底，保留圖示、載入／錯誤與既有卡片邊界 |
| 一般滑過 hoverSurface | 導覽／檔案列分散的淺灰 | 集中為 `#f7f9fc`，只用於互動狀態 |
| 停用 disabledBackground | AntD 共用 sidebar | 獨立保留 `#f0f2f5`，不跟白色側欄一起改 |
| 主操作／主操作 hover | `#245ea8`／`#1c4b87` | 保留 |
| 主字／次字 | `#202832`／`#596673` | 保留 |
| 選取／目前導覽 | `#eaf1fb`／`#e0e8f3` | 保留淡藍、勾選與目前頁語意 |
| 裝飾邊界／分隔線 | `#dce1e7`／`#edf0f3` | 保留，維持 1px 與既有必要外框 |
| 輸入／select 邊界 | `#8190a2` | 保留，不能改成過淡的裝飾線 |
| 工具／資料夾 | `#596673`／`#527eb1` | 保留 |
| 錯誤／警告／成功 | `#b42318`／`#845300`／`#267044` | 保留文字、圖示及對應淺背景 |

已新增 `hoverSurface`、`disabledBackground` 兩個語意用途；hover 映射成 CSS 變數，disabled 供 AntD token 使用。現有 surface／background／sidebar／search 名稱仍保留，方便描述不同區域。Table 的表頭與 row hover、Menu 的 item hover、text Button 的 hover 同步使用集中 palette，涵蓋公開資料夾與選單，避免框架另外生成一套灰底。

這些既有前景對純白的色票計算：主藍 6.478:1、主字 14.883:1、次字 5.878:1、輸入邊界 3.259:1、資料夾 4.219:1。這是 sRGB 色票計算，實作後仍須量測實際控制與合成背景；一般文字／主要按鈕至少 4.5:1，必要控制邊界／焦點至少 3:1。

## 3. 畫面處理範圍

| 畫面／區域 | 要調整的呈現 | 保留的辨識與互動 |
| --- | --- | --- |
| 工作區殼層 | 頂列、側欄、主內容、路徑／工具區及頁面空白為白底；手機導覽抽屜同步 | 既有 64／112px 頂列、側欄寬度、內容 padding、薄邊線、導覽 active |
| 列表 | 表頭、一般資料列白底，讓內容融入頁面 | 原列高、分隔、深色檔名、大小／日期、hover、選取／焦點 |
| 圖磚／圖庫 | 白卡與白色圖像空白區，清除常駐灰底 | 原欄數／圖像高度、真實縮圖、無圖圖示、載入及錯誤 |
| 搜尋與選單 | 搜尋入口、展開區、一般選單表面為白底 | 搜尋範圍、partial／錯誤、hover、焦點、背景 inert 與 Escape |
| 設定／分享管理／垃圾桶 | 頁面與表格表頭同步白色；白色表單以既有框線和分組間距區分 | 分類 active、原生 select、角色、草稿守衛、表格內橫捲 |
| 登入／公開分享／服務狀態 | 整頁底色、頂列、一般內容與說明 footer 以白色連貫呈現 | 原閱讀寬度、品牌、表單、重試、公開身份及狀態標示 |
| Modal／Drawer／工作浮卡 | 一般表面與內部區塊同步，檢查 portal 是否繼承 token | 遮罩、浮層陰影、分隔、進度及各種真實狀態 |

白色指一般表面。hover、選取、停用、Alert／Tag、拖放提示、Modal 遮罩及安全預覽的深色畫布仍按用途呈現。保持錯誤、警告與限制可見；不以全站 `background:white !important` 或 body 裁切達成外觀。

字體、字級、logo、圓角、密度與版面不另設計。白底相鄰區域沿用留白及細線，避免補上大面積陰影或再套灰底容器。

## 4. 修改位置與參考

| 責任 | 預計修改／核對檔案 | 參考與原因 |
| --- | --- | --- |
| 色票與語意拆分 | [theme/index.ts](../../apps/web/src/theme/index.ts) | 調 background／sidebar／search；新增 hover／disabled；拆開 0.40.15 的 `colorBgContainerDisabled: palette.sidebar` 耦合 |
| 共用與 portal | [Providers.tsx](../../apps/web/src/app/Providers.tsx) | 先核對現有傳遞；Modal／Drawer 沿同一 token，不另維護色票 |
| 各區 CSS owner | [styles.css](../../apps/web/src/styles.css) | 在既有殼層、導覽、搜尋、listing、gallery、login／public、management、task 區段修改；清除相關硬編碼靜態灰底，保留狀態色 |
| 殼層／工具／列表 | [WorkspaceShell](../../apps/web/src/features/files/WorkspaceShell.tsx)、[FileToolbar](../../apps/web/src/features/files/FileToolbar.tsx)、[FileListing](../../apps/web/src/features/files/FileListing.tsx) | 用來核對 class、控制與三檢視；只有視覺需要時才改元件，controller ownership 沿用 |
| 管理／公開／工作 | [SettingsPage](../../apps/web/src/features/settings/SettingsPage.tsx)、[PublicShell](../../apps/web/src/app/PublicShell.tsx)、[PublicShare](../../apps/web/src/features/shares/PublicShare.tsx)、[Login](../../apps/web/src/features/auth/Login.tsx)、[TaskDrawer](../../apps/web/src/features/tasks/TaskDrawer.tsx) | 核對每個頁面與 portal 的實際表面及狀態，不只改檔案首頁 |
| 基線與設計 | [DESIGN](../../DESIGN.md)、[P9 視覺系統](P9-visual-system.md)、P10.1 驗收（本機 `../validation/P10.1.md`） | 使用 0.40.15 正式 React／66 項 fixture 比較；保留歷史原圖 |
| 發行／試用 | [發行操作](../operations/release.md)、[完整備份](../operations/full-backup.md)、[本機試用](../operations/local-preview.md) | P10.4 沿既有驗收與保留資料程序交付 |

## 5. 執行順序與交付物

工作狀態仍以根目錄主計畫為唯一進度；以下是每份內部的執行順序與完成條件，不另設第二套完成勾選表。

### P10.2：白色畫布實作

1. 以 0.40.15 正式 build 擷取修改前代表頁面；盤點靜態底色、hover、selected、disabled、語意與預覽用途。
2. 集中修改 theme，先拆 disabled 與 sidebar，再把大面積背景統一成白色；按 owner 收斂 CSS 硬編碼，檢查 Modal／Drawer。
3. 檢查列表／圖磚／圖庫與管理、登入、公開、工作畫面；補上必要的既有 E2E 斷言，驗真實表面、狀態與對比。
4. 執行 metadata／typecheck／lint／build 及受影響 Chromium cases，保存同條件前後圖與 `docs/validation/P10.2.md`，同步根文件後本機 commit。

P10.2 由 0.40.15 增加 PATCH 至 0.40.16；資料庫 schema 13、API、controller 與品牌來源沿用。這份先交付程式與隔離環境畫面；驗證結果依 P10.2（本機 `../validation/P10.2.md`）。

### P10.3：整體回歸與畫面驗收

P10.2 完成後，在 Windows 與隔離 Debian 執行 `pnpm verify:core`，保存全套結果；另外檢查三視窗、320px、真實 200% zoom、鍵盤／焦點及 reduced motion。使用原有 66 項／長名稱、唯讀與錯誤 fixture，檢查本文件列出的全部畫面及狀態。

正常以完整 gate 一次完成；遇失敗時，使用 [visual-system](../../tests/e2e/visual-system.spec.ts)、[file-views](../../tests/e2e/file-views.spec.ts)、[workspace-layout](../../tests/e2e/workspace-layout.spec.ts)、[management-layout](../../tests/e2e/management-layout.spec.ts)、[dialog-layout](../../tests/e2e/dialog-layout.spec.ts)、[task-dock-layout](../../tests/e2e/task-dock-layout.spec.ts)等對應案例定位與修正，再驗受影響結果及必要 gate；同一未變來源已有成功結果時不重複建置或重跑。記錄 `docs/validation/P10.3.md`、逐張畫面審查及環境限制，通過後本機 commit。

### P10.4：正式映像與 8088 交付

P10.3 完成後，以同一來源建立正式 api／worker 共用 image，執行既定 Compose／release gates；保留測試所需舊 images。確認 Docker image／快取、測試容器／volume 與主機磁碟餘量，區分自有測試資源與使用者資源。同一來源的 Linux 驗證 image、正式 image 各建一次，只有來源改變或建置失敗時才重建，不使用全域 prune。

更新 8088 前保存基線、停雙服務、完整備份／verify，並在新目標驗還原；保留原帳密、入口、偏好、檔案與 `filehub_state`／`filehub_files`／`filehub_cache`。同步切換固定 image、等待健康，再登入實際頁面核對 H logo、白色背景與主要流程，確認其他服務維持原狀；無法檢視使用者分頁時，明記待驗，不能以舊截圖代替本次登入。完成後重新盤點磁碟及自有 fixture 清理結果。記錄 `docs/validation/P10.4.md` 並更新本機操作文件後，本機 commit，不 push。

## 6. 視覺驗收矩陣

| 維度 | 必查項目與通過條件 |
| --- | --- |
| 一般底色 | 檔案／管理／登入／公開頁的一般主內容、側欄、工具區、表頭、gallery 空白區實際呈白色；透明子層需追溯實際合成背景，不能只查 root token |
| 互動層次 | hover 有淡灰回饋；選取與目前導覽保留淡藍；聚焦有清楚外框；disabled 仍停用且可辨；正常與 selected+hover 都驗 |
| 狀態 | 空目錄、錯誤、partial、唯讀、工作進行中／完成／需處置、Modal／Drawer，沒有為統一白色而隱藏資訊 |
| 版面與密度 | 1440×1000／800×1024／390×844，另 320px 與 1920px；66 項 fixture 沿用 P10.1／P9 密度、既有欄寬／列高，不縮字或移除說明補救 |
| 可讀性 | 實際文字／主要按鈕對比 ≥4.5:1；必要邊界／焦點 ≥3:1；保留表單 label、深色檔名與次要資訊層級 |
| 浮層 | Modal／Drawer／工作浮卡同一 palette；遮罩與深色預覽仍成立，焦點返回及手機 44px 範圍保留 |
| 真實流程 | 登入、目錄／檢視切換、搜尋、設定、分享／下載、預覽、工作與取消等既有 API／授權流程通過；Windows 唯讀限制照舊 |
| 證據 | before／after 使用相同 fixture／視窗／DPR／字體／theme；一般畫面先移開滑鼠，再另拍 hover／selected／focus；逐張人工檢查，保存原圖及來源摘要 |

## 7. 文件與目前驗證界線

計畫位於根 [IMPLEMENTATION_PLAN.md](../../IMPLEMENTATION_PLAN.md)，這份文件保存色彩規格與檔案責任，實作時同步 [DESIGN](../../DESIGN.md)、README／AGENTS／MEMORY。每份驗證摘要都要分清程式版本、Linux／Docker 結果與 8088 實際交付版本。

規劃建立時只檢查原碼、既有畫面、文件連結及色票計算；後續 P10.2 已在正式 React 中實作 0.40.16，隔離 Windows Chromium 證據與限制另見本份驗收，不把早期原型當產品結果。兩平台完整回歸依 P10.3，Docker build、備份還原及 8088 更新依 P10.4；8088 已交付 0.40.16，見 P10.4（本機 `../validation/P10.4.md`）。逐份驗證及本機 commit，不 push。
