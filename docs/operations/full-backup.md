# 完整備份、還原與升級

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

適用 `0.40.16` 的 Linux。技術範圍與配額見[維護決策](../decisions/P6-maintenance.md)。所有範例使用絕對路徑及全新目標；先停止兩服務、其他 DB client、排程管理命令及入口的外部寫入者。NAS 不能停寫時，應先建立涵蓋所需檔案的一致儲存快照，將相符 DB／檔案集合離線處理；不能只傳旗標宣稱一致。

現行 P10.4（本機 `../validation/P10.4.md`） 已交付 0.40.16／schema 13；P8.10 的 0.40.6 保留歷史。目前工具接受已知 schema 10–13 快照，還原預設升至目前 schema，舊 image 回復需對原快照使用 --preserve-schema。0.39.1 不能讀 schema 13；已驗 0.29.0/schema 10 與 0.39.1/schema 12 各自的升級／隔離回復，見 P8.10（本機 `../validation/P8.10.md`）及[相容規則](../decisions/P8-views.md)。

## 原生 Linux

先 build，準備可讀的部署設定目錄（實際 env／Compose／必要金鑰的實體檔），再於停寫期間執行：

```shell
FILEHUB_STATE_DIR=/srv/filehub/state pnpm maintenance backup /srv/backups/filehub-before-upgrade /srv/filehub/deployment --quiesced
pnpm maintenance verify /srv/backups/filehub-before-upgrade
pnpm maintenance restore /srv/backups/filehub-before-upgrade /srv/filehub-recovered --quiesced
```

備份／還原目的目錄不得存在，但父目錄必須存在且可寫。receipt 不含設定內容或帳密。原生啟動將兩服務的 `FILEHUB_STATE_DIR` 都改成 `/srv/filehub-recovered/state`；入口已綁 `/srv/filehub-recovered/storage/<entryId>`，不能在還原後任意搬動頂層目錄。`config/` 是設定原文副本，先人工核對路徑、public origin、mount 與必要金鑰，再決定啟動環境；工具不自動執行它。

## Compose 完整備份

從儲存庫根目錄執行。若原部署含外部掛載 override，以下每個 Compose 命令都必須使用同一組 `-f compose.yaml -f compose.mounts.example.yaml` 與 env／project；backup 需要與 API 相同的所有入口掛載。[備份 override](../../compose.backup.example.yaml) 只供一次性 run 使用，缺少設定來源直接失敗。主機 `/srv/filehub/deployment` 須已存在，UID 1000 可讀，不使用自動 mkdir 或遞迴 chown。

```shell
docker compose stop api worker
docker compose ps -a
docker volume create filehub_backups
FILEHUB_DEPLOYMENT_CONFIG=/srv/filehub/deployment docker compose -f compose.yaml -f compose.backup.example.yaml run --rm --no-deps api apps/server/dist/maintenance.js backup /data/backups/before-upgrade /deployment --quiesced
docker run --rm --read-only --cap-drop ALL --security-opt no-new-privileges:true --user 1000:1000 --mount type=volume,source=filehub_backups,target=/snapshot,readonly filehub:0.40.16 apps/server/dist/maintenance.js verify /snapshot/before-upgrade
```

必須確認 API／worker 均停止、外部寫入已停止及所有入口都可讀。正式 image 預備 `/data/backups` 的 UID 1000 權限，首次空 named volume 由 Docker copy-up；既有 volume owner 錯誤需由主機管理者處理。完整快照含私有設定／metadata，應另行離線匯出、加密保存並保護存取；同主機 volume 不等於異地災難復原。

## 還原至全新 volume

保留原服務停止、原 volumes 與快照。以下只將備份唯讀掛入，`recovered` 子目錄必須不存在。`filehub:0.40.16` 可替換成已驗的同版固定 image ID／digest。

```shell
docker volume create filehub_recovery
docker run --rm --read-only --cap-drop ALL --security-opt no-new-privileges:true --user 1000:1000 --mount type=volume,source=filehub_backups,target=/snapshot,readonly --mount type=volume,source=filehub_recovery,target=/data/backups filehub:0.40.16 apps/server/dist/maintenance.js restore /snapshot/before-upgrade /data/backups/recovered --quiesced
```

建立獨立 `.env.restore`，至少包含：

```dotenv
FILEHUB_IMAGE=filehub:0.40.16
FILEHUB_RECOVERY_VOLUME=filehub_recovery
FILEHUB_STATE_DIR=/data/backups/recovered/state
FILEHUB_BIND_ADDRESS=127.0.0.1
FILEHUB_HTTP_PORT=8080
FILEHUB_PUBLIC_ORIGIN=http://127.0.0.1:8080
```

使用全新 project 與[還原 override](../../compose.restore.example.yaml)，三角色都保留還原時的 `/data/backups` 路徑。此時所有原入口都在 recovery volume 的副本，不需把舊外部原檔重新掛回。

```shell
docker compose -p filehub-recovered --env-file .env.restore -f compose.yaml -f compose.restore.example.yaml config --quiet
docker compose -p filehub-recovered --env-file .env.restore -f compose.yaml -f compose.restore.example.yaml up -d --wait --wait-timeout 45 api worker
docker compose -p filehub-recovered --env-file .env.restore -f compose.yaml -f compose.restore.example.yaml ps -a
curl --fail http://127.0.0.1:8080/health/ready
```

重新登入後核對帳號、grant、內建／外部入口的檔案 bytes、垃圾桶與 ZIP；重新解鎖分享。未完成工作在工作面板檢查，不將 needs_review 手改成 queued；未知 reservation 保留待分析。上傳經維護驗 prefix 後才可重新選檔續傳，維護本身不發布。cache 從空狀態重建。

## 升級、回復與失敗

1. 保留已驗舊 image ID／版本。兩服務與外部寫入保持停止，完整 backup、verify，再於隔離目標演練 restore。舊版 CLI 不會 lifecycle flock，仍由操作者確認停機。
2. 使用同一個新固定 image 執行 migration，成功後才啟動 API／worker；確認同 image、同 state/mount、healthy 與實際登入／下載。不要只以 live 或 gate 成功推定外部檔案可用。
3. 升級失敗先保持兩服務停止，保留原 DB／WAL／SHM、原檔及日誌。不得刪 WAL、重寫 migration history 或混用舊 worker。
4. 回復使用升級前的完整快照，向另一個全新目錄還原時加 `--preserve-schema`，再用相符的原 image 啟動。這是舊快照回復，不是將新版 DB 降版；原 state 不覆寫。

backup／restore 非零退出或出現 `INCOMPLETE`／state pending marker 時，保留現場，修正來源／空間／停機條件後改用另一個全新目標重做。不要刪 pending marker 強行啟動。忙碌／缺失 guard 必須先證明舊程序與 helper 結束，沒有 force-unlock。symlink、hardlink、特殊檔案、跨 `st_dev` 或超限來源整份拒絕，需先另定保存方式，不能當作已備份。
