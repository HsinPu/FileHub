# 發行與相容性驗收

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

目前程式版本 `0.40.16`／schema 13，適用單台 Linux／amd64、一個 API 與一個 worker、同一固定 image。最近已完成正式發行與 8088 交付的是 P10.4（本機 `../validation/P10.4.md`）的 `0.40.16`；Compose 5／5、release 4／4，原帳密與檔案保留。這份流程用合成資料及自有 Docker resources，不對外部署或 push。歷史來源研究不等於產品驗收；功能基線依 P6.4（本機 `../validation/P6.4.md`）及跨階段矩陣（本機 `../validation/P6-matrix.md`），P9 整體畫面基線依 P9.8（本機 `../validation/P9.8.md`），目前功能比對與發行前置缺口見[驗收準備稽核](../reviews/acceptance-readiness-2026-11-01.md)。

## 重建與驗收

使用 `.node-version`、根 `packageManager` 指定的工具鏈，從乾淨 checkout 執行：

```shell
pnpm install --frozen-lockfile
pnpm test:e2e:install
pnpm verify:core
pnpm test:compose:build
pnpm test:compose:run
pnpm test:release
pnpm test:nfs
```

Linux browser 需要系統套件時，使用 `node scripts/playwright.mjs install --with-deps chromium`。原生 build 另需 gcc／libc6-dev；乾淨 Linux 核心／Chromium 可使用 `docker/ci.Dockerfile`。上述順序先 build 完整產物，再測瀏覽器；不要在正在執行的 browser／HTTP fixture 中重建同一份 assets。`:run` 命令要求已有產物，缺 browser／Docker／image 會失敗。

上述是完整發行驗證入口；P10.1–P10.2 僅改品牌、樣式及窄版工具列，沒有更動儲存／執行器，NFS 故障沿用 P5.5／P6.4 已驗範圍，不將歷史結果當成本版重跑。涉及儲存／執行器時須重新安排對應故障驗證。

`pnpm test:release` 是獨立 Vitest project，不在一般 `check` 或 hosted Compose job 裡隱性執行；需要本版正式 image 及保留的 `filehub:0.29.0`、`filehub:0.39.1`。可用 `FILEHUB_PREVIOUS_IMAGE`／`FILEHUB_SCHEMA12_IMAGE` 分別指定兩版的固定 image ID／名稱，版本 label 仍須相符。不要傳入不明來源 image；缺少 fixture 直接失敗，不 skip。

若須重建舊 fixture，在獨立 checkout 取得 `90c4687`（P5.5）建成 `filehub:0.29.0`；schema 12 fixture 的已驗來源為 `6c7c0683064a0f3c1663e803db339a4d96e9d876`，依當時 lockfile／Dockerfile 建成 `filehub:0.39.1`。不得修改目前工作目錄或以舊 image 開已升級 DB。受支援的舊快照 provenance 仍由真實 migration hash 前綴驗證，不能只看 label。

release project 的四種情境：

1. 空 volume migration、無預設 session、初始化帳號、同 image API／worker 與實際下載。
2. 以保留的 0.29.0 image 啟動 schema 10，建立帳號／兩類入口／grant／待檢工作；停兩服務後由新工具完整備份，再升級至 schema 13，驗登入、授權、設定與分享；用升級前快照 preserve-schema 還原新 volume，搭配原 image 重新登入及讀檔。升級後原 state 保持 schema 13，沒有降版或覆寫。
3. 合成的未知 Python DB 被正式 migration 拒絕，API／worker 不啟動，原 DB SHA-256 不變。
4. 以 0.39.1 啟動 schema 12，保存 list／thumbnails 與筆數；停機備份後升級至 13，驗原 session／偏好／grant／原檔保留，mosaic 經服務重啟仍在。原快照 preserve-schema 還原至新目標並用原 image 登入／下載；舊 API 拒絕 mosaic，新 DB 維持 13。

單純重啟 API／worker 後直接等待兩服務 healthy，不再呼叫 `up`：後者會重新啟動已退出的 migration，運行中 lifecycle lock 應拒絕它。升級的 `up` 必須先停止兩服務。

receipt 放在 `test-results/release/`，只在實測、其他服務 ID／StartedAt 比對及自有資源清理完成後標 verified／cleaned。不要把失敗／部分 receipt 當發行成功；對外保存前只保留合成 metadata，不包含帳密、Cookie 或原 DB。

## 產物與安裝

`Dockerfile` 固定 Node base digest，pnpm frozen lockfile、精確直接依賴及已提交 migration；runtime 不包含 Vitest、TypeScript、Kit。這是可重跑的建置流程，沒有聲稱不同時間的 OS 套件建置可產生逐 bit 相同 image ID。驗收保存當次 image ID，部署也應使用該已驗 ID／registry digest，API、worker、migration 三者一致。

首次安裝見[部署操作](deployment.md)，帳號無預設密碼，由 [bootstrap](identity.md)建立第一個管理員；入口／grant 與外部掛載分別見[入口](entries.md)、[設定](settings.md)。尚未宣告 FileHub 自有授權，依根 README；本工作不新增 registry 發布、網路公開或授權條款。

## 資料相容範圍

| 資料／環境 | 處理方式 |
| --- | --- |
| 本版新空 DB | 正式 migration 建 schema 13 |
| 已知新版 schema 10 → 13 | 已用正式舊／新 image 演練；帳號、入口、grant、原檔與待檢工作保留 |
| 已知新版 schema 12 → 13 | 原 session、list／thumbnails 偏好與筆數保留；新增 mosaic 可持久並驗舊快照回復 |
| 已知 schema 10–13 完整快照 | 新目標 restore 預設升到本版；preserve-schema 供相符舊 image 回復，細節見[完整備份](full-backup.md) |
| 更早的新版 schema | migrator 接受本專案已知前綴；本次正式 image 整體演練基線為 schema 10／12，不擴大為每一舊發行版均測過 |
| 舊 Python FileHub／File Browser DB | 未定匯入轉換契約，不支援直接採用；未知 DB 明確拒絕 |
| Windows 開發 | 核心與瀏覽器功能可驗，檔案寫入／持久檔案工作／完整維護拒絕；不是正式部署目標 |
| 外部儲存 | 入口需可讀且 identity 相符，正式寫入另須 opt-in 及原子 primitive 能力；已驗 NFSv3 唯讀來源故障不代表任意 NAS 可寫 |

升級與回復必須停機及外部停寫，使用[完整快照流程](full-backup.md)。完整 verify 成功、還原演練、image 身分與實際登入／讀檔皆通過後，才算具備部署前的驗收依據；仍由部署者選擇主機與發行時機。
