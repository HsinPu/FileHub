# P2.4 中斷判讀與受控恢復

日期：2026-10-28，延續 [P2.2](P2-synchronous-writes.md) 與 [垃圾桶](P2-trash.md)。版本 `0.16.0`，schema 6 不變。

## Ownership 與 fencing

`recoverWrites`／CLI `write-recover` 使用正式 WAL 與私有 owner 檔。先以新的 open file description 開啟舊 guard，確認為普通檔案、非 symlink，再嘗試 nonblocking flock。busy 代表原程序或繼承 fd 的 helper 尚未釋放；缺檔、權限、型別或 helper 錯誤回 owner_unknown。這些情形不改原 row，不依 PID／TTL 解鎖。

取得舊 guard 後仍持有 probe fd，再建立本次 recovery 的 guard。以舊 owner／generation／status 條件更新到新 owner，才讀取實體；最後同樣使用新 owner／generation 條件提交 terminal。SQL 交易不包含 FS，trash 的 terminal 狀態一起更新。每次最多 128 活動意圖；工具結束才關本次 guard。舊 handle 即使保留，generation／owner 也不能更新。

## 判讀規則

僅接受已知種類、入口、相對來源／目的地與私有 namespace 的計畫；trash／restore 另外確認管理 row 對應與 witness 一致。核對原 root 與 control identity，symlink／未知物件拒絕。只開 handle 觀察、必要時 fsync 父目錄，不執行 rename、unlink、複製、重建或遞迴刪除。

| 已證明 owner 停止後的狀態 | 結果 |
| --- | --- |
| 已知 prepared 計畫，尚未進入可發布階段 | failed，保留私有殘留，不重播 |
| applying／needs_review：來源 witness 相同、目的不存在 | failed，原物保留，不重播 |
| 來源不存在、目的 witness 相同，父目錄 durability 核對成功 | succeeded，表示目前觀察已達成結果 |
| 兩邊存在、兩邊消失、witness 不同、root／計畫／管理紀錄異常 | needs_review，保留 reservation 與原物 |
| guard busy／缺失／無法證明；或條件更新已改變 | busy／owner_unknown／changed，保留現場 |

witness 是 stat 證據，不是遞迴內容快照或永久 inode ID。FileHub 無法阻止外部修改，也沒有 FS＋SQLite 的共同原子交易；回復結果代表查核當時的觀察。真實斷電、NAS／NFS／SMB、inode 重用及不可中斷核心 I/O 不在已驗證保證內。

## 工程與對外結果

MutationService 可注入窄範圍 adapter／checkpoint 供隔離測試使用，正式 main 不注入，沒有 HTTP／環境變數故障開關。強制中斷與 IPC 僅在測試 wrapper，所有 child／目錄由 fixture 自己建立並收尾。ENOSPC／EIO 以 adapter 明確注入；EXDEV 與 EACCES 使用真實 Linux filesystem／權限。

CLI 逐項只回 id／outcome；全部為 succeeded／failed 或沒有活動紀錄時 exit 0，仍有未解決項 exit 2，設定／平台／啟動失敗 exit 1。exit 0 不表示原始寫入全部成功，須讀 outcome。網站遇回應遺失維持未確認狀態，查相同 UUID 後才刷新，不自動再送 POST。P2 不提供永久刪除或強制解鎖。
