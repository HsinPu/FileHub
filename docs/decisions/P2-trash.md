# P2.3 垃圾桶與還原

日期：2026-10-28。沿用 [P2.2 寫入](P2-synchronous-writes.md)與[協調](P2-write-coordination.md)，管理資料為 schema 6。

- 每入口使用其已認領 `.filehub/trash/<UUID>`；managed／external 相同策略。移入／還原只做同檔案系統不覆寫 rename，來源／目的 device 不同或核心 EXDEV 明確拒絕。沒有複製 fallback、遞迴永久刪除或容量不足時直接刪原檔的行為。
- 保留至還原，P2 不設定自動到期／清空／GC；空間耗盡回 STORAGE_FULL。每入口最多 1000 筆歷史 trash records、全域 10000 intents，超限拒絕新操作，後續維護依 P6 設計，不能直接刪 SQL row。
- 移入要求來源及來源父目錄 write，不允許入口根／目前 grant 根。還原要求目前仍可寫原路徑、目的父目錄及入口，且 payload witness／版本一致；新位置必須既有資料夾。目的同名拒絕，使用者可調整名稱／位置重開新 UUID，不覆寫。
- member 只見自己且目前 scope 可見的項目；admin 可見入口內紀錄。撤回 write 後仍有 browse 可查看自己的項目，還原 disabled；撤回全部 grant 不再看見入口。狀態查詢不回 owner、主機路徑或私有 payload path。
- `trash_items` 與 prepared intent 同一短交易建立；terminal intent 與 available／restored／needs_review 同一短交易更新。restoring 有條件更新，兩個不同還原請求不能同時取得同一項目。交易不含 FS 等待。
- 列表只查當前入口最多 1001 rows，依目前 scope 過濾後每頁 50；最多 4 個 list／4 個 mutation。只檢查當頁 payload，不遞迴掃垃圾桶。缺失／不同 witness 回 needs_review 與不可還原，不把 GET 變成修復操作。root 離線／identity 錯誤則回明確不可用。
- witness 是 inode／stat 證據，非遞迴內容快照。資料夾搬移保留整個子樹；同 UID 外部程式改動私有子內容不在隔離保證內。owner 中斷與記錄／實體修復於 P2.4，不能單憑 exists 就接管活著的 owner。

API：`GET/POST /api/entries/:entryId/trash`、`POST /api/entries/:entryId/trash/:id/restore`，寫入沿用 session／Origin／CSRF；沒有 DELETE 永久刪除端點。網站有移入確認、分頁回收列表、原位置／狀態、還原名稱與相對目的地。輸入新位置後先「確認還原位置」取得 metadata，再送預期版本。Modal 關閉完成後才卸載，保留焦點返回；逾時查原 UUID，不自動重播。

需求參考固定舊 FileHub `77b606bb9bd552a00c5e13c3dc16571623548565:backend/app/services/trash.py` 與研究報告 05／藍圖垃圾桶契約；不搬用舊程序內 MUTATION_LOCK 或非持久恢復判斷。原碼保持不變。真實 NAS／NFS／SMB 故障、Windows 正式寫入及完整備份還原未驗。
