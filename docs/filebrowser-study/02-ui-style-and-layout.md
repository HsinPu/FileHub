# File Browser 網頁樣式與版面分析

> 2026-10-30 更新：本文保留原始來源分析與當時建議。使用者已改以 File Browser 實際畫面為視覺目標，取代本文「不必搬移 Material 外觀」等 FileHub 建議；最新依[全畫面審查](../reviews/filebrowser-visual-reference.md)、[DESIGN](../../DESIGN.md)與[主計畫 P8](../../IMPLEMENTATION_PLAN.md#p8-file-browser-畫面還原)。來源事實與歷史證據保持不變。

這份報告整理 File Browser 的實際樣式規則、頁面組成與操作狀態，供 FileHub 改寫時決定哪些行為值得保留、哪些視覺做法應重新設計。最有價值的參考是同一套檔案資料支援多種檢視、操作隨權限與選取狀態改變，以及手機版改變操作位置；不必連同 Vue 元件、CSS 選擇器或 Material 外觀一起搬移。

## 1. 分析基準與閱讀方式

- 來源：`C:\Users\win10\Desktop\Github\filebrowser`。
- 固定版本：`833d908884d5c801f30f5c098d7977177eb3a36b`，本報告所有來源連結均固定在此 commit。
- 本報告的「已確認」指原始碼明確定義；CSS 數值不是瀏覽器實測。
- 本報告不聲稱已開啟或操作來源介面。實際畫面、瀏覽器差異及 REA 執行期證據以本研究其餘報告為準。
- 「FileHub 建議」屬改寫設計，並非現有功能。React／TypeScript／Ant Design 是本次對話提供的前端方向；元件對照仍是後續實作建議，不能當作已完成的系統。

CSS 由單一 `styles.css` 依序匯入 normalize、第三方 toast、變數、控制項、字體、基礎布局、頁首、清單、設定與手機樣式。手機規則在多數桌面樣式之後載入，因此改寫時應分析完整 cascade，不能只擷取某個元件的 CSS。[來源：`frontend/src/css/styles.css:1–19`][styles]

## 2. 視覺基礎

### 2.1 淺色與深色語意色

| 用途／來源 token | 淺色 | 深色覆寫 | 使用含義 |
| --- | --- | --- | --- |
| `--blue` | `#2196f3` | 未覆寫 | 主操作、選取、連結 |
| `--dark-blue` | `#1e88e5` | 未覆寫 | 主按鈕 hover |
| `--red`／`--dark-red` | `#f44336`／`#d32f2f` | 未覆寫 | 刪除、錯誤操作 |
| `--background` | `rgb(250,250,250)` | `rgb(20,29,36)` | 頁面底色 |
| `--surfacePrimary` | `rgb(255,255,255)` | `rgb(32,41,47)` | 頁首、控制項、卡片 |
| `--surfaceSecondary` | `rgb(230,230,230)` | `rgb(58,65,71)` | 搜尋底色、次要區塊 |
| `--textPrimary` | `rgb(111,111,111)` | `rgba(255,255,255,.6)` | 檔案列、標題等文字 |
| `--textSecondary` | `rgb(51,51,51)` | `rgba(255,255,255,.87)` | body、控制項與卡片內文 |
| `--divider` | `rgba(0,0,0,.05)` | `rgba(255,255,255,.12)` | 分隔線 |
| `--borderPrimary` | `rgba(0,0,0,.1)` | `rgba(255,255,255,.05)` | 輸入框、列邊界 |
| `--borderSecondary` | `rgba(0,0,0,.2)` | `rgba(255,255,255,.15)` | hover／focus 邊框 |
| `--hover` | `rgba(0,0,0,.1)` | `rgba(255,255,255,.1)` | 圖示按鈕 hover |

來源的 `textPrimary` 比 `textSecondary` 更淡；不可只依名稱直覺映射新系統的 primary／secondary 文字。需依實際用途重新命名語意 token。[來源：`frontend/src/css/_variables.css:1–58`][variables]

另有檔案圖示色：紅 `#da4453`、橘 `#f47750`、黃 `#fdbc4b`、綠 `#2ecc71`、藍 `#1d99f3`、紫 `#9b59b6`；輸入成功／失敗背景也有獨立變數。是否展示某色應追查實際 selector，變數存在不代表每個畫面都使用它。[同上][variables]

主題以 `document.documentElement.className` 切換 `light`／`dark`。未指定主題時，`setTheme` 讀取 `prefers-color-scheme`，並非在此函式中註冊作業系統主題變更監聽。Ace 編輯器主題另行選擇，無效值退回深色 `twilight` 或淺色 `chrome`。[來源：`frontend/src/utils/theme.ts:5–49`][theme]

### 2.2 字體、字級與單位

- Body 使用 `"Roboto", sans-serif`，字型檔在本機 assets 中，以 `@font-face` 載入 400／500／700 字重及多組 unicode range。
- Material Icons filled 字型由套件匯入；圖示基準 `font-size: 1.5rem`。
- 頁首標題 `1.2em`，清單中大小／修改時間 `0.9em`，設定表單 label `0.8em`，登入標題 `2.5em`。
- 此組基礎 CSS 未替 body 固定 `font-size`。例如 `16em` 側欄只能在瀏覽器繼承 16px 字級時換算為 256px；不能把換算值寫成已量測尺寸。

來源：[`base.css:1–5`][base]、[`fonts.css:1–244`][fonts]、[`header.css:21–27`][header]、[`listing.css:48–55`][listing]、[`dashboard.css:35–40`][dashboard]、[`login.css:17–29`][login-css]。

### 2.3 控制項與外觀年代

來源自行定義 `.button` 與 `.input`，不是 Ant Design。按鈕 padding `0.5em 1em`、圓角 `0.1em`，有細邊框和 `0 0 5px` 陰影；一般主按鈕為藍底白字。Flat 按鈕移除邊框及陰影，使用大寫文字樣式；disabled 透過透明度 `.5` 和游標呈現。Input 使用同樣圓角與 padding，hover／focus 加深邊框。[來源：`_buttons.css:1–55`][buttons]、[`_inputs.css:1–35`][inputs]

圓形 `.action` 是另一組圖示操作：透明底、`border-radius:50%`、圖示 padding `0.4em`、hover 顯示淡色底；disabled opacity `.2`。頁首隱藏操作標籤，元件仍提供 `aria-label` 與原生 `title`。[來源：`styles.css:84–114`][styles]、[`header.css:49–50`][header]、[`components/header/Action.vue:1–6`][action]

這些規則、Material 圖示與多層卡片陰影構成偏 Material 的介面。若 FileHub 要採另一套設計系統，應保留操作語意，重新決定圓角、陰影、密度與選取色。

## 3. 桌面應用程式骨架

```text
固定頁首：logo／搜尋／頁面標題／動態操作
固定側欄：帳號／我的檔案／建立／設定／登出／容量
主內容：麵包屑 → 檔案清單或設定頁
全域覆層：操作對話框、預覽器、編輯器
持續狀態：頁頂總上傳進度、右下上傳面板
```

`Layout.vue` 讓 sidebar、router-view、全域 prompts 及上傳面板共用殼層；命令列需同時滿足啟用設定、登入及 execute 權限。路由改變會清掉選取與多選模式，並關閉多數浮層。[來源：`views/Layout.vue:1–53`][layout]

| 區域 | 已確認的規則 | 改寫時的含義 |
| --- | --- | --- |
| 頁首 | fixed top/left 0，寬 100%，高 `4em`，z-index 1000，flex | 預留內容偏移，避免捲動後遮住內容 |
| body | `padding-top:4em` | 與頁首高度硬連動 |
| 側欄 | fixed top `4em`，寬 `16em`，高 `calc(100vh - 4em)`，自身可捲動 | 導覽不隨檔案內容消失 |
| 主內容 | `width:calc(100% - 19em)`，右側／底部 margin `1em` | 不是一般 CSS Grid，而是固定寬度加計算式 |
| 麵包屑 | 高 `3em`，sticky top `4em`，z-index 1000 | 與頁首共同保留路徑上下文 |
| 搜尋 | 頁首內 max-width `25em`；active 轉 fixed 滿版 | 一般搜尋框與搜尋工作區共用元件 |

來源：[`base.css:1–5,54–104`][base]、[`header.css:1–15,67–104`][header]。新系統應集中管理這些高度／寬度，避免多處 `4em` 或 `16em` 在局部修改後失配。

側欄不是目錄樹。它是依權限顯示的功能導覽：帳號設定、我的檔案、新資料夾／新檔案、管理設定、登出；底部可顯示磁碟使用量、版本與說明入口。不能因產品是檔案管理器就推論來源具有樹狀導覽。[來源：`components/Sidebar.vue:1–114`][sidebar]

## 4. 三種檔案檢視

三種模式使用相同資料與 `ListingItem`；切換順序為 `list → mosaic → mosaic gallery → list`，並透過使用者設定更新。檔案清單以資料夾／檔案分組，兩組渲染數量共同受 `showLimit` 約束。[來源：`views/files/FileListing.vue:417–439,1020–1032`][file-listing]

| 模式 | 實際呈現 | 樣式與尺寸 | 適用工作 |
| --- | --- | --- | --- |
| `list` | 一列一筆，名稱、大小、修改時間 | row padding `1em`；圖示區 `3em`；縮圖 `2em × 2em`；名稱 50%、大小 25% | 比較檔名與 metadata |
| `mosaic` | 橫向圖示＋文字的磁貼 | margin／padding `.5em`；圓角 `.2em`；預設寬 `calc(33% - 1em)`；陰影 hover 加深 | 以圖示辨識類型 |
| `mosaic gallery` | 大縮圖與底部檔名覆層 | 預覽區高 `12em`；圖示 `8em`；隱藏大小／修改時間；圖片文字底有透明至黑色漸層 | 看圖及素材瀏覽 |

Mosaic 的 `33%` 是 CSS 初始值；`columnWidth` 初始值為 280，執行期 `columnsResize` 依 `floor(main.offsetWidth / columnWidth)` 算欄數，至少一欄，再修改 stylesheet 規則，因此不能把「固定三欄」寫成最終行為。[來源：`listing.css:87–203`][listing]、[`views/files/FileListing.vue:376,736–745`][file-listing]

檔名溢位使用 `white-space:nowrap`、`overflow:hidden`、`text-overflow:ellipsis`。選取列由 `aria-selected="true"` 套用藍底與白字；不要把它描述成淡藍底。隱藏檔和 `.bak` 在檔案圖示樣式中 opacity `.33`。[來源：`listing.css:12–41,174–176`][listing]、[`listing-icons.css:5–10`][listing-icons]

每筆 ListingItem 是 `div role="button" tabindex="0"`，帶檔名 aria-label／選取狀態與拖曳事件。單擊開啟取決於個人設定；一般模式以 300ms 內計數辨識連續點擊。Ctrl／Meta 切換多選、Shift 擴張選取，長按延遲 500ms、移動超過 10px 取消。這些是原始碼事件邏輯，尚未由本報告實際操作驗證。[來源：`components/files/ListingItem.vue:1–24,62–66,242–325,340–408`][listing-item]

圖示依 `data-type`／`data-ext` 透過 CSS `::before` 放入 Material Icons 字串；圖片在允許縮圖且非 readOnly 時使用 lazy image。這種策略簡單，但圖示規則與類型判定分散；改寫可將類型→圖示集中成資料映射。[來源：`listing-icons.css:12–80`][listing-icons]、[`ListingItem.vue:25–42,109–119`][listing-item]

## 5. 頁面與浮層盤點

| 畫面 | 內容與狀態 | 來源 |
| --- | --- | --- |
| 登入 `/login` | 滿版單色背景；置中 form max-width `16em`／width 90%；logo `4em`；錯誤為紅底、登出原因橘底；註冊額外確認密碼 | [Login.vue:1–44][login-view]、[login.css:1–53][login-css] |
| 檔案 `/files/*` | 頁首搜尋與條件操作、清單、上傳入口；資料讀取顯示三點 spinner，空目錄顯示訊息；錯誤透過 Errors 呈現 | [FileListing.vue:1–170][file-listing]、[Files.vue:1–84][files] |
| 設定 `/settings/*` | 水平 tabs：個人／分享／全域／使用者，部分依 share/admin 權限顯示；子頁共用設定殼層 | [Settings.vue:1–66][settings] |
| 個人設定 | 左右兩欄卡片：瀏覽偏好／語言／Ace 主題、變更密碼；窄螢幕轉一欄 | [Profile.vue:1–101][profile]、[dashboard.css:5–29][dashboard] |
| 全域設定 | 註冊、密碼長度、規則、branding、主題等表單；命令設定只有啟用時呈現 | [Global.vue:1–110][global] |
| 公開分享 `/share/*` | 簡化頁首、麵包屑；401 顯示密碼卡片，錯誤密碼提示；其他錯誤畫面；檔案／目錄分享資訊及下載 | [Share.vue:1–110][share] |
| 預覽器 | 固定全螢幕近黑底、白色操作；圖片／音訊／影片／EPUB／CSV／PDF 分流，無預覽時給下載；前後筆切換 | [Preview.vue:1–175][preview]、[styles.css:170–325][styles] |
| 文字編輯器 | 固定全螢幕 editor 容器，頁首、路徑、Ace 內容，Markdown 預覽及未儲存變更提示 | [Editor.vue:1–95,196–226][editor]、[styles.css:330–370][styles] |
| 操作對話框 | 新檔／新目錄、重新命名、搬移／複製、刪除、下載、分享、衝突、密碼確認等由集中 registry 選元件 | [Prompts.vue:14–55][prompts] |

設定卡片圓角 `2px`，使用三層陰影；floating 卡片 max-width `25em`、width 90%、max-height 95%。一般設定表格每格垂直 padding `.5em`、字重 500 的欄頭。這是來源外觀，並非要求 FileHub 也使用卡片牆。[來源：`dashboard.css:116–179`][dashboard]

PDF 在這份來源的 Preview template 使用 `<object :data="previewUrl">`；不能寫成已使用 PDF.js 自行繪頁，也不能從原始碼宣稱所有瀏覽器都能預覽。CSV 與 EPUB 有專屬元件，文本／不可修改文本通常進 Editor，CSV 可透過 `?edit=true` 進編輯模式。[來源：`Preview.vue:77–131`][preview]、[`Files.vue:65–84`][files]

## 6. 響應式規則

| 斷點 | 已確認的調整 | 實作來源 |
| --- | --- | --- |
| `≤1200px` | 設定 `.column` 由 50% 轉 100% | [dashboard.css:15–29][dashboard] |
| `≤1024px` | sidebar `16em → 10em`，main `100%-19em → 100%-13em` | [mobile.css:1–11][mobile] |
| `≤736px` | sidebar 改為滿高 `16em` 的離屏選單；按鈕開啟，遮罩關閉；logo 隱藏；main 改 `100%-2em` | [mobile.css:112–176][mobile] |
| `≤736px` | 頁首更多操作改浮出選單；share/rename/copy/move/delete 搬至底部選取操作列；列內大小隱藏 | [mobile.css:17–110][mobile]、[FileListing.vue:13–124][file-listing] |
| `≤450px` | 列內修改時間再隱藏，名稱占滿；上傳面板滿寬 | [mobile.css:180–198][mobile]、[upload-files.css:56–60][upload-css] |

`FileListing` 的 `isMobile` 也用 `width <= 736` 判定，是元件樹與 CSS 共同控制，而不是只縮小桌面字級。[來源：`FileListing.vue:493–495`][file-listing]

需實測的邊界包括：736／737／738px 間的頁首與預覽器 selector 差異、隱藏資料列欄位但保留排序欄頭的行為、固定置中的登入 form 在行動鍵盤出現時是否被遮住，以及底部操作列與上傳面板是否互相遮擋。這些是從規則推導的驗證項目，並非已重現缺陷。

## 7. 回饋、層級與無障礙

上傳同時有頁頂總進度（3px 高）和右下角面板；單檔進度 5px 高，面板可收合。進度使用青藍 `#40c4ff`、寬度轉場 `.2s`。持續狀態與內容同時可見是值得保留的工作流。[來源：`Layout.vue:3–8`][layout]、[`base.css:137–150`][base]、[`upload-files.css:1–60`][upload-css]

對話框遮罩為 `#00000096`、z-index 10000、淡入 150ms；點擊背景與 Escape 可關閉，mount 時嘗試 focus `#focus-prompt`。此元件沒有在程式碼中實作焦點圈限，且容器本身未宣告 tabindex，不能因有 `.focus()` 就宣稱完整鍵盤可用。[來源：`BaseModal.vue:1–49`][base-modal]

基礎 CSS 對一般元素／hover／active／focus 全域移除 outline；只對 modal `.button:focus` 補一條低透明藍色外框。改寫不應照搬全域移除 outline；需保留可辨識的 `:focus-visible`，檢查 Tab 次序、對話框關閉後焦點還原與背景不可互動。[來源：`base.css:12–17,191–194`][base]

來源 overlay 層級分散：頁首 1000、context menu 999、previewer 9999、modal 10000、previewer header 19999、手機導覽／更多選單 99999。新實作應定義一套 z-index 層級，驗證跨浮層的互動；這些數字本身不足以判定已發生遮擋。[來源：`context-menu.css:1–8`][context-css]、[styles.css:170–186][styles]、[mobile.css:46–56,112–121][mobile]

## 8. FileHub 可採用的改寫規格

以下是待採納的設計建議，不能當成已完成實作：

1. 先做好列表、麵包屑、搜尋、權限導向操作和持續上傳狀態；之後再加 gallery。三種顯示模式共用一份選取與資料模型。
2. 把 `headerHeight`、`sidebarWidth`、`contentGap`、`overlayLayer` 與 semantic colors 集中管理；避免樣式和事件程式各自硬寫斷點。
3. 以檔案 ID／正規化路徑保存選取，避免排序或刷新後依陣列 index 選到別筆；這是新實作選擇，來源目前 `selected` 保存 index。
4. 將「點擊選取」與「開啟檔案」明確建模；手機長按、多選模式與鍵盤 Enter 要有相同權限檢查和清楚回饋。
5. 對每個頁面同時規格化 loading／empty／error／selected／disabled／conflict 狀態；上傳或預覽錯誤需提供可執行的下一步。
6. 檔案表格保留明確欄名、排序狀態、大小與日期格式；手機縮減 metadata 時仍要有取得完整資料的入口。
7. 預覽與編輯分開，預覽失敗仍可下載；儲存前後及離開有未儲存內容時需明確呈現狀態。

依本次提供的 React／Ant Design 方向，可用下表規劃元件映射；不應把 Vue template 或 `.ant-*` 覆寫當成移植方式。

| 來源模式 | 可選的 React／Ant Design 組成 | 須保留的產品行為 |
| --- | --- | --- |
| Layout＋Sidebar | `Layout`、`Menu`，手機 `Drawer` | 權限導覽、路徑上下文、獨立捲動 |
| HeaderBar＋Action | 共用 toolbar、`Button`、`Tooltip`、`Dropdown` | 動作依選取數與權限改變 |
| List | `Table`＋`rowSelection` | 排序、ellipsis、可辨識選取、批次操作 |
| Mosaic／Gallery | 共用資料 selector＋CSS Grid | 同一選取狀態、縮圖 lazy load、適應欄數 |
| Prompts＋BaseModal | `Modal`、`Form`、必要時 `Drawer` | Escape、焦點管理、確認對象、送出 loading |
| Search | `Input.Search`＋結果區 | 開啟／關閉、查詢與結果狀態 |
| UploadFiles | `Upload`＋可控任務列表＋`Progress` | 不中斷瀏覽、逐檔狀態、衝突決策 |
| Settings | `Tabs`、`Form`、`Switch`、`Select` | 管理與個人設定分界、權限與儲存回饋 |
| Errors／空目錄 | `Result`／`Empty`／`Alert` | 有意義訊息與重試或回上一層 |

## 9. 實際畫面驗收項目

- 桌面至少驗證 list／mosaic／gallery、長檔名、圖片縮圖和混合檔案型別。
- 在 1440、1024、768、736、450、390px 檢查 sidebar、toolbar、麵包屑、底部選取列與上傳面板；另測 737／738px 交界。
- 淺色／深色各檢查輸入框、disabled、選取、錯誤、右鍵選單與預覽器。
- 登入錯誤、空目錄、無權限、找不到檔案、預覽不支援、同名衝突都需要畫面。
- 用鍵盤完成進入資料夾、選取、開啟／關閉對話框、預覽退出、設定送出，檢查 focus-visible 與焦點還原。
- 在上述結果有截圖或操作紀錄之前，這份報告只對原始碼定義負責，不將「具有 CSS」等同「已可正常使用」。

[styles]: https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/css/styles.css
[variables]: https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/css/_variables.css#L1-L58
[theme]: https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/utils/theme.ts#L5-L49
[base]: https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/css/base.css
[fonts]: https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/css/fonts.css
[header]: https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/css/header.css
[listing]: https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/css/listing.css
[dashboard]: https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/css/dashboard.css
[login-css]: https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/css/login.css
[buttons]: https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/css/_buttons.css
[inputs]: https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/css/_inputs.css
[action]: https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/components/header/Action.vue#L1-L6
[layout]: https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/views/Layout.vue
[sidebar]: https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/components/Sidebar.vue
[file-listing]: https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/views/files/FileListing.vue
[listing-item]: https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/components/files/ListingItem.vue
[listing-icons]: https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/css/listing-icons.css
[login-view]: https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/views/Login.vue
[files]: https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/views/Files.vue
[settings]: https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/views/Settings.vue
[profile]: https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/views/settings/Profile.vue
[global]: https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/views/settings/Global.vue
[share]: https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/views/Share.vue
[preview]: https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/views/files/Preview.vue
[editor]: https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/views/files/Editor.vue
[prompts]: https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/components/prompts/Prompts.vue
[mobile]: https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/css/mobile.css
[upload-css]: https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/css/upload-files.css
[base-modal]: https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/components/prompts/BaseModal.vue
[context-css]: https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/css/context-menu.css
