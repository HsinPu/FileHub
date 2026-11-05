# P8.7 管理分類與卡片

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

日期：2026-10-30；版本 0.40.4／schema 13。依[全畫面參考](../reviews/filebrowser-visual-reference.md)的設定、帳號與分享管理畫面，改寫固定來源的 dashboard.css 構圖。

`ManagementNavigation` 為真正的根 query 路由連結：個人設定、分享管理、帳號管理、儲存與授權，以及目前入口的垃圾桶。管理員分類只對 admin 顯示，member 仍可使用原有個人設定／分享／垃圾桶；直接管理深連結與 API 依原權限拒絕。全部連結呼叫 Workspace 的 navigate／離頁守衛，保留檔案入口、路徑、排序、filter 與版本分頁，不另維護頁籤狀態或改 SPA fallback。

分類以水平藍底／底線呈現，窄視窗只捲動分類列；切換後使目前分類在該捲動區可見，不推動整個頁面的水平位置。語意為帶 aria-current 的導覽連結，保留鍵盤 Tab／Enter 與 focus-visible，沒有只換顏色的假頁籤。

設定採 24px 標題、2px 圓角、16px 內距與白色陰影卡；1200px 以下單欄，其上雙欄，表單仍有真正 disabled／dirty／pending 狀態。帳號、入口與 grant 表格只在自己的容器橫捲；分享管理改同一語言的表格，不重新顯示或推導完整分享連結。垃圾桶保留來源、狀態、還原能力、衝突與保留政策。

上傳／工作 controller 仍屬 Workspace；切換分類、分享及垃圾桶不重建或重送。儲存失敗保留草稿，busy 阻擋分類／側欄／返回／登出，密碼變更與撤權仍使舊 session／存取失效。既有 CLI 候選入口只用 opaque ID，不把主機路徑放進表單。

測試 helper 必須等待真正的頂列控制或手機更多按鈕出現，不能在 portal 尚未掛載時，以單次 isVisible=false 推論為手機。保留原 case／expect 期限與零 retry。驗證與畫面依 P8.7（本機 `../validation/P8.7.md`）；取用來源與修改依[第三方聲明](../../THIRD_PARTY_NOTICES.md)。
