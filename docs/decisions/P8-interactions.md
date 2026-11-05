# P8.4 搜尋與情境操作

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

日期：2026-10-30；版本 0.40.1／schema 13。[主計畫](../../IMPLEMENTATION_PLAN.md)及[來源全畫面參考](../reviews/filebrowser-visual-reference.md)是驗收依據。

## 呈現與 ownership

- FilePanel 保留 listing snapshot、版本選取、預覽與寫入協調。`actionsFor` 以同一份資源、公開能力與目前 operation capabilities 產生分享／下載／copy／move／ZIP／rename／trash，頂列與資源選單共用，不另維護一份權限判斷。
- WorkspaceShell 只提供搜尋與動作 portal slot；控制器仍由 Workspace 擁有。搜尋展開期間背景 main／sidebar inert，返回或卸載解除；遞迴結果留搜尋全頁，純目錄篩選仍更新根 query。
- 預設不顯示 checkbox 欄或逐列操作欄。選取模式把 checkbox 放原圖示位置；卡片有覆蓋選取；Space／Ctrl 或 Command 點擊可選，資料夾與安全預覽仍單擊開啟。右鍵、Shift+F10 與更多按鈕使用同一資源選單；React portal 明確處理方向鍵／Home／End、Escape／Tab、界外 pointerdown、捲動與視窗變化，關閉即卸載並依原因返回焦點。沒有以孤立的 Dropdown trigger 代替右鍵手勢生命週期。
- 詳細列表改為名稱／大小／修改時間三欄，表頭可排序；圖磚／圖庫可從頂列排序選單使用相同 URL。切換檢視按鈕依列表→圖磚→圖庫循環，圖示表示下一種模式。
- 選取採 #2196f3 藍底／白字；桌面情境動作留頂列，手機為底部 8px 留白的固定列，內容下方增加空間。copy／move／ZIP 在窄視窗放更多選單；所有操作保留完整可存取名稱。
- 搜尋入口桌面 400px，展開為 64px 表單與最大 720px 結果；目前資料夾／包含子目錄明示，保留 partial、取消、重試與 401。返回／Escape 丟棄未送文字與遞迴結果，保留原 URL filter，返回搜尋觸發按鈕。

## 來源與必要差異

依固定 File Browser `833d908884d5c801f30f5c098d7977177eb3a36b` 的 header.css、mobile.css、listing.css、Search.vue、ContextMenu.vue 與實際畫面 20／21／24／42–44／52 改寫；授權及修改聲明見[第三方聲明](../../THIRD_PARTY_NOTICES.md)。保留 FileHub 品牌、繁中、多入口、版本與安全流程；沒有新增格式快捷卡、編輯器、shell、未接 API 的控制或上游後端。

來源右鍵和選取操作的外觀可還原，但 FileHub 的批次上限、下載權限、唯讀平台與 UUID 查詢不能移除。下載仍先讀 metadata，所有副作用仍由原後端重新授權；檔案圖示不代替 renderer 或權限。

完整實測與環境界線見 P8.4 驗證（本機 `../validation/P8.4.md`）。
