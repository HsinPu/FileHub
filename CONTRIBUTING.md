# FileHub 開發流程

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

FileHub 新版已選定 Node.js、TypeScript、Fastify，以及 Vitest 與 Playwright。管理資料庫採 SQLite（WAL）；第一版正式部署為單台 Linux 主機，以 Docker Compose 啟動同一 image 的 `api`、`worker` 兩個服務，各一個實例。開發採小份、可驗證的功能切片：先固定行為與錯誤契約，再實作、驗證並提交。

P0–P8 共 53 份工作已完成；P9 完成 9／9，目前程式版本 `0.40.18`／schema 13。進度依[主計畫](IMPLEMENTATION_PLAN.md)，已交付功能依 P9.8（本機 `docs/validation/P9.8.md`）／P9.9（本機 `docs/validation/P9.9.md`），P10.1–P10.2 為 H 品牌與白色畫布；最近正式映像與 8088 已為 0.40.18，見 P10.7（本機 `docs/validation/P10.7.md`）。環境界線依跨階段矩陣（本機 `docs/validation/P6-matrix.md`）。Linux 寫入；Windows 開發唯讀。hosted CI 與未列明的實際掛載情境未驗。

P10.1 新增已核准的 H 圖像品牌及 320px 工具列修正，驗收見 P10.1（本機 `docs/validation/P10.1.md`）。本版未改後端／schema；最近正式 image 與 8088 已為 0.40.18，交付依 P10.7（本機 `docs/validation/P10.7.md`）；全畫面對齊稽核見 P10.6（本機 `docs/validation/P10.6.md`）。

P8.1–P8.10 全部完成。UI 規範依 DESIGN／[來源](docs/reviews/filebrowser-visual-reference.md)及[差異矩陣](docs/reviews/filebrowser-visual-acceptance.md)；完整回歸見 P8.9（本機 `docs/validation/P8.9.md`），正式映像／資料交付見 P8.10（本機 `docs/validation/P8.10.md`）。新增需求另列主計畫，再逐份驗證與本機 commit。

P9 已完成[設計研究](docs/reviews/p9-design-review.md)與[獨立預覽](docs/design/P9/README.md)，使用者已核准；P9.1–P9.9 已完成驗證與正式交付。新增需求先列入主計畫，再逐份實作，對照核准規格及同 fixture 的正式改前／改後畫面；原型不能代替 React／API／權限／controller 驗收。CSS 隨 owner 收斂，現行外觀依 DESIGN／P10.2／P10.3；P8 證據作歷史比較，不覆寫。

## 1. 開始前先確認範圍

原始碼發佈範圍依[發佈規則](docs/operations/source-publication.md)：保留測試程式及必要 fixture，截圖、log、報告等產物只留本機。CI 執行測試並保留工作日誌，但不另上傳測試附件。後續開發與發佈使用乾淨的 `main`；原完整開發歷史保留本機 `codex/development-history-2026-11-05`，不可推送或 merge 回主線。推送前核對遠端及新增可達歷史，只有使用者明確要求才 push。

閱讀 [AGENTS.md](AGENTS.md)、[MEMORY.md](MEMORY.md)、[README.md](README.md)、[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) 與 [ARCHITECTURE.md](ARCHITECTURE.md)。依主計畫選下一個未完成工作編號，閱讀其指定文件與原碼，再將狀態更新為進行中。涉及介面時另讀 [DESIGN.md](DESIGN.md)；產品行為與階段概覽參考 [改寫藍圖](docs/filebrowser-study/07-filehub-rewrite-blueprint.md)。

- 回答、文件與產品文案使用繁體中文（台灣用語）。
- 先檢查 Git 狀態、相關模組及既有測試，保留非本次任務的變更。
- 先說明本次功能的觸發、預期結果、錯誤與副作用邊界，避免把整個階段放進一個提交。
- File Browser 原始碼及 REA 證據是參考資料；不得因實作新 FileHub 而改寫歷史證據。
- P8 對照同視窗的 File Browser 原圖及 FileHub 改前／改後，記錄字型、幾何、圖示、選取、浮層與合理差異，不能只以功能／無溢位通過結案。實際取用 CSS／字型／圖示前保留各自來源與適用聲明；保留 React、controller ownership 與安全契約。
- 第三種檢視依 P8.3 更新 PreferencesSchema、SQLite CHECK 與新增 migration，驗舊 list／thumbnails 偏好保存；不是純外觀工作。P8.10 已使用 schema 12／0.39.1 fixture 驗偏好、session 與原檔保留及原 image 快照回復，歷史 migration 不回寫。

## 2. 預定的專案布局

以下為專案布局。三個 workspace、API／worker、persistence／CLI、lifecycle、Linux Compose、identity／entries／files 讀寫／trash／受控恢復，以及上傳／搜尋／預覽／背景工作／分享／設定與瀏覽器 fixture 均已建立。SQL／metadata 在 `apps/server/drizzle/`；完成範圍與驗收依主計畫及各份 validation。

```text
apps/
  web/                      React、TypeScript、Ant Design
  server/
    src/
      app.ts                建立 Fastify application 的 factory
      server.ts             載入設定與 listen 的啟動入口
      runtime.ts            listen、失敗清理與有界關閉
      migrate.ts            一次性 migration CLI
      persistence/          SQLite／Drizzle、schema／history、DB 備份還原
      worker.ts             worker 服務的背景工作啟動入口
      worker/               readiness loop、上傳維護與狀態
      lifecycle/            共用關閉／signal helpers
      modules/              帳號、授權、入口、檔案、上傳、工作等領域
packages/
  contracts/                對外 DTO 與執行期驗證 schema
tests/
  http/                     Vitest 真實 TCP 與編譯產物子程序測試
  e2e/                      Playwright 瀏覽器及真實 HTTP 流程
  system/                   平台、部署、掛載及重啟測試情境
docs/                       架構、決策、操作說明與研究資料
```

`app.ts` 建立應用程式並接受明確的設定與相依物件，不能在 import 時直接監聽埠、連上正式資料庫或啟動背景工作。`server.ts`、`worker.ts` 分別負責啟動與關閉，各自擁有 DB 並共用設定驗證與 `lifecycle/shutdown.ts`；兩者 main 都須 await，worker 在啟用時等待初始 heartbeat。同 image 的啟動已在 P0.5 驗證。

`packages/contracts` 只公開 API 型別及 schema，不包含資料庫 model、密碼雜湊、秘密設定、伺服器檔案 I/O 或後端權限實作。前後端共用型別不代表外部輸入已通過執行期驗證。

API 透過 `pnpm build`、`pnpm db:migrate`、`pnpm start:api` 啟動，設定見 [.env.example](.env.example) 與 [README](README.md#設定)。`parseDatabaseConfig` 可單獨供 migration 使用；`parseConfig` 另驗 API 設定。factory 不 listen、不開 DB、缺 probe 預設未就緒；正式 API main 擁有連線，關閉及啟動失敗時釋放。測試注入的 probe 由 fixture 保有資源。

修改 schema 後執行 `pnpm db:generate`，審查 SQL／snapshot／journal 及必要資料轉換；每份 migration 同步更新 schema revision。SQL 固定 LF，已套用檔案不能重寫。runtime 檢查已套用的 hash／時間戳／revision，migration 只接受空 DB 或已知前綴；目前 revision 13 含 identity／entries／grants／write／trash／uploads／operations／shares／preferences，升級須新增保留資料的 fixture。詳細規則見 [P0.3 決策](docs/decisions/P0-persistence.md)及 P1 各份決策。

SQLite（WAL）、兩服務部署及工具鏈已定案：Node.js `24.22.1` LTS、better-sqlite3 `13.0.3`、Drizzle ORM `0.45.4`、Drizzle Kit `0.31.11`、pnpm `12.16.0`。Windows 與 Linux image 各自 frozen install／build；完整版本見 [P0 工具鏈決策](docs/decisions/P0-tooling.md)，同 image／跨程序及平台邊界見 P0.5（本機 `docs/validation/P0.5.md`）。

`api`、`worker` 必須使用相同 SQLite runtime；Windows／Linux 正式 adapter 均已核對為 `3.53.4`，後續變更 driver／image 時重新核對 WAL-reset 修補與 runtime gate。詳細依據見[工具鏈定案](docs/toolchain-recommendation.md)。

### P0 工具鏈建立順序

1. P0.1 已固定 Node `24.22.1` 與 pnpm `12.16.0`，建立根 package.json 的精確 `packageManager`、`pnpm-workspace.yaml` 與單一 `pnpm-lock.yaml`。外部直接依賴精確鎖版，內部套件使用 workspace 依賴；本機已可執行 frozen install 與檢查，CI／Docker 在後續工作沿用。
2. Windows 開發與正式 Linux image 分別乾淨安裝；native module 在目標平台安裝／建置，不跨平台複製 `node_modules`。核對 peer／engine、必要 build scripts 與兩服務實際 SQLite 版本，再驗型別、build 及啟停。
3. 建立後端 Drizzle schema 與正式 better-sqlite3 adapter；Kit 作開發依賴，產生 SQL／metadata 後審查破壞性變更與資料轉換。通過空 DB、舊版 fixture 升級與還原測試，再提交 migration 檔案。
4. 正式 image 使用編譯後的一次性 migration 入口及 Drizzle runtime migrator，包含已提交的 SQL／metadata，不需要 Kit。初次啟動先 migration；升級先停止兩服務並備份，兩者均在 migration 成功後才啟動。禁止在正式環境用 schema `push` 或 app factory 自動產生／競爭執行 migration。

better-sqlite3 與其 Drizzle adapter 採同步交易，transaction callback 不使用 `async`／`await`；檔案 I/O 在交易之外。P0 量測 busy handling 與 API 延遲，記錄實測結果後才補入可執行指令。

## 3. 每個功能切片的工作順序

1. **定義行為。** 寫清楚 API／UI 輸入輸出、權限、衝突政策及可能部分完成的情況；識別需要的平台或儲存環境。
2. **建立驗證。** 新功能或 Bug 修復先補能證明行為的測試；修 Bug 時先確認案例會在舊行為失敗。文件或低風險純外觀調整採對應的文件／畫面檢查。
3. **實作小切片。** 保持 HTTP、領域規則、資料庫及檔案副作用的邊界；API 與 worker 共用授權規則，不複製一套較寬鬆的邏輯。
4. **執行相關檢查。** 先跑範圍相符的測試，再執行受影響 workspace 的型別檢查、lint 與 build；跨模組或正式發行時執行完整檢查集合。
5. **核對實際結果。** 有檔案副作用時檢查內容、來源／目的地與工作結果；有 UI 時啟動應用程式，檢視畫面、鍵盤及響應式行為。
6. **同步版本與文件。** 程式碼變更依既有 SemVer 規則更新版本來源；同步 README、架構、開發知識與適用的設計文件。
7. **檢查提交。** 執行 `git diff --check`，明確暫存本次檔案，閱讀 staged diff 並核對不含測試資料、秘密或其他任務的修改。
8. **提交檢查點。** 每個完成且驗證過的切片更新主計畫狀態與 `docs/validation/<工作編號>.md`，以包含工作編號的訊息建立 Git commit；提交後確認工作狀態，再依主計畫接續下一份。未經明確要求不 push。

相同的檢查通過後，只有新修改、失敗或未解問題才需重跑／擴大範圍。不要以多次執行相同測試代替處理不穩定原因。

## 4. 測試分層與證明範圍

| 層級 | 工具與執行方式 | 主要案例 | 不代表已驗證 |
| --- | --- | --- | --- |
| 單元 | Vitest，對純規則或小模組測試 | 路徑正規化、權限矩陣、名稱與衝突策略、狀態轉移 | 作業系統 I/O、真實 DB、HTTP 或瀏覽器 |
| 整合 | Vitest、Fastify `inject()`、隔離 DB／檔案目錄 | routes、plugins、schema、session、權限及檔案副作用 | TCP、代理、TLS、瀏覽器下載行為 |
| 端對端 | Playwright，對實際啟動的 HTTP server 與瀏覽器 | 登入、上傳、改名、下載、垃圾桶還原、錯誤回饋 | 所有平台、NFS 故障及長時間壓力 |
| 系統 | 由測試腳本協調隔離程序／Docker／指定掛載，必要時搭配 Playwright | 啟動與停止、重啟、migration、權限、跨磁碟、NFS／SMB | 沒有納入矩陣的 OS、儲存設備或部署方式 |

Fastify 的 `inject()` 是程序內的 HTTP 注入，可驗證框架處理流程；不會啟動真實 TCP listener。關閉測試 application 時需執行其 close lifecycle，釋放連線、計時器與檔案資源。[Fastify Testing](https://fastify.dev/docs/latest/Guides/Testing/)

Vitest 適用於單元與整合測試；測試檔和 fixtures 依模組責任放置，不為了共用測試 runner 把所有層級塞進同一份測試。[Vitest Guide](https://vitest.dev/guide/)

瀏覽器 fixture 每案仍有獨立 DB／API／暫存 FS；初始合成帳號、入口與 grant 直接由正式 IdentityService／EntryService 建立，DB 在 finally 關閉，保留真正 KDF／root identity／授權。CLI 的端到端邊界由 system 測試驗證，明確需要 CLI 的管理動作仍執行 CLI；避免每案為相同 seed 重開五次 CLI。不得用放寬 timeout、降低密碼參數或共享真實帳號解決 setup 成本。

## 5. 隔離測試資料與真實副作用

- 每個測試或有明確範圍的 fixture 建立專屬暫存根目錄、資料庫及帳號／session，避免跨測試共享可變資料。
- 整合測試使用正式選定的 SQLite driver／adapter 與 migrations，建立真實 file-backed WAL 資料庫。跨連線及 `api`／`worker` 協調案例不能用 `:memory:`、單一 mock connection 或另一種資料庫替代；mock repository 只能支持 mock 邊界內的結論。
- 內建儲存與外部入口都要有測試 fixture。外部修改案例直接在 fixture 內變更檔案，再確認 FileHub 能處理改名、消失或內容更新。
- 上傳與下載檢查 bytes、大小或雜湊；改名／搬移檢查來源及目的地；刪除／還原檢查實體檔案及 metadata 的結果。
- 權限測試除了 HTTP status，還要確認被拒絕的請求沒有產生檔案或資料庫副作用。
- 批次測試包含「前一項完成、下一項失敗」、取消、重試與程序重啟；逐項結果必須符合實際檔案狀態。
- 時間、亂數及網路相依可在適當邊界替換；不能用完全相同的內部 helper 同時產生預期值與受測值，而漏掉錯誤規則。
- 故障注入需限制範圍；檔案 I/O 逾時不代表核心中阻塞的 NFS 呼叫已終止，系統測試另檢查程序、資源及清理狀態。

清理時先解析並驗證絕對路徑，只刪除本次建立的 fixture 根目錄或明確 allowlist；檢查符號連結／junction，避免遞迴清理走出測試範圍。錯誤清理不得以廣泛刪除實際儲存入口或 Docker volumes 補救。

### SQLite 與兩服務協調驗證

P5.4 browser fixture 按需要啟動獨立正式 worker，停止 worker／API 並等待 DB 關閉後才清理。複製／搬移／ZIP 需驗實際內容與來源狀態；斷線只在網路回應邊界注入，不把 POST 重送當恢復。controller 單元驗 UUID-only storage、晚到結果、401 清空及 grant 正向聯集，介面三視窗驗 Modal 輸入／焦點、逐項部分成功與無水平溢位。Windows 的 disabled 路徑不作 Linux 寫入證據。

P5 catalog／executor 的 claim、取消、attempt／lease fencing 及 P2 reservation 共用規則依 [P5 決策](docs/decisions/P5-operations.md)。領取競爭以真實雙程序驗證；OFD helper 存活案例必須在 Linux 執行。Windows 的 DB 模型不能代替這項證據。關閉等待 executor，不在 lease 到期後自動重播寫入。

- 兩服務共用主機本機儲存的 state volume，資料庫、WAL 與 SHM 檔保存在同一目錄；不得把 SQLite 狀態放在 NAS／NFS／SMB。外部檔案入口可另行掛載，不能據此推論資料庫也可放在網路磁碟。
- 測試核對兩服務的 SQLite runtime 版本與 WAL 模式，以及重建容器後資料仍可讀；各入口在兩服務內使用穩定且一致的 ID、路徑、唯讀／可寫限制與必要權限。
- DB 交易只包含必要的 metadata／工作狀態變更；複製、壓縮或其他長時間檔案 I/O 不持有寫入交易。測試讀寫競爭、短交易、`SQLITE_BUSY` 的有界等待／重試及超限錯誤。
- 工作進度更新需節流並合併，避免每個 byte 或檔案事件都寫入 DB；測試失敗／取消／完成的最終狀態仍正確保存。
- 使用真實多連線／程序競爭測試原子 claim、lease 到期／更新與 fencing token，確認同一工作不被同時領取，失去 lease 的 worker 不能更新狀態或開始新的副作用。
- Fencing token 不能撤回已開始的檔案 I/O。測試 lease 遺失、程序中斷及殘留 I/O 的處理；SQLite transaction 不代表跨 DB／檔案系統的原子完成。
- Worker 重啟後先辨識未完成項及實際來源／目的地狀態，再按操作契約決定恢復；禁止將未完成工作直接整批重跑。搬移、覆寫與刪除需有避免重複副作用的案例。

### Compose 與備份驗證

發行另執行 `pnpm test:release`，需要當版正式 image 與保留的 `filehub:0.29.0`／`filehub:0.39.1`；舊版啟動、完整快照、schema 10／12→13、偏好與 session 保留、原 image 的隔離回復及未知 DB 拒絕均使用自有 fixture。receipt 只在清理及其他服務身分核對後標成功；操作見[發行流程](docs/operations/release.md)。

正式基線為 `api`、`worker` 兩個常駐服務，各一實例，使用同一 image 及相容設定；不增加 Redis 或獨立資料庫 server。一次性 migration 是啟動／升級步驟，不是第三個常駐服務。

1. 初次啟動先在隔離的本機 state volume 執行一次性 migration，成功才啟動 `api` 與 `worker`；升級測試先停止兩服務並建立備份，再執行 migration。測試 migration 失敗時兩者維持停止、不領取工作，並依回復契約處理。
2. 在 P0 先建立兩服務的啟動、readiness、停止、重啟、SQLite WAL 與 migration smoke。後續階段再加入實際檔案功能及環境故障情境，不提前宣稱功能測試已通過。
3. 檢查兩服務對入口的掛載、身分與存取權限一致；以受控的外部測試目錄驗證，不能掛入使用者實際資料作自動化清理測試。
4. 備份採適用的 SQLite backup API，或先停止兩服務並確認連線關閉後建立一致的資料副本；禁止單獨複製活躍 `.db` 當作完整備份。SQLite 一致快照不代表外部檔案已同時一致，須另依原始檔備份契約協調。
5. 在新隔離 volume 執行還原演練，核對 schema、帳號／授權、工作紀錄與適用檔案狀態，再確認兩服務可啟動；只成功產出備份檔不算還原驗證。

P0.5 的 DB-only 維護 CLI／Compose 證據覆蓋當時的管理 DB smoke；有入口、寫入／上傳／工作或 guard 狀態的正式資料使用完整快照，不能只還原 DB。入口與完整步驟見[部署操作](docs/operations/deployment.md)；DB-only 帳號／工作 metadata 不等於原檔完整復原。[P6.3](docs/decisions/P6-maintenance.md) 另驗完整快照、可攜 identity 重綁、未完成工作保留及正式雙服務啟動；操作見[完整備份](docs/operations/full-backup.md)。部署變更除 `pnpm check` 外，先 `pnpm test:compose:build`，再必跑 `pnpm test:compose:run`；完整入口為 `pnpm verify:p0`。缺少 Docker 或預建 image 直接失敗。

P5 的必要 NFS 故障環境另以 `pnpm test:nfs` 驗收，包含固定來源的 UNFS3、真正 kernel RPC 等待、guard 繼承、lease 過期／重新啟動不重播，以及獨立 1 MiB tmpfs ENOSPC。`test:nfs:run` 要求先 build 同版 image；缺環境不 skip。每輪 receipt 的 passed 只在驗證與 ownership 清理均成功後成立；不碰其他服務，失敗保留停止的自有現場。細節見 [P5.5 決策](docs/decisions/P5-fault-acceptance.md)。

## 6. Playwright 執行環境

Playwright 可啟動測試用 web server，亦可用 API request 準備狀態或驗證瀏覽器操作後的結果。[Web server](https://playwright.dev/docs/test-webserver)、[API testing](https://playwright.dev/docs/api-testing)

- 使用專屬 loopback port 或由 fixture 分配的可用埠；測試服務不得自動重用一般開發／正式服務。
- 在乾淨的環境啟動 server，注入測試 DB、儲存根目錄與秘密；等待適用的 readiness 後才開始操作。
- Browser context 及登入狀態按情境隔離。可共用唯讀的準備資料，不能讓平行測試修改相同帳號或檔案。
- 操作使用穩定的語意 locator、可觀察狀態及框架等待機制；避免用固定長時間 sleep 掩蓋競態。
- 關鍵流程包含真實 HTTP server 的啟動測試；發行驗收另對正式 build 產物執行 smoke／E2E，不能只測開發 server。
- 發行驗收涵蓋單台 Linux 的實際 `api`＋`worker` Compose 拓樸、共同本機 state volume、持久資料與指定外部掛載；Windows 本機通過不當作正式 Linux 部署通過。
- 上傳、下載與權限測試需核對後端結果；畫面顯示成功並非檔案內容正確的證明。
- 測試結束關閉 server、browser、DB 連線與 worker；Windows／Docker 的停止方式分別處理，不能假設 signal 行為相同。

Trace、截圖、影片與 console 附件可能包含帳號、路徑或內容；使用合成測試資料並設定保存範圍，不提交實際憑證、Cookie 或使用者檔案。

P0.6 實作使用 Playwright per-test fixture 自建 file-backed DB／migration 與編譯 API，透過測試 wrapper 回報 OS 動態位址，不重用一般服務。停止先等 app／DB 關閉與自然退出，再檢查 realpath 清理自有目錄；IPC 不進正式 API。`scripts/playwright.mjs` 在 registry 載入前設定 `.tools/playwright-browsers`，install／test 共用位置。先 `pnpm test:e2e:install`，web 變更另必跑 `pnpm test:e2e`；它與 Compose 均獨立於不需額外 runtime 的 `pnpm check`。

目前本機矩陣為 Windows／隔離 Debian 的 Chromium 156.0.8078.4、1440×1000／800×1024／390×844 視窗，非真實手機觸控或跨瀏覽器保證。成功截圖只用合成資料；trace／失敗截圖在忽略的 `test-results/e2e`，經檢視才另保存需要的圖。Linux 安裝 browser 與 OS libraries 使用 `node scripts/playwright.mjs install --with-deps chromium`；Windows 使用 `pnpm test:e2e:install`。

## 7. UI 與畫面驗證

`workspace-layout.spec.ts` 使用每測試隔離的 66 項資料，檢查首屏密度、選取位移、44px 手機勾選區及 1920px 寬度；目前數值已由 P8 更新，後續依主計畫 P9 切片更新明確規格。測試先等待實際列表控制與 Modal 焦點，不能以初始 isVisible=false 決定響應式分支，也不能在對話框尚未可操作前送 Escape。

帳號選單依 aria-expanded 開啟，避免收合動畫中的舊 menuitem 可見性誤導重試。Drawer 的焦點可能在外層容器，須驗 Tab 留在實際 focus trap、Escape 與關閉後的返回焦點；Modal 等開場與正式焦點完成後再測鍵盤。驗證期間凍結 source／tests，每批保存自己的 archive SHA，不覆寫正在使用的 archive。

私有導覽統一經 useLocation guard；設定的 section、側欄、返回與登出不得另寫一套草稿判斷。測試以真實 confirm／beforeunload 驗保留與離開、取消返回後的 forward／back，以及 Linux 跨設定分類上傳的實際建立／段數與下載 bytes。Windows 唯讀分支只驗能力，不當作寫入／續傳證據。

工作面板收合後，以公開 API 觀察背景檔案已發布，再驗短 Modal 草稿仍在、重新開啟面板讀到最新狀態；不要用隱藏 DOM 當背景完成證據。混合工作 fixture 須遵守既有 reservation：父子路徑互斥，不能假設同入口排隊 ZIP 與上傳發布可任意並行，更不能放寬後端規則讓 UI 測試過。

分享與垃圾桶管理頁測根 query 深連結／刷新／back、前後 DB／FS snapshot 及檔案上下文；公開分享仍用獨立訪客 context，斷言沒有身份 /api/session／Cookie。短 Modal 的容器高度需受 viewport 限制、body 可捲動且 footer 可達；手機主要操作至少 44px，下載／預覽降級及 afterClose 焦點仍以真實行為驗證。

收合的工作面板會保留 DOM；同一檔名可同時出現在檔案列表及面板。E2E 先限定具名 region 再定位文字，保留 strict，不以 first() 或刪除隱藏工作內容消除歧義。

涉及 UI 時，型別與 build 通過之外，還須實際啟動檢視頁面，依 [DESIGN.md](DESIGN.md) 檢查對齊、密度、溢位、loading／empty／error、選取、disabled 與焦點狀態。

- 至少涵蓋桌面、平板與手機的代表視窗；具體支援的瀏覽器與版本在 P0 建立矩陣。
- 表格、工具列、側欄、長檔名、Modal／Drawer 與上傳面板需有對應檢查。
- 使用 Tab、Enter、Escape 驗證適用流程與焦點回復；圖示與顏色不能是唯一操作提示。
- 視覺基準圖在固定瀏覽器版本、字體、視窗、語系及測試資料的環境產生；排除會變動的時間等內容時需說明範圍。
- 基準圖更新須逐項檢視 diff 並說明預期變更，不能為了讓測試變綠整批接受新圖。

## 8. Scripts 狀態與契約

已提供的 scripts 定義在[根 package.json](package.json)，使用已定案 Node／pnpm 執行；後續 scripts 到對應工作才建立，不以空測試回傳成功。

| Script | 狀態 | 契約 |
| --- | --- | --- |
| `typecheck` | P0.1 已提供 | contracts、server、web 的獨立 no-emit 檢查；包含測試與 Vitest 設定，不依賴已建置 dist |
| `lint` | P0.1 已提供 | ESLint strict 與 Node／workspace 匯入邊界；不能代替型別檢查 |
| `test:toolchain` | P0.1 已提供 | Fastify／TypeBox inject fixture、file-backed SQLite／Drizzle 的相容性測試；不代表正式 application 或雙程序已測 |
| `build` | P0.6 已擴充 | 先以 references 編譯 dist，再以 Vite 建 `apps/web/build`；正式 API／image 要求此完整產物 |
| `dev:web` | 已提供 | Vite loopback 5173，`/health`／`/api` proxy 到 API 3000；API public origin 明確設為瀏覽器 5173，不作正式部署 |
| `test:e2e:install` | P0.6 已提供 | 由 wrapper 在載入 registry 前設定本機 browser cache，安裝指定 Chromium |
| `check` | P0.7 已收斂 | metadata、typecheck、lint、一次完整 build，再跑 toolchain、unit、integration、HTTP／system，任一步失敗回非零 |
| `test:unit` | P0.6 已擴充 | server 設定／關閉／idle 與 web API client 的 schema／錯誤／期限／取消；領域案例隨功能加入 |
| `test:integration` | P0.7 已收斂 | 先 build，再跑 server integration（排除 toolchain）；驗 application／靜態路由／快取／404、DB ownership、adapter／migration／backup／restore |
| `test:http` | P0.3 已擴充 | 先 build，再跑 `tests/http/`；loopback TCP、正式產物／CLI、DB readiness、兩個 Node 程序的 WAL／busy 及 HTTP 延遲；不啟動瀏覽器 |
| `start:api` | P0.2 已提供 | 執行已編譯 API，透過 `--env-file-if-exists=.env` 載入可選設定檔；需先 build |
| `start:worker` | P0.4 已提供 | 執行已編譯 worker；共用可選 .env、DB／log／關閉設定，初始 DB 未就緒時非零退出，不解析 API host／port |
| `test:e2e` | P0.6 已提供 | 先 build，再以 per-test 的真實 DB／編譯 API／動態埠與 browser context 驗三視窗；需要已安裝 browser，不 skip |
| `test:system` | P0.7 已擴充 | 先 build，驗正式 API／worker 程序／CLI、入口無副作用及共用 fixture 清理防護；排除 compose project |
| `test:compose` | P0.7 已收斂 | 先 build，再用根版本對應的預建 image 驗 migration gate、健康、UID／掛載、SIGTERM／SIGSTOP、持久化與 DB 還原；需要 Docker，不 skip。最近正式 Compose 為 P10.7／0.40.18；發行 migration 矩陣 4／4 屬 P10.4／0.40.16，後續受影響驗證不稱為全套重跑 |
| `check:project` | P0.7 已提供 | 核對 Node／工具鏈、四個 private packages 同版、直接依賴精確版本及 image tag／label |
| `test:integration:run`／`test:e2e:run` | P0.7 已提供 | 執行已完整 build 產物的測試；總驗收避免重複 build |
| `test:compose:build`／`test:compose:run` | P0.7 已提供 | 前者以根版本 tag 建正式共用 image；後者只跑隔離 Compose cases |
| `verify:core` | P0.7 已提供 | `check` 加 Chromium，需先安裝 browser |
| `verify:p0` | P0.7 已提供 | `verify:core`、正式 image build、Compose tests；完整本機 P0 入口 |
| `db:generate` | P0.3 已提供 | 固定 Kit／server config 產生待審 SQL／metadata；不對正式 DB 執行 schema push |
| `db:migrate` | P0.3 已提供 | 執行編譯後的一次性入口與 ORM runtime migrator，成功／失敗均關閉連線；啟動／升級先檢查 exit code，P0.5 已接 Compose gate |

Vitest toolchain、unit、integration、http、system、compose、release projects 分開收集；Playwright 留獨立 E2E。`pnpm check` 不要求 Docker。原生 fixture 使用動態 loopback 埠、專屬 cwd／state、環境過濾與有界等待，只終止自己建立的程序，退出後才清理 realpath 核對過的目錄。Windows `process.emit` 只驗 Node callbacks；Linux Compose 另驗真實 SIGTERM 與 SIGSTOP 過期。Compose fixture 使用唯一 project／token，核對 ownership 後才清理自身容器／volumes，不 prune；前後比對既有服務 ID／StartedAt。CI 沿用相同 scripts。

`tests/helpers/temporary-directory.ts` 保存目錄 device／inode，拒絕 symlink／junction 及同路徑被替換的目錄；dispose 共用 Promise。`node-process.ts` 共用輸出／IPC 有界等待，`environment.ts` 清除繼承的 FILEHUB／Node／色彩設定；helper 本身不綁定 runner。DB／HTTP／system／Compose／Playwright 的建立者先關閉自己的資源，再清理；Playwright 與 system 共用測試 `service.mjs`。Compose 的既有服務比對排除具 `filehub.test-run` 標籤的其他隔離驗收容器，允許它們獨立退出。

`node:timers/promises` 的原生等待在本機不受 Vitest fake clock 推進；idle 單元測試以 onCheck 通知等待真實狀態，服務子程序需自然退出才能通過正常停止案例。不要用假時鐘的 timer count 代替原生計時器／程序清理證據。

## 9. CI 與階段完成條件

[CI workflow](.github/workflows/ci.yml) 設定 main push／PR／手動執行，Actions 固定 SHA、contents 唯讀、checkout 不保存 credentials。core matrix 為 Ubuntu 24.04／Windows Server 2022：由專案版本檔安裝工具、frozen install、明確安裝 gcc／libc headers 與 Chromium／Linux libraries，再跑 `verify:core`；成功後 Ubuntu job 建正式 image／跑 Compose。core 110 分鐘、Compose 20 分鐘；browser 失敗診斷僅保留合成資料 3 天。完整設定與官方依據見[決策](docs/decisions/P0-ci-and-fixtures.md)。

本次只 commit、不 push，尚未執行 GitHub hosted jobs；actionlint 靜態驗證與本機 Windows／Debian 等價命令通過，首次遠端 run 仍需核對。`docker/ci.Dockerfile` 是額外的乾淨 Linux 核心驗收入口，不掛 host source／Docker socket，也不在其中跑 Compose。重跑命令及實際平台／資源限制見 [P0 操作檢查表](docs/operations/p0-checklist.md)。

測試失敗需保留足以定位問題的非敏感報告。Retry 只作診斷輔助；重試後通過的 flaky 測試仍需追查，不以降低 assertion 或跳過核心案例處理。

| 提交類型 | 必要驗證 |
| --- | --- |
| 純文件 | 內容與狀態一致、相對連結、Markdown／圖表及 `git diff --check` |
| 領域／API | 對應單元與整合案例、權限／副作用、型別、lint、受影響 build |
| UI／跨前後端流程 | 前述適用檢查、Playwright、實際畫面與響應式檢視 |
| 儲存／上傳／工作／部署 | 正常與失敗路徑、適用的真實平台與重啟測試、相關 E2E |
| 正式發行 | 完整適用檢查、正式產物 smoke、版本／migrations／備份還原說明 |

Coverage 用來發現未測分支；不以單一百分比取代有意義的權限、競態、部分失敗與檔案內容驗證。未具備環境的項目須列為未驗證，不能以 mock 通過填補。

## 10. 版本、文件與提交

程式變更依 SemVer 處理：不相容變更新增 MAJOR，向下相容功能新增 MINOR，Bug／相容修正新增 PATCH。根 package.json 作版本來源，目前 `0.40.18`，三個 private workspace 同版；DB schema revision 獨立管理，目前為 13。發行時同步 Docker label、Compose／env 的預設 image tag；Compose fixture 從根版本讀取，`check:project` 核對一致性。純文件不增加版號。

每個切片完成後，同步使用者文件與實際有變更的架構／知識／設計文件，只記錄已驗證、可長期使用的結論。提交說明需涵蓋改變的行為、原因、驗證結果與尚未覆蓋的條件。

只暫存本次任務的檔案；原始 REA／建置證據遵守 `.gitattributes` 的 bytes 保存規則。依專案規範完成本機 Git commit，不自動 push。

Linux build 先編譯 `apps/server/native/filehub-fs.c`（C11／cc），產物不進 Git／Docker context，production deploy 只納入 executable。Node／TypeScript 管理業務邏輯；helper 處理 flock、繼承 directory fd 上的不覆寫 rename，以及 P3.4 對已知私有 payload 的精確 witness unlinkat；不加入 shell／遞迴刪除或覆寫 fallback。細節依 [P2.2](docs/decisions/P2-synchronous-writes.md)。

上傳工作先核對 [P3 協定](docs/decisions/P3-upload-protocol.md) 的大小、offset、manifest、期限及清理 ownership。資料庫測試用 file-backed WAL，重新開啟與配額跨連線驗證；Linux 寫入案例與 Windows 明確 unsupported 分開。receiver 完成不代表檔案已發布，畫面進度不能取代 bytes／hash／原檔不變性的證據。

P3.4 維護依[決策](docs/decisions/P3-upload-maintenance.md)，測試以真正被終止的子程序驗 owner／prefix；正式 image 的獨立 8 MiB tmpfs 驗 ENOSPC。不要為容量測試填滿主機的共享 `/dev/shm`，也不將注入錯誤當成真實磁碟結果。正式 image ENTRYPOINT 為 node，Node -e fixture 的參數不可再重複 node。

## 公開分享驗證

修改 shares 時執行 shares 整合／真實 TCP 測試與三視窗 `shares.spec.ts`。必須驗 password challenge 不洩漏名稱、Cookie 不能登入或跨分享重播、來源替換與 owner 撤權、Range／中斷清理；建立回應遺失只查同 UUID。公開頁不得呼叫 `/api/session`。截圖遮蔽完整分享連結，測試資料不進正式 state。

## 管理介面與資源排程

設定變更跑 settings 整合、settings-authorization 正式 worker 與三視窗 settings.spec.ts，改共用身份／主題時加分享回歸。保留真實登入／密碼 KDF；fixture 可直接 seed 合法合成 hash，避免無關 setup 搶時間。2 CPU 配額不代表 Node 只回報 2 核，因此 Vitest 固定最多 2 workers；不要以放大 timeout 掩蓋超額排程。P7.9 的完整 Chromium 為 168 cases（已包含三視窗），每份隔離 CLI／KDF provisioning 的既有實測約 15–25 秒，整批期限調為 75 分鐘；core job 110 分鐘包含安裝／check。單案例／expect／retry 維持 30 秒／8 秒／0，browser worker 仍一個；整批預算不能代替修正失敗案例。
