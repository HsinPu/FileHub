# Docker Desktop 本機試用

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

此工作站的 Docker Desktop／WSL2 試用目前為 FileHub `0.40.18`／schema 13；2026-11-05 已依 P10.7（本機 `../validation/P10.7.md`）保留資料完成升級，H 圖像與主內容／側欄／工具區白色畫布已套用。最初於 2026-10-29 建立 0.33.0 試用，歷史啟動紀錄保留於下方。正式主機及 NAS 部署另依[部署流程](deployment.md)驗收。

## 連線與登入

- 網址：<http://127.0.0.1:8088/>，僅綁定本機 loopback。
- 狀態頁：<http://127.0.0.1:8088/?view=status>。
- 管理員已初始化，初始登入資訊於啟動時提供；帳密不寫入本文件、Git、`.env` 或腳本。登入後可從「設定」修改自己的密碼；主機管理者重設方式見[帳號操作](identity.md)。
- 「我的檔案」是可寫的內建入口，已提供 `FileHub-開始使用.txt`，可用來試用文字預覽、下載、改名或垃圾桶。

## 啟動與停止

在此儲存庫根目錄操作。先查看現況：

```shell
docker compose ps -a
```

停止兩個常駐服務並保留資料：

```shell
docker compose stop api worker
```

兩服務停止後，重新啟動並等待健康：

```shell
docker compose up -d --no-build --wait --wait-timeout 45 api worker
docker compose ps -a
```

預期 API／worker 均 healthy，migration 為 Exited (0)。瀏覽器開啟上述網址；`/health/ready` 應回 `200 {"status":"ready"}`。Docker Desktop 的 Compose project 名稱為 `filehub`，兩服務使用 `unless-stopped` 重啟政策。

## 設定與資料位置

本機 `.env` 已被 Git 忽略，設定 `FILEHUB_STATE_DIR=/data/state`、`FILEHUB_HTTP_PORT=8088`、`FILEHUB_BIND_ADDRESS=127.0.0.1` 及 `FILEHUB_PUBLIC_ORIGIN=http://127.0.0.1:8088`。現行 Compose 範本也預設使用 8088。

`FILEHUB_IMAGE` 固定為已驗收 image ID `sha256:db75910c7052b1b57ac6b105673194c800a70c855b9492e15ddb302cbe9595cc`；本機試用直接啟動既有 image，使用 `--no-build`。升級及更換 image 前依[完整備份流程](full-backup.md)停機、備份及驗還原。

| Docker volume | 容器位置 | 用途 |
| --- | --- | --- |
| `filehub_state` | `/data/state` | SQLite、工作與必要私有狀態 |
| `filehub_files` | `/data/files` | 「我的檔案」的原檔與私有操作內容 |
| `filehub_cache` | `/data/cache` | Compose 預留 cache，本版圖片 cache 使用記憶體 |

這三個 volumes 是使用者試用資料，須保留。這次只註冊內建儲存；外部主機資料夾及 NAS 需另行配置掛載與入口。

## P10.7 第一行對齊與全頁複核

2026-11-05 更新為 0.40.18；兩平台全頁三視窗檢查、短／長檔名及三選取狀態完成，原 8088 登入分頁亦已操作選取並量測對齊；其截圖 API 不可用，三尺寸目視證據為隔離 React 畫面。正式 Compose 5／5、23 個 HTTP 產物、完整備份／verify／新 volume 還原及 FileService 實讀相符；原帳密、偏好、入口、原檔、三個 volumes 與其他五服務保留。Linux 原批的一次背景搬移等待超時及未改 timeout 的 3／3 補驗分開保存，見 P10.7（本機 `../validation/P10.7.md`）。

## P10.5 勾選欄對齊修正

2026-11-04 更新為 0.40.17；Windows 21／21、Linux 9／9、正式 Compose 5／5，23 個正式網頁檔案與 host／8088 HTTP 摘要一致。停 FileHub 雙服務後完整備份、verify 及新 volume 還原，正式 FileService 實讀 1 檔／580 bytes；原帳密／偏好／入口／原檔、三個 volumes 及其他五服務保持一致。原 IAB 本次連線回 browser.user is unavailable，請重新整理原分頁；沒有讀取密碼或宣稱原 session 已實際操作驗證。完整證據（本機 `../validation/P10.5.md`）。

## P10 白色畫布與保留資料交付

- 2026-11-04 正式 0.40.16：Compose 5／5、release 4／4，23 個 web 產物 SHA 與主機一致。原帳密、入口／grant／偏好及 1 原檔／580 bytes 保留，schema 13。
- 停兩服務後完整 backup／verify，再於新 volume 演練 restore，核對資料摘要及正式 FileService 實讀；完成後才修改 .env 固定 image 並重建三角色。API／worker healthy、loopback 8088。
- 原分頁沿用登入並重新載入，H PNG、主內容／側欄／工具區白底、三檢視、原檔文字預覽／焦點、設定及工作面板已驗；原三 volumes、完整備份／還原副本及舊 images 保留，其他五服務 ID／StartedAt 不變。
- 完整 P10.4 驗證（本機 `../validation/P10.4.md`）與去識別 receipt 可核對；私有部署／備份位置留在忽略的 .tools/P10.4/private/plan.json。

## P9 視覺調整與保留資料交付

- 0.40.14 正式 image 的 Compose 5／5、發行 4／4、22 個 web 產物 SHA 與主機相同；驗證（本機 `../validation/P9.9.md`）保存原始紀錄。
- 原 0.40.6 停雙服務後完整備份，在全新目標還原並核對帳密／grant／偏好／原檔摘要與 FileService 實讀，再更新原服務。原 1 個帳號、1 個入口、1 個原檔／580 bytes 保留。
- 8088 原 session 已實際驗三檢視、文字預覽／Escape、設定往返及非模態工作面板；沒有儲存偏好或修改原檔。還原副本未用真實密碼做 HTTP 登入，合成發行登入另有驗證。
- 原三 volumes、完整備份／還原副本及舊 images 保留；其他 6 服務身分／啟動時間相同。私有位置記於忽略的 .tools/P9.9/private/plan.json；Git 只存去識別 receipt（本機 `../validation/P9.9/handoff.json`）。

## P8 畫面還原與保留資料交付

- 0.40.6 正式 image 的 Compose 5／5、發行 4／4；含 schema 10／12 升級、list／thumbnails 偏好及原 session 保留、mosaic 持久與原快照回復。原始結果見 P8.10（本機 `../validation/P8.10.md`）。
- 停兩服務後以原 0.39.1 完整備份 state、全部既有入口原檔與部署設定；新 image verify，在新 volume 還原並核對身份／grant／偏好、檔案 SHA 及正式 FileService 的授權讀取 bytes，再更新原服務。還原副本未用真實密碼做 HTTP 登入；8088 原使用者 session 實際操作及隔離合成身份發行案例另有驗證。
- 三角色使用同一固定 image、migration exit 0、API／worker healthy，原 1 個帳號、1 個入口、1 個原檔／580 bytes 保留。既有分頁顯示 v0.40.6，已驗三檢視、文字預覽／Escape、設定及工作面板，最後回到檔案頁。
- 原三 volumes、完整備份與還原副本及舊 image 保留；其他五服務的 ID／StartedAt 未變。只移除隔離還原服務及其自有輔助 volumes。私有設定／備份位置記於忽略的 .tools/P8.10/private/plan.json，不提交或分享；Git 僅存去識別 receipt（本機 `../validation/P8.10/handoff.json`）。

## P7 歷史升級與交付

- 本版正式 image 的 Compose 5／5、發行 3／3 通過；包含新安裝、0.29.0 schema 10→12／原 image 隔離回復及未知 DB 拒絕，見 P7.10（本機 `../validation/P7.10.md`）。
- 原兩服務正常停機後，以原 0.33.0 image 完整備份 state、原檔與部署設定；新 image verify，再還原到獨立新 volume，重新登入及下載核對後才升級原服務。
- API／worker healthy、migration exit 0，三角色同 image；原 1 個帳號、1 個入口、1 個 580-byte 檔案及授權／偏好保留。新版 API 原密碼登入及原檔 SHA 相符，使用者既有分頁仍登入。
- 內建瀏覽器已實際顯示 v0.39.1，驗文字預覽／Escape、工作抽屜、個人設定與返回檔案，分頁保留可繼續操作。使用說明仍保留建立時的舊版／8080 文字，現行網址以本文件為準。
- 原三個 volumes、完整備份與還原副本及舊 0.29.0／0.33.0 images 均保留；其他五服務的 ID／StartedAt 不變。僅移除本次隔離還原服務及其輔助 volumes。

本機忽略的 `.tools/p710-private/plan.json` 記錄本次備份與還原 volume 名稱；部署設定副本及私有核對資料也保存在該目錄。不要提交或分享此目錄。Git 僅保存去識別交付 receipt（本機 `../validation/P7.10/handoff.json`）；同主機備份仍須另行安排受保護的離線保存。

## 首次 0.33.0 啟動驗證

- API／worker healthy，兩服務及 migration 使用同一 image ID，身份為 `1000:1000`；rootfs 唯讀、API 僅發布 `127.0.0.1:8088`，共用上述持久 volumes。
- 首頁、live／ready 均 HTTP 200，實際帳密登入成功，入口回報可寫。
- 首次於 8080 透過正式 upload session 上傳 580 bytes 的使用說明，finalize 完成；下載 bytes 及 SHA-256 相符，匿名下載回 401。
- 首次於 8080 的獨立 Chromium 實際登入後可見使用說明；等待載入完成後，上傳／新建資料夾按鈕可操作，文字預覽、Escape 關閉與登出通過。使用者內建瀏覽器的後續驗收依下一節。
- 啟動日誌未見錯誤，原有五個 Docker 服務的 ID、StartedAt 與狀態均相同。這是本機試用驗證，其他環境界線見跨階段矩陣（本機 `../validation/P6-matrix.md`）。

## 重用網址時的分頁驗收

本次 8080 的主機 HTTP 回應與 Docker 映射都已是 FileHub，但使用者的內建瀏覽器分頁仍顯示 llama-ui；直接重新載入後也重現舊介面及 API 404。確切的舊頁面保存來源未釐清，不將 Service Worker 當成已確認原因。

已先正常停止兩服務，再同步切換本機 HTTP port 與 PUBLIC_ORIGIN 至 8088，使用相同 image 及原 volumes 重新啟動。主機 `/health/ready` 回 200，8080 已釋放；原帳密登入回 200、原可寫入口及 580-byte 說明檔均保留，驗證 session 登出回 204。

原分頁在新網址的第一次登入曾逾時；另開乾淨的內建瀏覽器分頁後，已成功登入並顯示可寫入的「我的檔案」、原說明檔及上傳／新建資料夾控制。這個可操作分頁保留供使用者繼續操作；未清除舊站聊天或其他 browser storage。切換埠不增加程式版本，其他五個 Docker 服務未受影響。
