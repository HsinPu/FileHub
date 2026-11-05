# 背景複製與搬移

目前正式 Linux API／worker 支援持久 copy／move／archive 與工作面板。兩服務須為同版、同一份本機 state／WAL 及一致入口掛載；先停止兩服務、備份、migration，再啟動。限制與狀態見 [P5 決策](../decisions/P5-operations.md)及 [ZIP 決策](../decisions/P5-archives.md)。

## 介面操作

選取最多 16 個有權限的檔案／資料夾，按「複製所選項目」或「剪下所選項目」。剪貼簿可跨目錄保留；按「選擇目的地」點選授權入口／子目錄；「輸入路徑與其他選項」可手填既有相對目錄、單項新名稱，以及停止或略過衝突。畫面選擇不代替提交前的 metadata／授權驗證。搬移一經送出確認或結果未知即清空剪貼簿；來源被改名、版本或授權變更後須重新選取。

「建立 ZIP」封存目前選取。頂列「工作」開啟共用工作面板，上傳與背景工作各有區域；入口數字是進行中與待確認數量，摘要另列已結束數量。收合、切頁不停止或重新送出；重新整理後仍可回查背景工作，上傳則須重新選檔驗 prefix。逐項錯誤、部分完成、取消中與需處置都有不同狀態，工作 UUID 可展開「工作細節」查看；取消中不表示核心讀寫已停止。結果未確認時保留 UUID 並回查，勿重新送出。只有「重試未開始工作」可安全要求重新排隊；其他未決結果交由管理員判讀。

「下載 ZIP」先確認產物仍可用，再交由瀏覽器下載；請在瀏覽器確認結果與到期時間。storage 僅保留目前帳號最近 50 個工作 UUID，不保存待執行要求或密鑰。Windows 開發環境只能瀏覽工作紀錄，不能建立背景檔案工作。介面細節見 [P5.4 決策](../decisions/P5-workspace.md)。

## API 與恢復

登入後以 `GET /api/operations` 列出自己最多 50 份工作，`GET /api/operations/<UUID>` 回查指定 ID。`POST /api/operations` 使用新 UUID、copy／move、來源 entryId／path／version、目的地 entryId／path／version 及 stop／skip 衝突政策；可替單個來源指定 name。版本來自目前 metadata。所有修改請求需要目前 session、Origin 與 CSRF。

HTTP 回應遺失時先 GET 相同 ID；相同 UUID／完整要求可去重，不更換 ID 自動重做。取消用 `POST /api/operations/<UUID>/cancel`（無 body）。running 先成 cancelling；partial 表示僅部分來源成功，needs_review 表示副作用尚未能證明，不能當失敗後直接重送。進度 100% 仍需等待 terminal 狀態。

複製不修改原檔；搬移跨磁碟時，驗副本後將原內容保留在來源入口的回收區，沒有永久刪除。衝突不覆寫、不合併。未決工作會保留資源 reservation；其他修改可能回 MUTATION_BUSY。

重啟後 API 仍可依 ID 回查。lease 過期須先證明原程序與 helper 釋放 guard。可在維護狀態執行：

```sh
pnpm admin write-recover
pnpm admin operation-recover
```

Compose 使用同版 image：`docker compose run --rm --no-deps migrate apps/server/dist/cli.js operation-recover`。命令只觀察已發布結果，沒有重放。每批四份，exit 2／needs_review／busy 需保留現場調查；不要刪 write-owners、私有 staging 或修改 SQLite 來強制解鎖。只有全部 item 未開始且 owner 已停止的 interrupted 工作才有 `POST /api/operations/<UUID>/retry`。

每份最多 16 根來源、1000 節點／16 層／2 GiB，單檔 1 GiB；不支援 symlink、覆寫與特殊檔。Windows 開發路徑不啟用寫入。NFS／核心 I/O 停滯不能由 lease 或關閉期限強制取消。

NFS 無回應時，cancelling 可能持續至讀寫真正返回；API readiness 與 worker 父程序消失都不能證明 helper 已停止。恢復掛載後先保留工作與來源，讓有 guard proof 的維護判讀；needs_review 不代表可以重新做一次。不要刪 guard、改 SQLite、強制解鎖或清空未知 staging。可重跑的隔離驗收與已知掛載範圍見 [P5.5 故障決策](../decisions/P5-fault-acceptance.md)。

## ZIP

建立 archive 不提供 destination，conflict 使用 stop。封存不壓縮；來源失敗整份不提供半成品。完成 DTO 的 artifact 含 bytes／SHA-256／expiresAt；透過 `GET /api/operations/<UUID>/artifact` 原生附件下載，HEAD 可先驗目前可用性。需要原 owner 的有效 session 與目前所有來源的下載權限。

預留起 24 小時到期，全域 8 GiB 管理配額含未知／未清理 bytes。產物在本機 state 私有範圍，另預留 DB／WAL 空間，DB-only 備份不包含 ZIP。worker 定期清理；亦可執行 `pnpm admin archive-maintain`，或 `docker compose run --rm --no-deps migrate apps/server/dist/cli.js archive-maintain`。先停止 writer 再處理未決狀態；缺 guard、未知／替換與在途 helper 均保留。不要手動清空 state 或移除 guard 來解鎖配額。

頂列「工作」顯示沒有工作、進行中或待確認等摘要；無工作不自動浮出。手動開啟右下 380px 非模態面板，手機全寬；Tab 可離開，面板內 Escape 返回入口，關閉不取消。搜尋／手機導覽暫時隱藏面板，返回可繼續查看，逐項取消／回查與未知狀態仍依原契約。
