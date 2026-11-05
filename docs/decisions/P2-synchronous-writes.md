# P2.2 同步小型寫入

日期：2026-10-28。延續 [P2 協調](P2-write-coordination.md)，正式平台為 Linux／amd64；Node.js／TypeScript／Fastify 與既定依賴不變。

- 入口預設唯讀，CLI `entry-write ID on|off` 明確開關。member 另須 `entry-grant USER ID SCOPE write`；write 包含 browse／download／P2 寫入。admin 仍受入口開關限制，OS EACCES／EROFS 仍拒絕。Windows 原生不啟用寫入，沒有安全 primitive 時回 WRITE_UNSUPPORTED。
- 新建以 `.filehub/staging/<mutation-id>` 的 exclusive mkdir 準備，再發布；改名保留原 inode／bytes。私有 `.filehub` 不接受公開路徑／grant，也不在列表顯示；初始化只建立全新目錄，DB 保存 control device／inode，絕不接管既有同名內容。中斷初始化可留下未採用目錄，需管理員確認，不能自動刪除再接管。
- `POST /api/entries/:entryId/directories`／`rename` 使用 session、Origin、CSRF，再由共用 service 重驗來源／目的地 scope、父目錄與來源預期版本。根／授權 scope 根不可改名，父子互移及跨入口不支援。未授權請求不建立意圖或私有檔案。
- 每個請求含 UUID；相同帳號／種類／完整 payload 的已完成 UUID 只回既有狀態，不重做副作用。修改輸入須新 UUID。同時／不明結果回 busy／needs_review；`GET /api/mutations/:id` 只回目前帳號的公開結果。前端 timeout 不宣稱失敗，也不自動重送，保留查詢按鈕。
- metadata fingerprint 是 stat 的弱版本，不是原子內容 CAS。來源與父目錄版本重驗，helper 又驗來源 witness；外部程式仍可能同時修改，發布後不一致回 needs_review。reservation 是 FileHub 程序間協調，不能鎖住外部程式。

## Linux primitive 與 ownership

Node 的一般 rename 無不覆寫旗標；新增窄範圍 C helper，以繼承的 directory fd 執行 `renameat2(RENAME_NOREPLACE)`，來源 witness 不符／目的存在／EXDEV 都拒絕，不採 exists-then-rename 或覆寫 fallback。helper 無 shell／遞迴複製／刪除／自由主機路徑；compiler 只在 build／驗收環境，runtime 只含產物。不同 filesystem 不支援 primitive 時明確拒絕。[Linux rename 手冊](https://man7.org/linux/man-pages/man2/rename.2.html)

MutationService 為每程序建立私有 state/write-owners UUID 檔；helper 在繼承 fd 上取得 flock。鎖與 open file description 綁定，helper 退出後 Node 仍持 fd；Node 意外結束時，在途 helper 仍持同一 fd。沒有以容器 PID／到期時間推測 owner 已死。service close 等自己操作結束後才關 guard，API main 再關 DB；factory 只借用服務。缺少 guard 或不明結果不得偷鎖；恢復於 P2.4 接上。[Linux flock 手冊](https://man7.org/linux/man-pages/man2/flock.2.html)

SQL 短交易只做 reservation／狀態，不含非同步 FS。prepared 在公開副作用前，applying 與 witness 先持久化，再執行單次 rename，fsync 兩父目錄後核對結果，最後 succeeded。未知 errno、fsync／postcheck／DB 完成失敗會保留 needs_review；不自動重播。私有 staging 失敗殘留保留供判讀，P2 不自動 GC。

同主機一般外部改名／替換、符號連結、衝突與授權撤銷有隔離測試；不宣稱抵抗同 UID 惡意持續修改 mount／祖先目錄，也不宣稱真實 NAS 故障或跨磁碟測試已完成。Linux Docker ext4 與 Windows 開發的結果分開記錄。
