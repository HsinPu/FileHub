# 透過 A 瀏覽 C 的 FileHub

B 的瀏覽器登入 A，從 A 工作空間切換本機入口及「遠端 FileHub」入口。C 提供已授權資料夾的目錄與檔案清單。A 與 C 各自使用本機資料庫及儲存。

## 在 C 準備資料夾授權

使用 C 的 FileHub 0.41.0 或相容的更新版本，登入後選取要提供的資料夾，建立無密碼分享並保存完整連結。分享最長 30 天，撤銷、到期、來源替換或 owner 失去授權後，A 的存取也會停止。A 升級至 0.42.3 後可顯示舊版 C 清單中的冒號檔名。若要開啟分享根目錄下以單一英文字母加冒號起頭的資料夾，例如 `a:2026`，C 使用 0.42.3 或相容更新版。

來源 URL 使用 C 實際的瀏覽器網址，例如 `http://192.168.1.20:8088/FileHub/?share=…#…`。確認 C 的 `FILEHUB_PUBLIC_ORIGIN` 與該網址的協定、主機及埠相符，內網 HTTP 依[登入來源設定](identity.md#同源設定與-http-契約)明確啟用。

## 在 A 設定來源

以 [remote-sources.example.json](../../remote-sources.example.json) 為格式範例。0.42.4 請將設定存為 UTF-8（無 BOM）。檔案開頭含 BOM 時，A 的 API 會回報設定無效並停止啟動。將設定放在主機私有目錄，且放在任何已註冊檔案入口之外，避免經一般檔案瀏覽或分享讀取。Linux 範例如下。

```shell
sudo install -d -m 700 -o 1000 -g 1000 /srv/filehub-config
sudo install -m 600 -o 1000 -g 1000 remote-sources.example.json /srv/filehub-config/remote-sources.json
sudoedit /srv/filehub-config/remote-sources.json
```

每個來源設定如下。

| 欄位 | 用途 |
| --- | --- |
| `id` | A 上固定且唯一的 UUID，避免與本機入口 ID 重複 |
| `label` | 工作空間顯示名稱，例如「C 的檔案」 |
| `url` | C 的完整資料夾分享連結，包含 fragment 中的授權秘密 |
| `address` | C 的固定 IP。hostname 來源也明確指定連線 IP，HTTPS 保留憑證與 hostname 驗證。URL 使用 IPv6 時，兩處可用同一位址的壓縮或展開寫法 |
| `allowHttp` | 在可信內網使用 HTTP 時明確設定 `true` |
| `users` | 可瀏覽的 A member 帳號名稱，小寫。A 的 admin 可使用所有已設定來源 |

範例中的 IP、分享 ID 與秘密須替換為 C 的實際資料。原生 A 的 `FILEHUB_REMOTE_SOURCES_FILE` 設為該 JSON 的絕對路徑。

Docker Compose 在 A 的 `.env` 設定主機路徑。

```dotenv
FILEHUB_REMOTE_SOURCES_PATH=/srv/filehub-config/remote-sources.json
```

使用選配覆寫檔啟動。

```shell
docker compose -f compose.yaml -f compose.remote.example.yaml config --quiet
docker compose -f compose.yaml -f compose.remote.example.yaml build migrate
docker compose -f compose.yaml -f compose.remote.example.yaml up -d --wait api worker
```

既有部署升級先依[部署流程](deployment.md)停寫與備份。設定檔需讓容器的 UID 1000 讀取，且在 Linux 保持 private 權限。後續啟停使用相同的 Compose 檔案組合。

## 使用與維護

B 登入 A，選取「C 的檔案」即可進入遠端來源。可展開資料夾、返回父層、排序、分頁與依名稱篩選目前資料夾。C 離線或授權失效時，重新整理可回查來源，亦可切回 A 的入口繼續操作。A 的登入與 C 的來源授權分別驗證。

修改來源、IP、連結或 `users` 後重啟 A 的 API。分享到期時在 C 重新建立授權連結，再更新 A 的私有設定。API 啟動只驗設定，C 的連線與授權在實際瀏覽時核對。

JSON 含分享秘密，權限與備份依私有設定管理。`remote-sources.json` 已加入 Git 與 Docker build 排除，僅格式範例納入原始碼。完整備份以 `/srv/filehub-config` 作為 deployment config 目錄保存，再依[完整還原](full-backup.md)核對還原後的來源 IP、授權及帳號。A 不保存 C 的原檔副本；A 的備份只涵蓋 A 與這份來源設定，C 的原檔及 DB 由 C 獨立備份。

目前遠端入口提供瀏覽清單，下載、預覽、寫入、垃圾桶、再次分享、遞迴搜尋及跨機同步另待擴充。限制及傳輸契約見[遠端瀏覽決策](../decisions/P11-remote-browsing.md)。
