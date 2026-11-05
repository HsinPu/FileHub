# P3.4 上傳清理與重啟

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

日期：2026-10-28。延續[協定](P3-upload-protocol.md)及 [P2 owner proof](P2-recovery.md)，不修改既有 migration、上傳期限或背景工作模型。原檔發布仍由明確 finalize 執行；worker 不自動發布內容。

## 責任與排程

Linux worker 擁有 UploadMaintainer 與自己的 OFD guard。DB ready 才執行，預設 60000ms 一批，`FILEHUB_UPLOAD_MAINTENANCE_INTERVAL_MS` 可設 1000–3600000ms；每批最多四筆，在最多 64 個未清理紀錄間輪轉，避免 busy 項目一直擋住後面。這是有界專用維護；通用工作 claim／lease 後續由 [P5](P5-operations.md) 建立，兩者分開。

loop 的 stop signal 阻止開始下一筆；關閉等待本筆維護、helper 及 guard 後才關 DB。同步 SQLite、核心／網路 FS I/O 不能由 deadline 搶占；heartbeat 的 freshness 及 DB ready 不代表所有上傳紀錄都已清理。

## 恢復與 fencing

1. publication intent 只挑本批 upload IDs，沿 P2 同時取得 mutation／upload 舊 owner 的 OFD proof；不自動恢復其他 P2 操作。
2. 接收／驗證舊 owner 的 guard 必須可由新 OFD 取得；缺 guard 為 owner_unknown，仍持鎖為 busy。時間、PID 與程序內旗標不能代替證據。
3. 以 id／owner／generation／state 有條件 fencing。自己的前一批已完整結束時可持同一 guard 再觀察；不同 owner 仍需 OS proof。
4. 未發布的中斷接收重讀並驗全部已提交 chunk hashes，只 truncate offset 之後的自有尾端、fsync，再回 open；來源不符、prefix 損毀或未知檔案保留 needs_review。驗證階段重啟也只回可重試，不自動 finalize。

維護不放寬 user 的瀏覽／寫入／發布權限。EntryService 的私有 maintenance 只為 worker／CLI 取得已登錄 root identity 與 control identity，不註冊 route；因此 owner 被撤權或入口停用後，仍能丟棄已明確取消／到期的自有暫存，不能藉此瀏覽或刪除公開檔案。

## 清理範圍與取消競爭

- 只處理 cancelled／expired 的 `.filehub/staging/u-<UUID>`。核對 root／control／staging／payload identity、regular file、nlink=1 及大小邊界；未知同名、換 inode、symlink、hardlink 都保留。
- Node 傳遞既有 guard 與 pinned parent fd 給窄 helper 的 unlink；helper 再驗精確 witness、unlinkat 單一檔案並 fsync parent。沒有遞迴刪除、通配字元、公開目標查找或刪除 guard／control 目錄。
- native helper 繼承 OFD，parent 死亡後在途 helper 仍阻擋接管。unlink 完成但 DB 未提交，保留 reservation；之後取得 owner proof、確認私有檔案缺失及 parent fsync，才釋放容量。
- 接收／finalizing 持 owner 時取消回 busy，前端停止本次請求後查詢／重試取消。若 finalize 已發布，取消回 completed，不能刪原檔；取消先取得終態時不能再發布。
- 清理完成只更新 cleaned／reserved bytes，保留 session、manifest 與意圖歷史；10000 筆歷史上限不變。到期後不可續傳；清理時間受批次、owner 與儲存可用性影響，不承諾固定完成期限。

## 手動入口

`pnpm admin -- upload-maintain` 執行**一批最多四筆**，輸出 items 與 publication 判讀結果。exit 0 表示本批均可判讀／清理，並不表示全域已掃完；需要時再執行。busy／owner_unknown／needs_review／changed 為 exit 2；平台／設定／DB 啟動錯誤 exit 1。結果不含 host path、guard、owner 或 cookie。

排查未決結果先停止兩服務及其他 state 使用者；沒有 force-unlock／TTL 偷取／未知內容刪除選項。操作見[上傳](../operations/uploads.md)，實測範圍見 P3.4（本機 `../validation/P3.4.md`）。
