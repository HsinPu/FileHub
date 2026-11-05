# P5.4 檔案工作介面

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

沿用 React／Ant Design 與 [DESIGN](../../DESIGN.md)。`features/operations/` 的 controller 由 Workspace 擁有，檔案清單切頁不會卸載工作與剪貼簿；背景結果只 reload listing，保留仍開啟的寫入對話框。後端狀態與權限是唯一依據，前端不推測已完成或已取消。

`GET /api/operations/capabilities` 回傳目前程序可建立的種類及來源上限；Windows 回空種類。resource 的 canCopy 表示目前可作背景來源，讓有下載授權的資料夾可選取；canDownload 仍代表單檔下載。搬移另需 canWrite，目的地依目前入口可寫範圍選擇，送出前讀取目錄 metadata 版本；根目錄可建立不等於可重新命名，不能用 root 的 canWrite 判斷目的地。

複製／剪下保存最多 16 個來源的 entryId／path／version。切換目錄保留；再次取得來源列表發現版本、可用性或目前授權改變時清除。讀取與寫入的 grant 正向合併分別判斷。目的地對話框可指定既有相對目錄、單項新名稱及 stop／skip 衝突政策，拒絕自身子樹與相同位置；不提供覆寫或合併。搬移被接受或結果未知後清空剪貼簿，複製可明確再次操作。

建立前產生並保存 UUID；瀏覽器 storage 僅保留目前 userId 對應的最近 50 個 UUID，不保存 CSRF、來源要求、File 或憑證。POST 回應遺失只 GET 原 ID，不重新 POST。未知結果保留編號與警示；重新整理以 owner 列表及保存的 ID 恢復。沒有自動重試寫入；只有後端 canRetry 的未開始 interrupted 工作可由使用者明確重試。

工作面板最多 50 份，顯示整份與逐項狀態、確認 bytes、固定錯誤及 UUID。進行中或面板開啟時每 2 秒回查，未知 ID 每 5 秒、每輪最多 8 份；focus／online 重新查詢。讀取失敗保留最後狀態並提示；代次、AbortSignal、attempt／時間及狀態單調保護阻擋舊結果。401／登出卸載立即 abort，清空保護資料及 controller CSRF。

安全 retry 將 interrupted 改為 queued 時尚未增加 attempt；若 POST 回應遺失，GET 的同 attempt queued 仍須接受。舊的 claim 結果已有較低 attempt，不會藉此倒退；cancelling 仍不得倒退為 running。

partial 明示僅部分完成；cancelling 等待讀寫停止；needs_review 要求確認結果，沒有重新送出的捷徑。單項進度最多 99%，直到後端 item succeeded。ZIP 先以 HEAD 驗目前權限、大小與 SHA-256 ETag，再交給瀏覽器原生附件下載；不將整份 ZIP 放進 JS blob，也不宣稱瀏覽器已保存成功。

驗證使用真正 API、獨立 worker、file-backed SQLite、內容下載，以及僅在網路邊界中止回應的 Playwright fixtures；範圍與結果依 P5.4 驗證（本機 `../validation/P5.4.md`）。
