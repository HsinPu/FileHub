# 帳號初始化與 session 操作

P1.1 提供後端帳號／session，P1.4 已有首頁登入介面。先使用本版本 image／產物完成 migration；資料庫不得放網路檔案系統。

## 初始化與帳號 CLI

原生環境先 `pnpm build`、`pnpm db:migrate`，再執行：

```shell
pnpm admin bootstrap admin
pnpm admin user-create reader
pnpm admin user-password reader
pnpm admin user-disable reader
```

前三個命令在互動終端提示密碼並隱藏輸入；至少 15 字元，最多 128 字元。非互動 stdin 接受一個 JSON object，只有 `password` 欄位供命令使用；自動化從秘密管理器或受控輸入串接，勿將真實密碼放 argv、env、shell history、儲存庫或輸出紀錄。停用不讀取密碼。

Compose 先啟動 migration／API／worker，再在互動終端執行：

```shell
docker compose exec api node apps/server/dist/cli.js bootstrap admin
docker compose exec api node apps/server/dist/cli.js user-create reader
docker compose exec api node apps/server/dist/cli.js user-password reader
docker compose exec api node apps/server/dist/cli.js user-disable reader
```

無預設帳密；bootstrap 只允許空帳號庫，重複操作失敗。`user-create` 建立 member；最後一個有效 admin 不可停用。CLI 是取得主機 state 存取權後的管理入口，未開放遠端建帳號 API。改密碼與停用會原子撤銷該帳號全部 session，不需重啟 API。

## 同源設定與 HTTP 契約

- 原生 loopback 未指定時，以設定 host／實際 socket port 驗證 Origin。使用開發 proxy 時，明確將 `FILEHUB_PUBLIC_ORIGIN` 設為瀏覽器 origin。
- Compose 預設 `http://127.0.0.1:8088`，隨 `FILEHUB_HTTP_PORT` 調整。反向代理須設定完整 HTTPS origin，例如 `https://files.example.com`，不能帶結尾 `/`、路徑或帳密。HTTPS 由代理提供。
- HTTP 僅支援 loopback 開發；HTTPS origin 發 Secure Cookie。請求提供偽造 Host／X-Forwarded headers 不會改變信任 origin。
- `POST /api/session` 接 JSON username／password 並要求同源 Origin；成功回公開 user、csrfToken、expiresAt，session 僅由 HttpOnly Cookie 傳送。
- `GET /api/session` 取得目前 session；401 需重新登入。`DELETE /api/session` 另要求同源 Origin 與 `X-CSRF-Token`，成功 204；舊 Cookie 重播失敗。
- session 絕對 12 小時，最多 10 個有效 session；帳號 5 次／IP 30 次登入嘗試、15 分鐘視窗，KDF 同程序限一個；429 請稍後重試。沒有清除全部 session 的公開 HTTP 管理 API。

session／密碼／CSRF 不放 browser storage；前端只在記憶體保存 csrfToken。DB 只保存 session token hash，DB 備份仍含敏感帳號 hash，按既有[停機備份與還原](deployment.md)管理權限。

API 錯誤只回穩定 code、固定訊息與 requestId。不要為排錯開啟原始請求／Cookie／密碼紀錄。完整契約及來源見[session 決策](../decisions/P1-session-and-access.md)。
