# P2.1 寫入契約與持久協調

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

版本 `0.13.0`／schema 4。P2 依序建立協調、新建／改名、垃圾桶及故障恢復；本份只提供可共用基礎，沒有新檔案寫入 HTTP endpoint。API／worker 可引用相同 WriteCoordinator，不建立通用背景工作佇列。

## 名稱、版本與衝突

新名稱採可攜子集：單一 UTF-8 segment、最多 255 bytes、無控制／路徑字元、無前後空白／結尾句點及 Windows 裝置名；`.filehub` 保留給應用程式。Unicode 與字面百分號不正規化、不二次解碼。既有檔案仍依 P1 讀取規則處理。

contracts 定義 parent／parentVersion／name、新舊 path／version 與 mutation 狀態。預期版本沿用 stat fingerprint，不能當作完整內容 hash 或目錄樹快照。P2.2 將在 I/O 前重查來源、目的地、權限及版本，任何同名都不靜默覆寫。

Linux 普通 rename 會替換既有目的地，P2.2 必須使用原子的 RENAME_NOREPLACE 並在不支援時拒絕；不能以 exists＋rename 或僅程序內 mutex 作替代。[Linux rename 語意](https://man7.org/linux/man-pages/man2/rename.2.html)。這是後續 adapter 的要求，本份尚未宣稱 primitive 已落地。

## Reservation 與意圖

`write_intents` 保存 id、發起帳號、種類、狀態、owner UUID、generation、來源／目的地範圍、私有 payload／evidence 及時間。公開 DTO 只有 id／kind／狀態／時間／固定錯誤 code，不回傳 owner、host path、payload 或 evidence。

BEGIN IMMEDIATE 內檢查活動範圍並插入；交易沒有 await／FS I/O。相同 entry 的相同路徑、祖先與子樹互斥，segment 邊界區分 a 與 ab；其他 entry 可獨立進行。呼叫端仍須執行 EntryService 的業務授權，reservation 不會授予檔案權限。

狀態：prepared → applying → succeeded／failed／needs_review；prepared 可在尚未公開副作用時 failed。僅 succeeded／failed 釋放 reservation。每次更新同時檢查 owner、generation、原狀態並增加 generation；錯 owner 必須在 SQL 前拒絕。needs_review 及中斷後的 prepared／applying 均持續阻擋相衝操作，沒有 lease 到期自動偷取或盲目重播。

每次最多 16 個範圍、payload／evidence 各 16 KiB、活動紀錄最多 128、全部紀錄最多 10000；超限直接拒絕，不建立無界等待佇列。保留意圖不是 FS rollback，SQLite transaction 無法與檔案 rename 原子提交。P2.4 必須證明舊執行已停止，再依實體 identity／來源目的地狀態判讀結果；本份不提供不安全的 force-unlock。

## 來源與驗證

依主計畫 FB4／FH3／FH5 讀取固定版本的衝突、改名、trash 與中斷處理。舊 FileHub 的 RLock 與 unsupported-flags 後 exists＋rename fallback 不符合目前雙程序要求，不沿用。產品仍使用 Node.js／TypeScript／Fastify，SQLite 位於本機。

新測試涵蓋名稱、範圍邊界、兩條正式 DB 連線、owner／generation fencing、needs_review 持久阻擋、範圍及記錄上限、schema 3 管理資料保留；另由兩個真正 Node 程序競爭同一 WAL，強制停止 owner 後仍不能重播。結果見 P2.1 驗證（本機 `../validation/P2.1.md`）。
