# P5 持久工作

## P5.1 catalog 與執行權

schema 8 新增 `operations`／`operation_items`；資料庫保存要求、資源 reservation、owner、attempt、lease、取消請求及逐項結果。公開 DTO 只含使用者需要的狀態／進度，不含主機路徑、guard 或內部 evidence。API／worker 各借用自己原有的單一正式 DB 連線。

`queued → running → succeeded | partial | failed | cancelled | needs_review`；執行中取消先變 `cancelling`。尚未開始的 queued 可直接取消。`interrupted` 僅表示已證明舊 owner 消失、且全部 item 尚未開始；只有這種狀態提供明確 retry。未知副作用保留 `needs_review` 與 reservation，不自動重播。

claim 在 IMMEDIATE 短交易條件更新；executor 先建立本機 OFD guard 再領取。lease 為 5 秒，每秒延長，item／進度／terminal 更新檢查 owner、attempt、lease 與狀態。進度單調、預設每 250ms 至多寫一次；完成時可強制落盤。逾期後必須取得原 guard 的新 OFD 排他鎖，才能 fencing。缺少 guard、舊程序或繼承 helper 仍持有 guard 時保留原狀態；時間不構成 I/O 已停止的證據。

P2 寫入與 P5 工作在同一短交易內檢查兩類持久 reservation；父子路徑互斥。上傳發布、回收及還原沿用 P2 協調，不能繞過 active operation。queued／running／cancelling／interrupted／needs_review 均保留 reservation。每工作最多 16 個來源、要求 64 KiB；全域 32／每帳號 8 個 active、歷史 10,000 筆，列表 active 優先最多 50 筆。SQLite busy 回固定 503，沒有額外重試。

相同 UUID 只接受相同 owner／完整要求，JSON 欄位順序不影響去重。來源版本、來源／目的地授權及目前 session 在建立前檢查，executor 執行時仍須重查。GET 不修復 FS；取消與 retry 使用同源 Origin／CSRF。沒有 handler 的種類拒絕建立，不讓不支援的工作永遠排隊。P5.1 尚未開放複製／搬移／ZIP；後續各份加入 handler 後再開放。

Windows 只驗 catalog／SQLite 競爭模型，正式寫入與 OFD proof 僅 Linux；兩者的驗證結論分開。Compose heartbeat 是程序健康，不能當 operation lease。關閉等待 executor 與 helper；核心 I/O 卡住時期限不能搶占，也不能宣稱取消已完成。

## P5.2 複製與搬移

schema 9 新增 `operation_nodes`，保存逐節點種類、相對路徑、來源 witness／SHA-256 與目的地 witness。每工作最多 1000 節點、16 層、合計 2 GiB，單檔 1 GiB；掃描、讀取與檢查均逐項重新授權，不接受 symlink／私有 namespace／特殊檔案。每個根來源執行前驗公開版本，拒絕重疊來源、自身子樹及原地相同名稱。複製可另指定新名稱；搬移須有來源及其 parent 的寫入權限。

衝突政策只有 `stop`／`skip`，都不覆寫、合併或自動改名。skip 的衝突項仍明示 CONFLICT，其他成功則整體為 partial。建立到執行間目的地版本若已改變則拒絕；執行中的每次發布也重新開啟目的地確認 identity／版本。reservation 含來源、目的地及搬移來源 parent，重複範圍去重，最多 33 份；P2 內部 composition 只以目前 operation 的 owner／attempt／有效 lease 取得自身 reservation permit，公開 API 不接受 permit。

複製逐根寫入目的入口 `.filehub/staging/o-<UUID>-<index>`，原檔 bytes 不進 SQLite。固定子程序繼承 operation OFD guard；每次 64 KiB 讀寫、SHA-256、fsync，傳送節流進度。發布前重驗來源全樹與暫存內容，最後用原生 renameat2 NOREPLACE／parent fsync 發布。發布後再驗 identity／內容，才回逐項成功。bytesDone 表示已複製 bytes，不能單憑 100% 判定已發布。

同裝置搬移直接原子 NOREPLACE rename 並驗原 inode／全樹內容。跨裝置搬移先完成並驗副本，再借用 P2 TrashService 將來源送到原入口私有回收區；兩個 guard 都傳給該原生 helper。來源保留至日後明確還原／管理，沒有永久 unlink fallback。副本已發布但來源變更、撤權、取消或回收失敗時回 needs_review、保留 reservation，不能顯示完整搬移成功。

取消是協作式檢查點；helper 在讀寫間處理取消訊息，核心 I/O 停滯仍需等待。已知未發布暫存僅按 journal 的 inode／精確 witness 清除，檔案要求 nlink=1，資料夾由底向上 rmdir，未知子項／替換／缺失保留現場。沒有遞迴盲刪、TTL force-unlock 或自動重新執行。不明狀態仍計入 active quota，可能保留磁碟容量。

`pnpm admin operation-recover` 每批最多四份，只在舊 owner／helper guard 已釋放後觀察、驗 hash／identity 與 fsync，確認既有發布結果；不執行複製／搬移／回收。跨裝置來源已回收時另要求 P2 journal、trash row 及 payload 全樹吻合；先執行 `write-recover` 處理 P2 不確定狀態。發布前中斷的暫存、來源仍存在或證據不完整均保留 needs_review，不提供盲目 retry。exit 2 表示本批仍未解決，exit 0 不代表所有歷史工作都已處理。

Windows 保持唯讀，不開放新工作；Linux 以實際 ext4／tmpfs 驗證。來源 FS／目的 FS 不支援 NOREPLACE 時回 WRITE_UNSUPPORTED，不降級成 exists + rename。真實 NAS／NFS 故障留 P5.5 驗收。

## 參考與後續

依 [ARCHITECTURE §6](../../ARCHITECTURE.md#6-同步操作與背景工作)及[主計畫 P5](../../IMPLEMENTATION_PLAN.md#p5-持久背景工作與檔案轉移)；來源研究見 [File Browser 後端](../filebrowser-study/03-backend-and-api.md)。File Browser 固定 commit 的 fileutils/copy.go 用於比較複製行為，舊 FileHub transfers.py／operations.py 用於回顧需求；不沿用其程序內 RLock 或 exists+rename fallback。ZIP 與 UI 見 [P5.3](P5-archives.md)、[P5.4](P5-workspace.md)，環境驗收與 NFSv3 範圍見 [P5.5](P5-fault-acceptance.md)。
