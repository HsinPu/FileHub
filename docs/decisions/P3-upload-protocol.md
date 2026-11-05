# P3 上傳協定

日期：2026-10-28。採自訂 **FileHub upload session v1**，沿用同源 cookie／Origin／CSRF、入口 opt-in 與目前 grant。公開 DTO 不含主機路徑、暫存 identity、owner 或 guard。

## 選擇與來源

TUS 1.0 以 HEAD／PATCH、Tus-Resumable 與 Upload-Offset 定義續傳，offset 不符應拒絕；完成驗證與應用程式發布仍須另外安排。本版需要明確的 finalize、每段 manifest、P2 不覆寫發布與受控恢復，因此選自訂 JSON／octet-stream 協定；不宣告 TUS 相容，也不提供假 TUS headers。依據：[官方協定](https://tus.io/protocols/resumable-upload)。

行為參考為 File Browser 固定 `833d908884d5c801f30f5c098d7977177eb3a36b` 的 `http/tus_handlers.go`／`frontend/src/utils/upload.ts`，以及歷史 FileHub `77b606bb9bd552a00c5e13c3dc16571623548565` 的 folder uploads；來源定位見[主計畫](../../IMPLEMENTATION_PLAN.md) FB5／FH4 及研究報告 [03](../filebrowser-study/03-backend-and-api.md)、[04](../filebrowser-study/04-user-flows-and-state.md)。來源不是新協定或已完成的測試聲明。

## 限制與完整性

| 項目 | v1 政策 |
| --- | --- |
| 單檔／空檔 | 0–1 GiB；空檔仍需 finalize |
| chunk | 每段 4 MiB，最後一段為剩餘 bytes；序列 offset，不並行寫同一 session |
| checksum | 必填每段小寫十六進位 SHA-256；建立時可提供完整 SHA-256 |
| finalize | 串流重讀全部暫存，驗每段 manifest／總長及可選完整 hash，再不覆寫發布；回傳完整 SHA-256 |
| 期限 | 建立後固定 24 小時，續傳不延長；到期不可續傳／開始發布 |
| 保留配額 | 每人 16 個／4 GiB、全域 64 個／8 GiB，含尚未清理及不確定結果；上限不代表實體磁碟保證 |
| 歷史 | 全域 10000 session、每入口 owner 優先未清理再依時間取 50 筆；每檔最多 256 段 |

容量在 BEGIN IMMEDIATE 中計算；取消／到期只有在證明無暫存或完成擁有的暫存清理後釋放。磁碟不足回 STORAGE_FULL，不能破壞目的地原檔。保留紀錄不自動刪除；達歷史上限須後續維護政策，不能靜默覆寫。

## 公開契約與分份實作

| 方法／路徑 | 語意 | 落地工作 |
| --- | --- | --- |
| POST `/api/entries/:entryId/uploads` | `{id,parent,name,size,sha256?}`；同帳號及完整相同輸入 UUID 可重查，不延長期限 | P3.1 |
| GET `/api/uploads/:id` | owner、目前可瀏覽範圍；回 offset、狀態、到期、manifest、canResume、cleanupPending | P3.1 |
| GET `/api/entries/:entryId/uploads` | owner 最近 50 筆，再依目前可見範圍過濾 | P3.1 |
| DELETE `/api/uploads/:id` | 取消自己的未發布內容；撤權後仍可取消，不能取消別人的內容 | P3.1 狀態；P3.4 清理／競爭 |
| PUT `/api/uploads/:id/content` | `application/octet-stream`，`Content-Length`、`X-Upload-Offset`、`X-Upload-Checksum`；成功回同一 DTO | P3.2 |
| POST `/api/uploads/:id/finalize` | 不接受新目的地／新 UUID；驗證並發布同一 session 的內容 | P3.2 |

HTTP 200 回契約 DTO。400 格式錯誤、401 session 無效、403 授權拒絕、404 不存在／其他 owner、409 offset／checksum／同名／終態衝突或在途操作、413 過長、415 格式不符、422 上限／平台不支援、503 尚未就緒、507 空間不足。拒絕時不回顯輸入或 host exception。GET 不進行 FS 修復。

狀態為 `open → writing → open → finalizing → completed`；open 可取消／到期。結果無法證明為 needs_review，保留配額；writing／finalizing 不能靠 TTL 偷鎖。完成 DTO 的 offset 必等於 size，完整 hash 有值。相同成功 finalize 不再次發布；取消已完成 session 只回完成結果，不刪原檔。

## 暫存、重送與重啟

暫存位置是入口自己的 `.filehub/staging/u-<UUID>`，與發布目的地同檔案系統；不使用共享 cache 假裝可原子移動。寫入持有 pinned parent、O_NOFOLLOW payload 與 OFD owner guard，DB 只記已 fsync 的 offset／manifest。短交易不包含 FS I/O。重新授權涵蓋段接收結束與發布前。

錯 offset 不動內容；已提交同一段的重送須重新讀取並驗證 bytes，不能只相信 checksum header。斷線／錯 hash／超長只回復本次未提交的尾端，不改已提交 prefix。重新啟動後先證明舊 OFD owner／helper 已離開，再 fencing 與判讀；缺證據保留 needs_review，不自動發布未知內容。

切換檔案瀏覽頁保留目前 File 與佇列。整頁重新整理後瀏覽器無權自動重開本機檔；顯示伺服器 session，要求重新選檔，逐段比對已提交 prefix 的 manifest 才續傳。這可阻擋相同檔名／大小但 prefix 不同的檔案；未提供完整 hash 時，不宣稱預知原始未傳尾端的 identity。P3.3 實作介面，P3.4 驗收清理、競爭與重啟。
