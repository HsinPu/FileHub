# P8.2 工作區殼層

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

## 範圍與依據

以 [File Browser 固定版本畫面](../reviews/filebrowser-visual-reference.md)及其 `header.css`／`mobile.css`／Sidebar 為幾何與視覺參考，改寫為 React／Ant Design。品牌維持 FileHub，側欄仍是已授權入口／scope，保留分享管理、垃圾桶與設定；不加入來源沒有對應 API 的新檔、shell 或用量資料。

全寬固定頂列高 64px，40px 品牌與 400px 搜尋區；側欄位於頂列下方，桌面 256px、737–1024px 為 160px，≤736px 使用 256px Drawer。桌面內容左留 32px、右 16px；1440／1920px 的檔案內容從 x=288 開始，800px 從 x=192 開始。路徑列最少 48px，長路徑自然增高。手機主內容兩側 8px，所有主要控制至少 44px。

## 狀態與呈現

WorkspaceShell 只提供 header slot，SearchControls 經 React portal 將輸入放入頂列，仍屬於 FilePanel 的狀態樹；遞迴結果、partial 與錯誤留在主要內容。搜尋範圍與送出控制在聚焦時展開，送出／Escape 收合，不把 overlay 留在麵包屑上；完整搜尋構圖及情境工具列由 P8.4 接續。

移除檔案頁重複的入口大標題；入口保留在側欄，麵包屑以 `aria-description` 提供目前入口，根節點改 home 圖示並保留原可存取名稱。唯讀／可寫入狀態放路徑列，前往路徑仍按需開啟。側欄採相同 Material 圖示、灰藍動作與平面分隔，長入口允許斷行及垂直捲動。

上傳／工作 controller 仍由 Workspace 建立與釋放。Drawer 維持 mounted，收合動畫結束後才執行導覽，保留 guard、query、Tab／Escape 與返回焦點；跨過 737px 會關閉 Drawer。根 query、授權、API、schema 與檔案開啟語意不變。

## 驗證

本份依三視窗與 1920px 實際量測殼層及路徑列，檢查導覽、長路徑、焦點、搜尋、設定草稿與 controller。列表／三種檢視／情境操作的最終外觀由 P8.3／P8.4，完整雙平台及部署由 P8.9／P8.10 接續。結果依 P8.2 驗證（本機 `../validation/P8.2.md`），不以本份宣告整體還原完成。
