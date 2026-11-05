# 上傳操作

管理員先依[小型寫入](writes.md)啟用入口與 member write grant。上傳只在 Linux 開啟；Windows 開發請用 Linux 容器。協定、上限、期限與錯誤依 [P3 決策](../decisions/P3-upload-protocol.md)。

在可寫入的目錄按主要工具列「上傳」，再選「上傳檔案」或「上傳資料夾」。選檔後開啟右下「工作」面板，上傳區顯示原目的地、已確認 bytes、驗證／發布與逐項錯誤；收合或切換目錄／設定仍保留佇列，重開可看目前狀態。進度以伺服器已提交 bytes 計算，送出中的 bytes 另列，發布確認前不顯示完成；完整 SHA-256 在完成項目的「驗證資訊」展開。瀏覽器須 HTTPS 或 localhost 供 Web Crypto 驗 hash；每批最多 100 項。已存在的同名資料夾會驗權後沿用，同名檔案不覆寫；資料夾選取不含空資料夾，請另用「新建資料夾」。

直接 API 先建立 UUID session，依回傳 offset 每次傳滿 4 MiB（末段為剩餘 bytes），帶 Content-Length、X-Upload-Offset 與 SHA-256 的 X-Upload-Checksum。PUT 成功只代表暫存已提交，須 finalize 成功才會在檔案列表出現。零 bytes 也需要 finalize。

中斷或回應遺失時查詢相同 session；沒有收到 finalize 回應也不能換 UUID 重傳。完成狀態及完整 hash 可查，重複 finalize 不重複發布。所有建立、接收、發布及取消請求均須有效 cookie、相同 Origin 與 X-CSRF-Token；不要將 token 或 cookie 寫入 shell 紀錄。

重新整理後由面板「重新選檔續傳」，選同名／同大小原檔；瀏覽器逐段比對已傳 prefix，錯檔不會繼續傳送。File 與 CSRF 不存 localStorage，無法自動重開本機檔。取消或到期紀錄保留必要的清理狀態；清除面板完成項目只影響當次畫面。

同名會拒絕且保留原檔，不自動覆寫、改名或跨 FS 複製。單一 session 在途取消會回 busy，待接收結束後重試。取消／到期的 cleanupPending 表示容量仍保留；Linux worker 在 DB ready 時自動清理，每批最多四筆。預設間隔 60000ms，可用 `FILEHUB_UPLOAD_MAINTENANCE_INTERVAL_MS` 設 1000–3600000ms；會在最多 64 個未清理項目間輪轉，不能保證固定完成期限。

已發布但 DB 結果未知時先停止 API／worker 與其他 state 使用者，再執行 `pnpm admin -- write-recover`。恢復必須同時證明 mutation／upload owner 已釋放；缺 guard 或忙碌保留 reservation。完整 hash 或 witness 不匹配需要管理員檢查，不能用 TTL／force unlock 當作證據。此入口不重播 rename，也不刪原檔。

上傳維護可手動執行一批：

```sh
# 原生 Linux，使用與服務相同的 FILEHUB_STATE_DIR
pnpm admin -- upload-maintain

# Compose：排查未決結果時先停止兩服務，保留 volumes
docker compose stop api worker
docker compose run --rm --no-deps api apps/server/dist/cli.js upload-maintain
docker compose up -d --wait --wait-timeout 45 api worker
```

結果含本批 items 及 publication 判讀；exit 0 表示本批可判讀／清理，不代表全域已掃完，可再跑一批。busy／owner_unknown／needs_review／changed 是 exit 2，設定／平台／DB 啟動失敗是 exit 1。缺證據時不要刪 guard 或用萬用字元清 `.filehub`；保留紀錄供管理員核對，詳細依[維護決策](../decisions/P3-upload-maintenance.md)。

worker 只回復已驗過的 prefix／未提交尾端，或清理已取消／到期的自有暫存，不會自動 finalize。取消若遇到已發布結果，仍回 completed 並保留原檔。停止或重建兩服務後，原 session／offset 在 SQLite 保留；瀏覽器仍需重新選檔比對才能續傳。

頂列「工作」顯示沒有工作、進行中或待確認等摘要；無工作不自動浮出。手動開啟右下 380px 非模態面板，手機全寬；Tab 可離開，面板內 Escape 返回入口，關閉不取消。搜尋／手機導覽暫時隱藏面板，返回可繼續查看，逐項取消／回查與未知狀態仍依原契約。
