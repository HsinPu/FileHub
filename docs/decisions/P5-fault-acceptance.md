# P5.5 故障驗收與部署邊界

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

P5 沿用單台 Linux、同 image 的 API／worker 及本機 SQLite WAL。工作 lease 是協調期限，不是核心 I/O 的存活證明；API 健康、取消請求被接受、worker 父程序已退出，都不能單獨證明 helper 已停止。原則依 [P5 工作決策](P5-operations.md)與 [ZIP 清理](P5-archives.md)。

## 必要環境

[`scripts/verify-nfs.mjs`](../../scripts/verify-nfs.mjs) 的 `pnpm test:nfs` 先建同版 `docker/ci.Dockerfile`，再建 [`docker/nfs-fixture.Dockerfile`](../../docker/nfs-fixture.Dockerfile) 並驗兩者 image ID；容器案例在 [`nfs-client.mjs`](../../tests/system/fixtures/nfs-client.mjs)。UNFS3 固定上游 commit `ec1660ba33c80d5c67131e163e68834c1a10e243`，建置時重新核對；fixture image 保存該份上游 source，不加入正式 FileHub image。Node／pnpm／SQLite／Chromium 仍使用專案固定版本。

腳本只建立帶本次 UUID label 的 internal network、export volume 與兩個容器，不 publish port 或掛載 host source／Docker socket。exporter 的 1 MiB 合成檔透過真正 NFSv3 TCP 提供；client 在自己的 mount namespace 掛 `ro,hard,nolock,actimeo=0,timeo=10,retrans=1`。掛載設定完成後降至 UID/GID 1000，斷言 CapEff 為零，再啟動 FileHub。SQLite／WAL 位於 client 本機 overlay，原檔位於 NFS；另有精確 1 MiB tmpfs，僅用於 ENOSPC。

`CAP_SYS_ADMIN` 是這個開發 fixture 建立掛載的需要；正式 Compose 維持 UID 1000、唯讀 rootfs、drop ALL 與既有 volume 規則，不取得這項能力。缺少 Docker、image、NFS kernel 或掛載能力時命令直接失敗，不 skip，也不當作 PASS。

## 故障判讀

在真實 archive handler 已開來源 FD、即將交給 child 時停住 checkpoint。host 只暫停剛建立且 token／掛載吻合的 exporter，接著讓 child 執行。檢查該 owner 的實際子程序、FD 3 guard、FD 4 NFS source，以及 Linux thread 的 RPC 等待位置，不能用 sleep 或單一 mock 代替阻塞證據。

第一種情境透過真實 HTTP 取消，檢查 cancelling、持久 reservation、維護 busy 與 API readiness。第二種終止該 worker 父程序，保留仍在 RPC 等待的 helper；以單調時鐘限制等待、觀察持久 lease 自然到期且不再延長後，驗 proveOwner 仍 busy。以新 OS PID 啟動正式 worker 後 owner／attempt 仍不變，不重新封存或發布。API／worker 使用正式模組，checkpoint 與檢查 DB 的額外連線只屬測試 fixture。

恢復 exporter 後，必須取得新 OFD proof 才能清理。若先出現 needs_review，保留原紀錄與管理容量；下一次維護只在私有 payload 的精確 witness 相符時 unlink／fsync，完成後才 cancelled／釋放容量。來源重新讀取核 SHA-256，artifact 不可下載；不採用 TTL、PID 消失或 lease 到期作 force-unlock。

ENOSPC 沿用 `transfer-enospc.mjs`，把 2 MiB 真實來源複製到獨立 1 MiB tmpfs，檢查 STORAGE_FULL、來源 bytes、目的地缺失與私有 staging 清空，避免填滿主機磁碟。其他真實雙程序、發布前後終止、外部改檔、撤權、部分完成及 ext4／tmpfs 跨 device 搬移由核心整合／system suite 驗證。

## 重現與限制

```sh
pnpm check
pnpm test:nfs
pnpm test:compose:build
pnpm test:compose:run
```

已建好同版 image 時可分開 `pnpm test:nfs:build`／`pnpm test:nfs:run`。每輪在 `.tools/nfs-<UUID>.json` 保存平台、image ID、測量與 cleanup 結果；只有案例、其他服務身分／啟動時間與清理全通過才 passed。失敗先恢復自己暫停的 exporter，再停止自己的容器，保留現場與 receipt；不 prune、不接管未知 label 或刪正式 state。

這是 Docker Desktop WSL2 的 NFSv3 唯讀來源／exporter 暫停與恢復，不代表 NFSv4、SMB、硬體 NAS、服務重開後 stale handle、實體斷電、真實手機或 hosted CI 已驗。跨 device 的 ext4／tmpfs 是不同 filesystem device，並非兩顆實體硬碟。NFS 寫入仍須符合正式 NOREPLACE 能力門檻；本份不宣稱 NAS 任意掛載均可寫。實際結果見 P5.5 驗證（本機 `../validation/P5.5.md`）。
