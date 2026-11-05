# P5.3 ZIP 與產物

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

## 格式與上限

採標準 ZIP32 STORE（method 0，不壓縮、不加密），UTF-8 名稱、逐檔 CRC32、中央目錄與完整產物 SHA-256，依 [PKWARE APPNOTE 6.3.10](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT) 基本格式，沒有新第三方依賴。保留相對資料夾／空檔／空目錄，時間為 UTC 轉 DOS 兩秒精度並限制在 1980–2107。輸出固定安全權限，不保留主機 owner。

沿用每工作 16 根來源、1000 節點／16 層／2 GiB、單檔 1 GiB。ZIP 上限為 2 GiB＋8 MiB，中央目錄輸入最多 4 MiB；每個 worker executor 一個工作，逐檔 helper 的 JS heap 64 MiB、64 KiB 讀寫。沒有全檔記憶體 buffer、ZIP64 或壓縮 CPU 工作。名稱經 NFC／大小寫折疊後碰撞會拒絕，實際 ZIP 保留原 Unicode。

封存採整份成功或整份失敗，conflict 只接受 stop。每項重新驗下載權限／來源 witness／hash，完整寫完後再重驗所有來源。換檔、撤權、取消或中途失敗都不提供部分產物；先前有效來源的 item 亦表示這份封存未完成。

## 持久與發布

schema 10 新增 operation_artifacts，短交易預留精確預估容量，未知／未清理 bytes 仍計入全域 8 GiB 管理配額；bytes 不進 SQLite。產物在受 EntryService 註冊排除保護的本機 state 目錄，固定 `archive-<operation UUID>.zip`、O_EXCL／O_NOFOLLOW／0600；兩服務共用同一 state volume。預留 `/data/cache` 仍未使用。

這是管理配額，並非 filesystem 硬配額；部署須為產物、DB／WAL、其他 state 及備份預留空間。現有 DB-only 備份不包含 ZIP bytes，完整回復依 P6.3。

副作用 child 均繼承 operation OFD guard。建立、追加、中央目錄與 fsync 後記錄 witness；來源與目前命名檔案重驗成功，才在同一短交易提交 available、全部 item succeeded 及 operation succeeded。GET 不建置／修復。期限固定為容量預留時起 24 小時，下載不續期。

## 授權與生命週期

`GET／HEAD /api/operations/<UUID>/artifact` 只給啟用中的原 owner，且所有來源目前仍有下載 grant；正向 scope 授權覆蓋其子樹。來源稍後不存在不會自行撤銷已建立的快照，但撤 grant／停用入口或帳號會阻擋。只有成功、未到期、witness／nlink=1 相符的產物可用。GET 回應前驗完整 SHA-256，HEAD 驗授權與 witness；stream 每 64 KiB 檢查取消／到期，授權至少每 250ms 重驗，不能搶占核心 I/O。

下載作 application/zip 附件、nosniff／no-store，支援單一 Range、SHA-256 ETag 與匹配的 If-Range；與一般讀取共用四份 admission。TCP 中止／app close 等待 reader／FileHandle 關閉。

running 先為 cancelling，helper 停止並清理已知產物才 cancelled。已完成工作取消不撤銷成功，產物依原期限清理。worker 沿用維護間隔，每批四份並輪轉；`pnpm admin archive-maintain` 使用同一入口，只處理 archive，不重做 ZIP 或不相關 copy／move。

清理先 proveOwner，核對 owner／job、regular file／nlink=1／精確 witness，才由持有 proof 的 native unlinkat／parent fsync 刪除。在途 helper、缺 guard、換 inode／內容或未知 witness 均保留 bytes／配額。已證明停止且 witness 完整的未發布產物可清理為 failed／cancelled，不自動發布未提交 ZIP。exit 2 表示本批未解決，exit 0 不代表全域清空。

驗證見 P5.3（本機 `../validation/P5.3.md`），操作見[背景工作](../operations/background-operations.md)。舊 archives.py 僅作需求／到期行為參考，沒有沿用 unlink-missing-ok 或程序內鎖。
