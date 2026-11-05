# P1.3 有界列表與下載

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

版本 `0.10.0`、schema 3 不變。每個入口仍經 P1.2 的帳號／grant／scoped storage；檔案內容取自即時 FS，不建全量索引、不提供 HTTP 檔案寫入。

## HTTP 契約

| Endpoint | 行為 |
| --- | --- |
| `GET /api/entries/:entryId/files` | path、sort=name／size／modifiedAt、direction=asc／desc、offset、limit、version；回 items／scope／total／hasMore／omitted |
| `GET /api/entries/:entryId/metadata` | path、可選預期 version；回公開 metadata，不包含 host root／inode |
| `GET /api/entries/:entryId/download` | 一般單檔串流、可選 metadata version，單一 byte Range；不打包目錄 |
| `HEAD /api/entries/:entryId/download` | 與 GET 相同授權／標頭，忽略 Range，不建立 reader／送 body |

`ResourceMetadata` 包含 name／相對 path／kind／size／modifiedAt／version／canBrowse／canDownload。symlink／特殊檔案可列為不可操作項目，絕不跟隨 target；binary download 為 attachment＋application/octet-stream＋nosniff，Unicode 檔名使用 filename*，不支援 inline HTML／預覽。

## 列表、版本與界線

- Directory stream 最多掃描 5000 項，超限回 422 RESOURCE_LIMIT，不假裝完整結果；每頁 1–100。offset>0 必須帶 version；Unicode／字面百分號保持，不二次 decode。
- 每批最多 8 個 lstat，等待全部 settle 才關 directory handle；每程序最多 4 個 FS 請求／下載，超額回 503，不建立無界 queue。
- directories first；名稱以 ordinal 比較，size／modifiedAt 相同再以名稱定序。每請求重新掃描有界集合、排序及分頁，不使用舊 listing 當 FS 真值。
- version 為目錄／項目 stat metadata 與授權快照的 digest。目錄或結果改變回 409，呼叫端刷新；不是 file content hash／不可變 snapshot。外部寫入可能在掃描或下載期間發生。
- Node opendir 使用 buffer 名稱以驗 UTF-8 往返；不能表示的 raw 名稱計入 omitted，合法的替代字元仍可讀。固定 @types/node 24.19.2 漏列此 encoding，僅該行以具說明的 ts-expect-error 適配，實際 Node 24.22.1／Windows／Linux 行為另測，不放寬其他型別。

## 串流與生命週期

只開一般檔案，開啟後、送出前重驗 session／grant。reader 綁已開啟 handle、64 KiB backpressure、捕捉大小為 end，避免檔案成長多送資料；提前 EOF／I/O 錯誤關閉連線，錯誤物件先轉固定公開錯誤，不把 host path 傳給 Fastify 日誌。

完整、suffix／open-ended 單一 Range 回 200／206；不滿足的 bytes 回 416／Content-Range。未知單位與未實作 multi-range 保守忽略回完整內容。ETag 標為 weak metadata validator；If-Range 一律回完整內容，HEAD 不處理 Range。依 [HTTP Semantics](https://httpwg.org/specs/rfc9110.html#field.range)及 [Node FileHandle](https://nodejs.org/docs/latest-v24.x/api/fs.html#filehandlecreatereadstreamoptions)實作。

reader／public stream／handle 在正常、HEAD、零 byte、取消、例外與 app 關閉都有 ownership 清理。HTTP plugin 只關自己的下載，不關借用 service／DB；close 等所有自有資源 settle。中斷不保證能搶占核心 NFS I/O；已送出的 bytes 不能撤回，已開始的下載不是即時撤權保證，後續請求重新授權。

P1.4 前透過 HTTP 契約使用；操作與實測見 P1.3 摘要（本機 `../validation/P1.3.md`）。完整原檔一致性、跨實體磁碟／NAS 故障及 ZIP／背景工作仍留對應階段。
