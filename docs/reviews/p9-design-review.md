# P9 視覺研究與設計提案

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

日期：2026-10-30。基線：`0a8bae1`、FileHub `0.40.6`／schema 13。**本份完成研究與獨立預覽；P9 產品實作尚未開始。** 順序、進度與每份驗收只由[主計畫 P9](../../IMPLEMENTATION_PLAN.md#p9-視覺層級與一致性)管理。

## 1. 診斷結論

現有介面的操作結構已接近 File Browser，視覺重量卻主要落在亮藍圖示、整列實色選取與大量灰藍控制。檔名、日期、說明文字的差別小，使用者必須在相似的元素中找重點。不同頁面又混用直角陰影卡、原生 select、Ant Design 輸入框及幾乎沒有邊界的提交按鈕，整體缺少一致的主次關係。

P9 建議採用一個方向：**沉靜藍的檔案工作區**。保留 File Browser 的側欄、路徑導覽、三種檢視與情境操作，將檔案內容、操作層級及狀態辨識放在視覺中心。品牌仍是 FileHub，繁中、React／Ant Design 與現有功能繼續沿用。

這是針對目前產品的設計判斷，沒有進行使用者研究或 A/B 實驗；不宣稱工作速度、滿意度已提升。P8 的來源還原與功能驗收仍是有效的歷史結果，P9 將另驗新規格。

## 2. 證據與問題

本次逐張檢視 P8.9 的 **13 張代表畫面**：桌面列表／圖磚／圖庫／選取／個人設定／空工作／登入／公開單檔／空目錄／分享管理、手機列表、Debian 桌面目的地及手機進行中工作。原圖、環境、完整索引與 hashes 保留於 P8.9（本機 `../validation/P8.9.md`）；另檢查目前 theme、CSS 及 Workspace／TaskDrawer ownership。沒有擷取或保存 8088 的使用者檔案畫面。

### 需修正的可量測問題

| 問題 | 位置與狀態 | 證據、影響與最小修正 |
| --- | --- | --- |
| 一般字級的白字／亮藍選取對比不足；高信心 | [theme/index.ts](../../apps/web/src/theme/index.ts) 第 5–8 行與 [styles.css](../../apps/web/src/styles.css) 第 597–598 行；桌面選取列、圖磚 | `#fff`／`#2196f3` 算得 **3.124:1**，16px 一般／500 字重不適用大字例外。改成淡藍底配深色文字；主要按鈕與小字連結改較深藍。logo 與裝飾性資料夾不套用文字門檻。這是色票計算及原碼／截圖確認，尚未逐一檢查所有產品 DOM 狀態 |

[WCAG 2.2 的一般文字對比要求](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)為至少 4.5:1，大字例外為 3:1。計算輸入與完整數值見預覽檢查紀錄（本機 `../design/P9/evidence/checks.json`）。P9 仍須測實際合成色、hover、焦點及錯誤狀態，不能把數組色票通過稱為全站 WCAG 通過。

### 主要設計不一致

下表屬 experience critique／polish，優先級為「主要」，沒有將美感偏好當成功能故障。

| 觀察 | 畫面與原碼 | 使用影響、信心與 P9 處理 |
| --- | --- | --- |
| 名稱與次要資料同樣灰 | 列表（本機 `../validation/P8.9/windows-desktop-list.png`）、圖磚（本機 `../validation/P8.9/windows-desktop-mosaic.png`）；CSS 522–560 行均大量引用 secondary | 掃讀重點偏弱；高信心。檔名用深色 15px／500，日期、大小用 13px 次要色；圖磚名稱 14px／500。用實際字重與行高驗中文，不先更換字體家族 |
| 圖示比內容搶眼 | 圖庫（本機 `../validation/P8.9/windows-desktop-gallery.png`）、公開單檔（本機 `../validation/P8.9/windows-desktop-public-file.png`）；圖庫無圖內容 128px、公開檔案 160px | 一般文件也形成巨大實色圖形；高信心。工具 20–22px、列表 24px、圖磚 36px，無預覽圖庫 56px；真正安全縮圖保留較大視覺區 |
| 主要操作淹沒在相同圖示中 | 桌面列表（本機 `../validation/P8.9/windows-desktop-list.png`）、手機列表（本機 `../validation/P8.9/windows-mobile-list.png`）；CSS 565–577 行隱藏 toolbar-label | 視覺上難區分「上傳」與刷新／排序；高信心。全域頂列放搜尋／帳號／工作，目錄標題旁放具文字的上傳、新建；其餘保留一組局部工具。能力與完整 accessible name 不變 |
| 表單卡片與控制樣式不一致 | 個人設定（本機 `../validation/P8.9/windows-desktop-personal.png`）、目的地（本機 `../validation/P8.9/debian-desktop-destination-browser.png`）；CSS 805–814 行 | 同一表單中的標籤、輸入邊界與提交主次不穩定；高信心。共用 40px 控制／手機 44px、6px 圓角、清楚 label、卡片 footer；保留 native select，透過共享規則對齊 |
| 正常空狀態過於強烈，工作入口搶佔內容角落 | 空目錄（本機 `../validation/P8.9/windows-desktop-workspace-empty.png`）、空工作（本機 `../validation/P8.9/windows-desktop-tasks-empty.png`）；CSS 851–903 行 | 正常空白也用 80px 悲傷表情／32px 字；無工作仍常駐浮卡。對優先級的判斷為中高信心。空狀態用中性小圖與下一步；工作入口移到頂列，無工作不浮出，進行中／待確認以數字與文字明示 |
| 樣式規則累積，容易只改好部分狀態 | [styles.css](../../apps/web/src/styles.css) 第 204／535／597 行反覆指定 selected 卡片，以及逐份 P8 覆寫 | 屬靜態可維護性事實，未證明它造成每項視覺問題。各切片在原 owning section 整理適用規則與 token；不再在檔尾疊加一整套 P9 覆寫，也不一次重寫全站 CSS |

### 次要調整

- 將設定頁 24px 的卡片標題收斂為 18px，頁面標題保留 22px；讓分類、區塊與欄位各有層級。
- 把桌面側欄從 256px 收斂為 224px，平板用 192px 保留中文字；手機沿用 drawer。更寬的平板側欄是可讀性取捨，需用完整工具列實測。
- 移除普通卡片陰影，使用細邊界；只在 Modal、選單、浮動工作面板使用陰影。深色預覽背景維持既有安全內容呈現。

## 3. 色彩與字體規格

以下是 **P9 候選規格**，獨立預覽已呈現；正式 `theme/index.ts` 尚未變更。

| 語意 | P9 值 | 使用原則 |
| --- | --- | --- |
| 主要操作／連結 | `#245ea8`；hover `#1c4b87` | 上傳、當前導覽、真正可執行的提交；白字按鈕對比 6.478:1 |
| 內容文字 | `#202832` | 檔名、頁面／區塊標題；白底對比 14.883:1 |
| 次要文字／一般控制圖示 | `#596673` | 日期、大小、說明；白底對比 5.878:1；不因「次要」而低於文字門檻 |
| 版面／側欄／內容面 | `#f5f6f8`／`#f0f2f5`／`#ffffff` | 使用背景分區建立層次；大面積保持中性 |
| 選取／當前導覽 | `#eaf1fb`／`#e0e8f3` | 淡底配深字＋checkbox／aria-selected；不用顏色作唯一狀態證據 |
| 邊界／分隔 | `#dce1e7`／`#edf0f3` | 表面與列的分隔，不當作唯一可辨識的輸入邊界 |
| 輸入邊界 | `#8d99a8` | 輸入框在白面可辨識；focus 為 2px primary，offset 依 owner 決定 |
| 資料夾 | `#527eb1` | 僅檔案類型圖示；不直接套文字連結 |
| 錯誤／警告 | `#b42318`／`#845300` | 搭配明確文字與圖示；底色 `#fff1ef`／`#fff5df`，分別 5.973／6.021:1 |

字體沿用本機 Roboto 400／500／700 與既有中文 fallback；不引入遠端字體或新套件。字級以用途固定：頁面 22／31、區塊 18／27、檔名 15／22、內文 14／21、metadata 13／20、少量提示 12／18px。手機輸入仍 16px、主要按鈕／icon hit area 至少 44px；長名稱自然增高。中英文 fallback 的實際字形仍須在 Windows／Debian 各自檢視，不能只驗 computed font-family。

間距以 4／8／12／16／24／32px 為主；控制／內容卡 6px 圓角，浮層 8px。不加背景漸層、裝飾插圖或新動畫。既有過場需維持 reduced-motion 與焦點規則。

Ant Design 透過[官方 token／ConfigProvider 機制](https://ant.design/docs/react/customize-theme/)對齊；自有 CSS variables 從同一 palette 導出，Modal／portal 也使用同一來源。預覽是 HTML／CSS 設計工具，不能直接搬進 production 當成另一套元件系統。

## 4. 各頁面的設計

| 區域 | 設計安排 | 必須保留 |
| --- | --- | --- |
| 私有殼層 | 64px 頂列；左側 FileHub 字標、中間有範圍的搜尋、右側工作與帳號；側欄分主要導覽／儲存入口，設定與版本低權重 | 原分享管理、垃圾桶、設定及多入口都存在；demo 只示範部分導覽，不能因此刪除正式入口或另建 router |
| 目錄內容 | 路徑／22px 標題與項目數；上傳為主、新建為次；下方一組檢視、選取及刷新 | 唯讀／無寫入權限不提供假上傳；前往路徑、排序、重新整理與分頁仍可達 |
| 詳細列表 | 桌面短列 52px、手機約 64–68px；檔名深、metadata 次要，手機保留大小／日期摘要；無選取不顯示批次列 | 長名增高、完整名稱可讀；所有列均為既有公開 listing，單擊開啟、Space／Ctrl 選取不變 |
| 圖磚／圖庫 | 圖磚為名稱＋metadata 的橫向內容，手機單欄；圖庫安全縮圖區約 144px／手機 112px，無圖檔縮小 placeholder，手機兩欄 | list／mosaic／thumbnails wire value、偏好與暫時切換語意不變，沒有需要的 schema migration |
| 選取／選單 | 淡藍背景與明確勾選；桌面在既有局部工具位置替換，手機保留底部操作列 | 動作來自 actionsFor／同一 snapshot；不改選取集合或為換模式清空選取。所有更多／右鍵操作可由鍵盤開啟 |
| 搜尋／短浮層／預覽 | 搜尋明確區分名稱 filter 與包含子目錄；短表單 400–440px、主次 footer；預覽保留全畫面並改善資訊層級 | partial／取消／401／失敗可見；搜尋背景 inert；目的地仍讀真實授權；UTF-8 pre／JPEG／PDF 第一頁、安全限制與降級不變 |
| 設定／帳號／儲存／分享／垃圾桶 | 頁面 22px／區塊 18px；桌面雙欄最多約 1040px，小視窗單欄；細邊卡、統一輸入與 footer，寬表格自行捲動 | 所有分類與角色、dirty／busy／離開保護、真實資料／opaque IDs、衝突及撤權行為 |
| 登入／公開分享／狀態 | 登入 360–380px、明確 label；公開單檔聚焦名稱／大小／到期／下載，減少巨大裝飾；公開頁不設空白側欄 | 不加註冊或第三方登入假控制；密碼前不漏名稱、secret fragment、獨立公開身份及 readiness／錯誤／問題編號 |
| 工作／空與錯誤 | 工作在頂列有固定入口，0 項不浮出；進行中／待確認 badge；手動展開約 380px 非模態浮卡，手機靠底；空狀態中性 36px 圖示／18px 標題與有權限的下一步 | 不 dispose controller、不丟 File、不重送；新增項目與其他 Modal 焦點規則、committed bytes、unknown／needs_review 及列表可達性 |

## 5. 狀態與工程交接

| 責任 | 現有 owner／處理方式 | P9 邊界 |
| --- | --- | --- |
| 共用語意色／字體 | `theme/index.ts`、Providers、ToolIcon：extend | 維持集中來源及本機資產；不換 UI library |
| 布局／導覽 | WorkspaceShell、WorkspaceNavigation、FileToolbar、PathNavigation：compose／extend | 呈現換位置；useLocation query／guard 與 root SPA 邊界不變 |
| 列表／動作 | FileListing、ResourceActions、ResourceMenu、SelectionToolbar：extend | 公開 contracts、snapshot、version selection、能力與安全規則不變 |
| 資料讀取 | 原 FilePanel／search／preview API client：reuse | 不為樣式新增第二份 cache／假資料 fallback |
| 持續工作 | Workspace 的 UploadController／OperationController：reuse；TaskDrawer：extend | 顯示 0 項／badge／浮卡不改資料生命週期，401 清理仍有效 |
| 表單／公開頁 | 現有 Settings／Write／Destination／Share／PublicShell owners：extend | 草稿、auth、CSRF、idempotency、公開與私有身份分流不變 |

正式實作每份都要檢查 hover、focus、selected、disabled、loading、empty、error、partial、readonly、長內容、窄視窗與必要的 reduced-motion；狀態標籤須有文字。只因顏色規格更換而失敗的幾何／pixel 斷言須改成 P9 的明確規格；不能直接刪掉測試或刷新所有 golden。

## 6. 驗收與取捨

- 基準資料沿用 [prepareLayout](../../tests/e2e/workspace-data.ts)：6 資料夾＋60 文件、每頁 50，另驗長名／圖片／PDF／空目錄。預覽同樣使用 66 筆合成資料，但沒有真實 API、縮圖解碼與 metadata witness，不將它當 production 驗收。
- 原型示範可寫入口的操作層級，P8 Windows 圖則受開發唯讀能力限制；不能據此比較寫入是否可用或宣稱權限已驗。正式 P9 在 Linux 驗真實寫入、Windows 仍保持唯讀。
- 正常桌面 1440×1000：頂列 64px、側欄 224px、表頭頂緣 ≤224px、至少 13 筆短列完整可見；選取前後表頭位移 ≤4px。800×1024 側欄 192px；1920px main 利用剩餘寬度，設定／公開閱讀區保留上限。
- 390×844：表頭頂緣目標 ≤320px、至少 6 筆短列完整可見；必要提示或展開面板不套此正常狀態門檻。手機顯示搜尋／具文字操作及 metadata，較 P8 多用頂部空間，這是明確的可辨識性取捨，需在實作時檢查 320px 寬與短手機。
- 原型頂部另有 **40px 桌面／平板、61px 手機的審查列**，不屬產品規格。本次原型表頭 y=257／253／376.5，扣除後為 **217／213／315.5px**；審查列仍占視窗時完整列數為 13／14／6。不能把扣除列後的密度當作已實測；正式產品不含審查列時需重新驗收。
- 所有必要文字／按鈕實際色對比 ≥4.5:1、互動邊界／焦點另驗適用的非文字要求。200% 瀏覽器縮放、鍵盤／焦點、真實 API 與兩平台字形需要在 P9.8 完成；原型的 640px 重排不是實際 zoom 測試。
- P9.8 再跑 Windows／Debian 完整核心與 Chromium，逐張驗各頁／三檢視／浮層／狀態；P9.9 另做正式 image、Compose／release、完整備份／隔離還原與保留資料交付。原型檢查與完整產品回歸分開報告。

## 7. 本次已交付與未驗範圍

[獨立預覽與使用說明](../design/P9/README.md)包含 12 個場景、三種視窗 **36 張原圖**及手機選取／工作並存一張，共 **37 張**。已跑實際 Chromium：零頁面／console error、無文件橫向溢位、篩選／50＋16 分頁、兩列選取、短 Modal／Escape／返回焦點、手機導覽及工作面板／底部選取列不互蓋。色對比計算、SHA 與量測保存於 checks.json（本機 `../design/P9/evidence/checks.json`）。

本次僅測 Windows 的獨立 HTML 預覽；沒有重新測正式 FileHub API／worker、Linux、真實檔案、全部管理分類、縮圖／PDF、完整搜尋或發布新版。深色模式、新圖示／字體包、資料庫／部署架構與新增功能都不納入 P9。版本仍為 `0.40.6`，8088 沿用已交付版本。
