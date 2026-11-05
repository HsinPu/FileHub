# 小型寫入操作

先依[部署](deployment.md)完成 migration，再依[入口](entries.md)註冊既有目錄。正式寫入需要 Linux image、可寫掛載、UID/GID 權限與服務支援的 filesystem；入口預設唯讀。停止 API／worker 後，使用相同 image／state／入口掛載執行：

```powershell
docker compose run --rm api apps/server/dist/cli.js entry-write ENTRY_ID on
docker compose run --rm api apps/server/dist/cli.js entry-grant member ENTRY_ID team write
```

重啟兩服務，再登入或重新整理入口。只有 grant 的子樹可寫，來源與目的地皆須授權；既有同名項目保留，錯誤不會轉成覆寫。`entry-write ENTRY_ID off` 只停用後續寫入，保留管理紀錄與原檔；已通過最後授權的在途 syscall 仍可能完成，管理變更須配合停機。

目錄 `.filehub` 為私有 staging／trash namespace，不能自行修改／移動／共用給其他入口。啟用時若已存在未認領的同名目錄會拒絕；請先停機並確認其用途／內容，不自動刪除。Windows 原生開發只讀取；寫入驗收以 Linux 容器進行。

寫入逾時時使用對話框「查詢操作結果」。needs_review 會阻擋重疊位置，應先停機保存 DB 與入口／owner 證據；不能靠重啟、刪 DB row 或刪 guard 釋放 reservation。受控恢復工具見下節。DB-only 備份不足以回復原檔、私有 payload 與在途 owner；完整回復使用 [P6.3 完整快照](full-backup.md)。

## 垃圾桶

選單項後按「移至垃圾桶」並確認，完成後可由側欄「垃圾桶」頁（`/?view=trash&entry=ENTRY_ID`）查看原位置與狀態。頁面可刷新、返回，保留原檔案 query 上下文；還原仍用短對話框。按還原可改名稱、選擇相對資料夾；位置變更後先按「確認還原位置」，再提交。目的地同名會拒絕，原項目與 payload 都保留。member 只見自己目前授權範圍內的紀錄，admin 可見入口內項目。

不自動清除、不提供永久刪除；每入口最多 1000 筆歷史回收紀錄。空間或配額不足先處理容量，不改成直接刪除。needs_review 的項目停用還原，保留現場；不得自行移動／刪除私有 namespace 或 SQL row。跨檔案系統需複製的搬移本版明確拒絕，原檔保留。

## 中斷後受控判讀

先停止 API／worker 與其他 FileHub 寫入程序，保留原 DB、入口私有目錄與 state/write-owners；使用同一 image／state／入口掛載執行：

```shell
docker compose stop api worker
docker compose run --rm --no-deps api apps/server/dist/cli.js write-recover
```

工具逐項回 id／outcome，不重做 rename 或刪檔。succeeded 是目前目的與 witness 相符，failed 表示已確認未達成、原物保留；needs_review 保留 reservation。busy 表示原程序或在途 helper 仍持 guard；owner_unknown 表示缺檔或無法證明，不能刪 guard／row 強行接管。缺少 guard 的 DB-only 還原不屬於可自動恢復的狀態。

全部已判讀（succeeded／failed）或無活動項為 exit 0；尚有 busy／needs_review／owner_unknown／changed 為 exit 2；設定／平台錯誤為 exit 1。不要把工具 exit 0 當作原始寫入全部成功。未解決項應保留現場，由管理員比對實體與備份；P2 不提供 force-unlock／永久刪除。確認後以 `docker compose up -d --wait api worker` 啟動，仍有未解決位置則寫入持續被阻擋。
