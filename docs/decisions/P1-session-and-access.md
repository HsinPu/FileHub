# P1 登入與存取契約

P1.1（2026-10-28）：應用程式 `0.8.0`，schema revision 2。P1.2–P1.5 依主計畫接續；本份先建立 identity，不開放檔案操作。

## 帳號與密碼

- 管理 CLI 由有 state 存取權的操作者執行，無預設帳密；只允許空帳號庫 bootstrap 一個 admin。後續 `user-create` 建 member，`user-disable` 停用、`user-password` 重設並撤銷全部 session。最後一個有效 admin 不可停用。
- username 為 3–32 字元 ASCII 字母／數字／`.`／`_`／`-`，首字元須字母或數字，統一小寫。不提供遠端帳號管理，管理頁留 P6。
- 新密碼 15–128 個 Unicode code points、最多 512 UTF-8 bytes，不截斷、不正規化，不接受 NUL。CLI 互動輸入不顯示；非互動只接受 stdin JSON，不從 argv／env 讀密碼，不輸出輸入或原始錯誤。
- 使用穩定的 Node `crypto.scrypt` 非同步 API：N=131072、r=8、p=1、16-byte random salt、32-byte key、maxmem 192 MiB。每程序最多一個 KDF，超出回 429，避免 512 MiB API 容器累積無界 KDF。未知帳號也跑相同成本的 dummy verification；比較使用 timingSafeEqual。

採既有 Node 穩定 API，不新增 native dependency 或採實驗 API。參數依 [OWASP 密碼儲存](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt)，API／salt／memory 行為依 [Node 24 crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback)。

## Session 與寫入防護

| 項目 | 契約 |
| --- | --- |
| 登入 | `POST /api/session` JSON username／password；回 user、csrfToken、expiresAt，另外 Set-Cookie |
| 查詢 | `GET /api/session`；每次從 DB 查 session 及目前帳號狀態，無效回 401 |
| 登出 | `DELETE /api/session`；同源＋有效 CSRF，刪本 session、清 Cookie，204；重播 401 |
| session 憑證 | 32-byte CSPRNG hex；DB 只存 SHA256，不儲存可重播 raw token。登入成功換新 token，撤銷請求帶來的舊 session |
| 到期 | 絕對 12 小時，無自動 refresh／滑動寫入；每帳號最多 10 個有效 session |
| Cookie | `filehub_session`，HttpOnly、SameSite=Strict、Path=/、無 Domain；HTTPS origin 加 Secure，清除用相同 attributes |
| CSRF | HMAC-SHA256(raw session token, 固定 domain label)，只回 JSON；前端僅記憶體保存，以 `X-CSRF-Token` 傳回；不能用它作 session |
| Origin | 所有改變 session 的請求要求 Origin 精確相符，拒絕缺少／null／cross-site；登入亦檢查，且只接受 JSON |
| 部署來源 | 以 `FILEHUB_PUBLIC_ORIGIN` 明確設定瀏覽器來源。HTTP 預設限 loopback，內網 HTTP 須另設 `FILEHUB_ALLOW_LAN_HTTP=true`。任意 Host／X-Forwarded headers 不會改變驗證對象 |
| 本機預設 | 未設定 public origin 時，使用設定 host 與實際 socket port；動態 port fixture 可用；正式 Compose 設定外部 origin |
| 節流 | SQLite 持久 15 分鐘視窗，account 5 次、IP 30 次；帳號成功清 account counter，IP 不清。key 為 hash；最多約 10000 筆，過期僅於登入清理 |

拒絕授權的讀取不更新 session 或寫檔；登入節流是明確的安全狀態寫入。KDF 不持有 DB transaction，完成後重新驗帳號／密碼 hash，避免改密碼／停用與登入競態。帳號修改與 session 撤銷同一短交易。前端不得將 session／密碼／CSRF 放 localStorage／sessionStorage，Cookie 由瀏覽器管理。

依據：[OWASP Session](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)、[CSRF Origin 與 token](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)。指定 File Browser 的 JWT／本機登出只作行為參考；舊 FileHub `77b606b` 的撤銷與 grant 案例作回歸需求，不移植舊 Python 程式或資料庫。

## Migration 與運作

Drizzle Kit 產生新增 users／sessions／login_throttle 的 SQL／snapshot，審查後補上 revision 2 更新；初始 migration bytes 不變。受控 migration 從 revision 1 升級，API／worker 不自動升級。既有 hash／known-prefix 相容門檻保留；驗證隨階段記錄在 `docs/validation/P1.*.md`。
