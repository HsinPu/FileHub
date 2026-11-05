# P4.3 縮圖與快取

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

圖片縮圖 `GET /api/entries/:entryId/preview/thumbnail?path=...&version=...` 使用同一 PreviewService、download grant、pinned source 與隔離 decoder。固定 256×256 inside、不放大、JPEG q80、移除 metadata，單張輸出 256 KiB；原圖／像素／並行／期限依[預覽政策](P4-previews.md)。P4.3 收斂 decoder 為 8-bit uchar、忽略 ICC、轉 sRGB；16-bit 圖片降級下載，以限制像素工作集。PDF／文字不產生縮圖，使用一般檔案圖示。

第一版明確採 **API 內的記憶體 LRU**，最多 32 項且總計 16 MiB，單項仍受輸出上限約束。命中提升順序、加入前逐項淘汰，Buffer 進出複製避免呼叫端污染。只快取已通過來源版本及當下權限檢查的 JPEG，關閉清空，重啟為空並按需重建。沒有持久索引、磁碟檔案、TTL、預生成工作或 P5 執行器。既有 `/data/cache` volume 保留但此版不寫入；正式 API 單實例限制不變。

這是對原先 cache volume 預留的具體收斂：目前只需短小圖片的按需重用，記憶體上限可直接核對，避免加入另一份持久 ownership／清理紀錄。未來需要大量或跨重啟重用時，另增磁碟 adapter、容量及故障驗收，不能將本份結果當成已完成磁碟 cache。

每次請求即使命中也重新開啟／授權原檔，64 KiB 讀取計算完整 SHA-256。key 包含 renderer revision／sharp 版本／profile、entryId、相對 path、stat fingerprint 及完整內容 hash。miss 時 child 再核對收到的完整 bytes hash；完成後再驗 handle stat、目前路徑 identity 與 download grant。不同 profile、同路徑替換、快速修改不重用舊結果；撤權或來源消失無法藉 cache 取得 bytes。這不提供外部程式任意修改中檔案的原子 snapshot 保證。

解碼 CPU 留在 child，API 只做有界串流、hash 及最多 4 MiB 的衍生 Buffer 處理。既有 2 個在途預覽限制不增加，沒有無界排隊或自動重試。系統測試在自有目錄複製正式 renderer，將 child 換成可證明卡住的 stub，驗期限 kill／取消、等待 process close 及借用 handle 保留；沒有修改正式產物或原檔。

資源 probe 使用[實際 decoder fixture](../../tests/system/fixtures/preview-resource.mjs)在正式 UID／cgroup 下測 16 MP PNG、256px JPEG 輸出與超像素拒絕。child 只在受控測量 env 記錄 resourceUsage 的數值；正式 renderer 不轉交該 env、不輸出原檔／路徑。量測與平台限制見 P4.3 驗證（本機 `../validation/P4.3.md`）。
