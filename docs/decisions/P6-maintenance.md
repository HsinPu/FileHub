# P6.3 完整備份、還原與升級

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

版本 `0.32.0`，schema 12 不變。依主計畫 P6.3、[架構 §8](../../ARCHITECTURE.md#8-資料庫與部署邊界)及[開發流程](../../CONTRIBUTING.md)。操作見[完整備份](../operations/full-backup.md)，結果見驗證（本機 `../validation/P6.3.md`）。這是 FileHub 自有 `filehub-full-v1` 格式；歷史 DB-only 工具仍只處理管理 DB。

## 一致性與範圍

- Linux 專用維護入口，Windows 明確回 WRITE_UNSUPPORTED。必須停止 API、worker、其他 DB 使用者及所有外部寫入者，再傳 `--quiesced`。這個旗標是操作者對停寫條件的聲明，工具不代替主機／NAS 停寫或儲存快照。
- 正式 API、worker、admin 持有穩定 state lock 的 shared flock；migration、DB-only backup、完整 backup 取得 exclusive。最後一個持有者關閉 DB／FS 資源後才釋放，不以 TTL 搶鎖。lock 是 0600、同 UID、單 link 的固定標記，不自動刪除或接管未知檔案。
- exclusive 仍不足以證明被終止父程序的 I/O 已停止；另核對 DB 中 owner 與全部 `write-owners/<UUID>.lock`，逐個以新 OFD 嘗試 exclusive proof。缺失、忙碌或未知 guard 全部拒絕，包含繼承 FD 的子程序。舊 image、直接 DB adapter、其他程式不參與 lifecycle lock，所以停機聲明仍必要。
- 包含 SQLite backup API 的一致 DB、state 內 ZIP／guard 等其餘檔案、全部已註冊入口（含停用入口及 `.filehub` trash／staging），及操作者提供的設定目錄。來源有任何缺失／無法讀取時整份失敗。cache／私有 heartbeat 不在快照內；目前沒有獨立 FileHub master key，帳密摘要在 DB，部署需要的 env／Compose／金鑰實體檔須放入指定設定目錄。
- DB 快照轉成 DELETE journal 並驗 history／integrity／FK，避免未列入 checksum 的 WAL overlay。原 DB／WAL／SHM 不直接逐檔複製。逐檔核對前後 witness／SHA-256，完成後重掃來源全集及核對 DB `data_version`。這些檢查能抓到已驗變更，不能證明任意外部寫入者不存在。

## 格式與資源

輸出必須是不存在的絕對路徑，父目錄已存在，不可位於來源 state／設定／入口之內。輸出 0700，檔案 0600；`manifest.json` 保存來源識別、項目與 SHA-256，`complete.json` 保存 manifest hash。manifest 含主機路徑及私有 metadata，只供離線維護，不經公開 API；checksum 是完整性檢查，不是簽章或加密。

只接受 strict UTF-8 的實體目錄與單 link regular file，拒絕 symlink、hardlink、特殊檔案及不同 `st_dev` 子樹，不默默跳過。最多 100 個入口、100,000 項（含各根與 DB）、64 層、相對路徑 1024 字元、64 GiB 內容、64 MiB manifest；串流 buffer 256 KiB。不保證核心 I/O 可被取消訊號搶占。

失敗保留 `INCOMPLETE`；verify 不接受不完整、額外／缺失項目、sidecar、路徑越界、重複項目或不同 hash。沒有覆寫、force、接續或自動清除失敗目錄。還原另以 manifest 保存的原 root identity 拒絕位於原 state／設定／入口內的目標，不需開原 DB；先驗完整來源才建立新目標，複製時再核 hash；來源快照與原入口均不被修改。

## 可攜還原與未完成工作

還原到 `<new>/state`、`<new>/storage/<entryId>`、`<new>/config`。入口 ID／kind／grant、帳號密碼摘要及偏好保留，實體路徑全部改成隔離副本，不自動接回原 NAS。新 DB 綁實際 root／祖先與已證明的 private control inode。檔案及目錄使用私有權限；重設 mtime 是 best effort 的時間精度，不還原 OS owner／ACL／xattr／sparse extent。

| 管理狀態 | 還原政策 |
| --- | --- |
| 身份與公開分享 session／throttle | 清除，需重新登入或解鎖；entry grant 不清除 |
| 候選入口 | 清除過時主機候選，必要時重新 `entry-offer` |
| available trash | 精確來源 stable witness／種類／固定私有位置相符才綁新 witness，否則 needs_review |
| ZIP artifact | 精確來源 witness／長度／SHA 與新 bytes 相符才可下載；不明／building 保留容量並標 review |
| 分享 | 原 path／kind／dev／ino／birthtime 相符才綁新來源，否則撤銷；既有期限與密碼摘要保留 |
| 從未領取的 queued 工作 | 僅 attempt=0、owner=NULL、全部 pending／無 evidence／nodes／artifact 才安全 cancelled，不自動開始 |
| 其餘未完成工作／寫入意圖 | needs_review，保留 request／reservation／副作用證據，不盲目重播或改寫歷史 JSON |
| 未發布上傳 | 保留 bytes／配額並標 needs_review；已證明 staging／payload 的舊 identity 才映到副本。正式維護仍須驗 committed chunks／完整 prefix 後回 open；不自動發布 |

還原中的 state 放固定 pending marker。中斷後即使 flock 已釋放，正式服務仍拒絕該 state；只在全部複製、metadata 重綁、DB 完整性及 receipt 完成後移除。未知私有檔案不能因為被複製就變成 FileHub 擁有。

## 升級與回復

唯讀 provenance 只接受本專案已知 migration hash 前綴 schema 10–12；舊 Python FileHub／任意 SQLite DB 拒絕，不直接採用。預設還原先升級副本至 schema 12。`--preserve-schema` 保留快照原 schema，供同版舊 image 的隔離回復；它不會將已升級 DB 降版。

升級前停兩服務、完整備份及演練還原，保留舊固定 image。新 migration 成功後才啟動同 image 的兩服務；失敗保持停止，不混版滾動升級。回復使用升級前快照建立新目錄／volume，再搭配原 image；不覆寫仍供診斷的原 state。正式 image 的舊版升級與回復演練在 P6.4 收斂。
