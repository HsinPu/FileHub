# P8.6 登入與公開頁

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

日期：2026-10-30；版本 0.40.3／schema 13。依[主計畫](../../IMPLEMENTATION_PLAN.md)與[全畫面參考](../reviews/filebrowser-visual-reference.md)的登入、公開密碼／單檔／資料夾與錯誤畫面改寫。

登入採白底、256px 置中表單、64px FileHub 標誌、40px 標題與簡短錯誤。帳號由管理員建立及服務狀態／版本資訊仍保留；手機輸入與主要控制至少 44px。原 session、深連結、pending、密碼清除及錯誤固定文案不變。

`PublicShell` 只共用 64px 頂列、256／160px 側欄及手機導覽 Drawer，不建立私有身份、入口、上傳或工作 controller。公開分享只有登入連結；狀態頁只有頁內導覽。共用 skip link 可聚焦 main 而不覆蓋 URL fragment，分享秘密仍只用原 fragment／Authorization；不放 storage、query 或畫面。公開密碼表單沿用 400px 短 Modal，解鎖前不顯示資源名稱。

解鎖後使用簡單 metadata 卡、160px 青色檔案圖示與原檔下載。資料夾在寬螢幕為摘要／列表兩欄，平板及手機上下排列。仍用既有公開分享 API、專屬 Cookie Path、snapshot 分頁／版本、來源與 owner grant 驗證，不加入 QR、編輯器、資料夾打包或未接後端的控制。FileHub 的期限／分享範圍說明是必要差異。

公開狀態保留實際 readiness、等待／未就緒／連線錯誤、問題編號與重試，使用共用圖示及白色卡片；不以來源的 HTTP 錯誤代碼假代 FileHub 狀態。來源 commit、樣式取用與修改依[第三方聲明](../../THIRD_PARTY_NOTICES.md)；驗證結果在 P8.6（本機 `../validation/P8.6.md`）。
