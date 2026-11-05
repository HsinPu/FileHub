# P4.1 篩選與搜尋

目前目錄以 `GET /api/entries/:entryId/files?filter=...` 名稱篩選，先在完整有界目錄 snapshot 篩選再分頁；filter 屬 version identity。URL 保留篩選，切換目錄清除。最多 5,000 個目錄項目的既有限制不變。

遞迴搜尋用 `GET /api/entries/:entryId/search?path=...&query=...`，名稱不區分大小寫、不搜尋內容、不解析 regex。query 為 1–128 字元；空白、控制字元與不完整 Unicode 拒絕。固定 8 層、10,000 次掃描、100 筆結果、2,000 ms，API 每程序最多 2 個在途搜尋。DFS 一次只開目前目錄／子項，深度與 buffer 有界；不累積所有檔名。

回傳單份有限 JSON，包含 `partial/reasons/scanned/omitted/elapsedMs`。達深度、掃描、結果或時間上限即回報；消失／不可讀子項與遍歷中變動回報部分結果。入口消失遵循 scoped storage 的 503；權限消失或變動拒絕整份結果。結果次序按 path，未宣稱整個樹的穩定 snapshot，也不提供 continuation cursor。

開始、每個項目與回傳前重查 EntryService；只能從已授權目錄開始，不跟隨 symlink、不進 `.filehub`，沒有 grant 的 sibling 不會被遍歷。browse-only 可以找名稱但 canDownload=false。作業系統阻塞 I/O 不能被 JS 期限搶占，2 秒是檢查點期限，不是 wall-clock SLA。關閉／斷線中止，所有 iterator／fd 在 finally 釋放。

前端分開兩個有標籤表單，送出新查詢、取消與目錄切換會 abort 舊請求；generation 防止晚到結果覆寫。搜尋結果開啟對應目錄，後續預覽依 P4.2 串接。

參考固定來源 `833d908884d5c801f30f5c098d7977177eb3a36b` 的 `search/search.go:15–76`、`http/search.go` 與[研究報告 §8](../filebrowser-study/03-backend-and-api.md#8-原專案實作下載搜尋與圖片衍生內容)。採用 scope／名稱搜尋概念，重新制定限額、完整 JSON 及取消契約。
