# P6.1 公開分享

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

版本 0.30.0，schema 11。參考 [R5 §5](../filebrowser-study/05-security-and-rewrite-boundaries.md)、[R4](../filebrowser-study/04-user-flows-and-state.md) 與 [B §7](../filebrowser-study/07-filehub-rewrite-blueprint.md) 的公開分享／驗收需求；實際契約以 `packages/contracts/src/shares.ts` 為準。來源固定 commit 與研究證據沿用研究文件。

## 連結與身份

- 瀏覽器產生 UUID 與 32 bytes 隨機秘密，連結為 `/?share=<UUID>#<43 字元 base64url>`。秘密只放 fragment，公開 API 經 Authorization Bearer 傳送；不寫 URL query、browser storage、伺服器日誌或 owner DTO。原始連結只在建立對話框顯示一次。
- `shares` 保存秘密的 SHA-256、可選的 scrypt 密碼 hash、owner、來源、期限與撤銷狀態；`share_sessions` 保存另外產生的公開 grant digest。公開頁不執行 `/api/session`，也不使用登入 client 的到期／導覽狀態。瀏覽器可能仍送出 Path=/ 的既有身份 Cookie，公開路由完全忽略它。
- 密碼沿用身份模組的單一程序 KDF admission 與參數／15–128 字元規則；salt 從每份 256-bit 隨機秘密分域產生，允許相同 UUID／完整輸入驗冪等。request hash 包含慢速密碼 hash，不能保存可快速離線猜密碼的額外摘要。參數依 [Node crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback)；精確 runtime 保持 24.22.1。
- `/info` 僅公開密碼需求與期限；取得有效秘密及密碼後，`/access` 才回名稱並設定獨立 HttpOnly／SameSite=Strict、限定單一分享 Path 的 Cookie（HTTPS 加 Secure）。最長一小時且不超過分享到期，不是身份 session；參考 [Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)。同源 Origin／Fetch-Site 驗證，忽略代理提供的 Host。

## 來源與存取

- 不分享入口根目錄。建立時需目前 download grant 及 metadata version，來源固定 path／device／inode／birthtimeNs；來源 FS 必須提供正的 birthtimeNs。原地更新同一物件可讀到新內容；移動、刪除或同名替換會拒絕。這不是不可變檔案快照。
- 資料夾 descendant open 在走訪到來源 prefix 時驗證 pinned fd 的原物件身分，避免先驗來源後另走一條未綁定路徑的替換競態。所有 symlink 仍拒絕；公開路徑只相對於該分享。Linux 使用既有 fd／O_NOFOLLOW 邊界；Windows 仍只是開發唯讀，不能宣稱完整敵意 ABA 隔離。
- 每次公開請求、下載每段前後均重查分享、期限、owner／入口啟用及目前 download grant。撤銷刪除該分享的 grants。既有已送出的 bytes 不能收回；尚在串流中的下載在後續檢查點中止。
- 公開 DTO 沒有 entryId、原始 prefix、主機路徑、write／copy／share 能力；只有目錄與一般檔案。v1 提供列表、相對導覽與原檔附件下載，不提供公開預覽、ZIP 或寫入。
- 單段 64 KiB manual read，共用 FileService 四份容量；中斷／關閉等待進行中的 I/O 後釋放 handle。弱 ETag 不用於 If-Range，保守傳完整原檔。期限與檢查不搶占核心 I/O。

## 有界狀態

分享到期最多 30 天，owner 最多 100 個有效分享，全域 10,000 筆歷史。owner 列表最多 100 筆，有效者優先；無永久刪除或延長端點。公開 grants 最多全域 2048／每分享 32，過期者在取得新 grant 的短交易移除。每 15 分鐘每 IP 60 次、IP＋分享 10 次解鎖嘗試，保存雜湊 key，節流紀錄上限 10,000。沒有額外 SQLite retry。

POST 僅相同 owner、UUID 與完整輸入可重用；建立回應遺失後前端 GET 同 UUID 查結果，不自動重送。秘密與密碼僅在該頁記憶體；關閉後不提供秘密復原。

## 驗證

結果、命令、平台與限制見 P6.1 驗證（本機 `../validation/P6.1.md`）。完整備份／重新綁定來源身分另由 P6.3 處理；不能把 SQLite 備份當成分享來源快照。
