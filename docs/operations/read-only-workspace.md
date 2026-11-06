# FileHub 唯讀工作空間

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

本文件涵蓋「初始化管理員 → 註冊入口／授權 → 登入 → 瀏覽／單檔下載 → 伺服器登出」的基本流程，沒有預設帳密。Linux 已另提供依權限啟用的[寫入](writes.md)、[上傳](uploads.md)、[搜尋與預覽](search-and-preview.md)及[管理設定](settings.md)；Windows 開發仍為唯讀。以下 CLI 初始化方式繼續有效。

## 1. 準備服務與帳號

單台 Linux／Docker Compose 先依[部署操作](deployment.md)準備設定。本段限初次啟動；既有部署升級需先依該文件停兩服務與備份。原生 Windows 開發改依 [README](../../README.md#設定) build／migration／start。

```shell
docker compose build migrate
docker compose up -d --wait --wait-timeout 45 api worker
```

確認 migration exit 0、兩服務 healthy，再初始化帳號。使用外部掛載覆寫檔時，後續管理命令也須使用相同的 `-f` 組合。

在自己的互動終端執行，密碼會隱藏輸入，至少 15 字元：

```shell
docker compose exec api node apps/server/dist/cli.js bootstrap admin
docker compose exec api node apps/server/dist/cli.js user-create reader
```

bootstrap 僅能在空帳號庫執行。原生相同命令為 `pnpm admin bootstrap admin`、`pnpm admin user-create reader`。非互動自動化的 stdin 契約見[帳號操作](identity.md)，真實密碼不放命令參數或環境變數。

## 2. 註冊入口及授權

內建 files volume 已存在於容器 `/data/files`，可先註冊；空目錄會如實顯示空白，不產生範例檔案：

```shell
docker compose exec api node apps/server/dist/cli.js entry-add managed "我的檔案" /data/files
docker compose exec api node apps/server/dist/cli.js entry-list
```

`entry-add` 輸出 JSON，保存其中 `id`，後續以實際 UUID 取代範例 `ENTRY_ID`。管理員能讀所有啟用入口；member 須另授權。

```shell
docker compose exec api node apps/server/dist/cli.js entry-grant reader ENTRY_ID . download
```

`.` 為入口根；download 包含瀏覽及單檔下載。若只允許特定子目錄且不可下載，先確認入口內已有該目錄，改為下列授權，不同時新增根 grant：

```shell
docker compose exec api node apps/server/dist/cli.js entry-grant reader ENTRY_ID team browse
docker compose exec api node apps/server/dist/cli.js entry-revoke reader ENTRY_ID team
```

父子 grant 採聯集，子 grant 不會縮小已存在的根 grant。撤權對下一次請求生效，頁面重新整理會移除不再可見的入口／內容。完整規則見[入口操作](entries.md)。

### 外部既有資料夾

先在 Linux 主機掛載實際資料夾／NAS；檔案由 OS 管理，SQLite state 仍放本機。於自己的 `.env` 設定 `FILEHUB_EXTERNAL_SOURCE` 為既有 Linux 絕對路徑，依[外部掛載步驟](deployment.md#外部目錄)啟動兩服務同一路徑、預設唯讀的 mount：

```shell
docker compose -f compose.yaml -f compose.mounts.example.yaml up -d --wait api worker
docker compose -f compose.yaml -f compose.mounts.example.yaml exec api node apps/server/dist/cli.js entry-add external "共用資料" /mounts/example
```

註冊使用容器內 `/mounts/example`，CLI 不建立來源、不變更 owner、不搬檔。主機須讓 UID/GID 1000 有讀取／穿越權限。root 離線或 identity 改變時拒絕接管；恢復原掛載後重試，不能直接修改正式 DB 繞過檢查。

## 3. 使用網站

1. 本機 Compose 開啟 `http://127.0.0.1:8088/`，以剛建立的帳密登入。反向代理請先依[同源設定](identity.md#同源設定與-http-契約)設正確 HTTPS origin。
2. 桌面由側欄、平板／手機由「儲存入口」選單切換。目錄名稱按一下即可開啟，麵包屑限目前授權範圍。
3. 使用名稱／大小／修改時間排序及遞增／遞減；列表每頁 50。網址保存入口、相對路徑、排序與版本分頁，可重新整理或上一頁。版本過期請重新整理列表。
4. 點檔案列「下載」，或選取一個可下載檔再按「下載所選檔案」。瀏覽器處理儲存與完成狀態；多選不提供 ZIP。只有 browse 的帳號不能下載。
5. 檔案被其他程式變更時，按「重新整理」取得新內容；目前只有單層列表，不預掃整棵目錄樹。
6. 按「登出」後，伺服器撤銷此 session。若顯示未完成，修復連線後再按登出；帳號停用／改密碼也會撤銷舊 session。

公開服務狀態為 `/?view=status`。沒有帳號／入口管理網頁；由管理員使用 CLI。

## 4. 常見狀態

| 畫面／錯誤 | 處理方式 |
| --- | --- |
| 沒有可存取入口 | 管理員先註冊入口，再核對 member grant；修改後重新整理頁面 |
| 登入已到期 | 重新登入；停用帳號須由管理員確認狀態 |
| 沒有存取權限 | 核對 scope／download grant，不以網址或前端按鈕繞過 |
| 入口／服務無法使用 | 檢查服務及原始掛載是否恢復，再重試；不可任意換 root |
| 目錄／檔案已變更 | 回第一頁重新整理，避免混用不同版本的列表 |
| 此目錄項目過多 | 目前每層最多掃描 5000 項，可輸入有權限子目錄的相對路徑 |

已驗範圍、限制與復現命令見 P1.5（本機 `../validation/P1.5.md`）。已驗的限定 NFSv3 故障見 P5.5（本機 `../validation/P5.5.md`）；其他 NAS／NFSv4／SMB、瀏覽器及裸機仍未驗。DB-only 不能代替 [完整快照](full-backup.md)，最新範圍見 P6 矩陣（本機 `../validation/P6-matrix.md`）。
