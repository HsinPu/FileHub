# P1.4 登入與唯讀工作空間

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

版本 `0.11.0`，沿用 React／Ant Design／公開 contracts，不新增依賴或 migration。來源參考主計畫 R2、R4、R6、FB3 與舊 FileHub FH2；重新實作，不搬移 Vue／Material 樣式或舊 token 保存方式。

## 導覽與資料

- `/` 為登入／檔案工作空間；`/?view=status` 保留公開服務概覽。入口、相對路徑、排序方向與分頁用 query 表達，History API 支援返回／前進／重新整理。未知 API／檔案依舊 JSON 404，不加 catch-all。
- 功能導覽是儲存入口；目錄層級用麵包屑，最上層由伺服器回應 scope 決定。入口可有多個 grant scope，桌面側欄及手機選單均逐個提供。
- P1 不先掃描遞迴目錄樹。每次只讀目前目錄；若後續加入樹，必須按展開節點載入，沿用有界 API／授權，不在啟動時掃完整 NAS。
- Ant Design Table 每頁 50；後端排序／directories first，後續頁帶版本。路徑／入口／排序變更清選取，選取用相對路徑與列表版本，避免陣列索引指錯項目。
- 只有可下載的檔案可選；單選可下載，多選不假裝提供 ZIP。link／其他類型無法開啟。相對路徑輸入可直達有權子目錄，不能繞過後端 canonical／scope 檢查。

## Session、請求與下載

初始 GET session 後顯示登入或工作空間。HttpOnly Cookie 由瀏覽器傳送，user／CSRF 僅存 React 記憶體，不用 localStorage／sessionStorage。401 清受保護畫面並保留 URL 供再次登入；登出須 DELETE 成功才顯示完成，失敗可重試。

API client 將 JSON 視為 unknown、Check 公開 schema，10 秒期限與呼叫端取消都有清理。只顯示本地 code 文案，不反射任意 error message。useResource 同時核對請求代次／key 及 AbortSignal；新路徑載入時不沿用舊資料，晚回應不得覆蓋新頁面。載入／空目錄／錯誤／重試各有明確狀態。

下載先用 row version 查 metadata，通過才建立同源原生 attachment 連結；實際 download endpoint 再授權，避免前端將大型檔案整份轉 Blob。UI 僅顯示交由瀏覽器下載，完成與儲存結果由瀏覽器確認；送出後撤權／檔案變更仍可能失敗，不顯示虛假的完成百分比。

登入、workspace 與服務概覽分塊載入。ConfigProvider 關閉中文按鈕自動插空白，保留連續且可辨識的標籤。Vite `/api`／`/health` proxy 只供開發；API 必須明確設定 `FILEHUB_PUBLIC_ORIGIN=http://127.0.0.1:5173` 配合瀏覽器 origin，正式同源啟動不需要 proxy。

## 驗收

正式 build、正式 DB adapter 與隔離服務下，以 Chromium 三視窗驗登入深連結、列表／空狀態、排序／選取、原生 bytes 下載、分頁與刷新、入口切換、受限能力與麵包屑、鍵盤／無溢位、晚回應及錯誤重試。服務概覽原 18 cases 保留；結果、截圖與限制見 P1.4 驗證（本機 `../validation/P1.4.md`），視覺規則見 [DESIGN](../../DESIGN.md)。
