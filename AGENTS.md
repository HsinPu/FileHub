# FileHub 開發與研究規範

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

## 目前階段

P0–P9 共 62 份工作已完成；目前程式版本 `0.40.18`／schema 13，P10.1 為 H 品牌、P10.2 為白色畫布，進度與驗證依[主計畫](IMPLEMENTATION_PLAN.md)。P9 整體回歸與 134 張原圖見 P9.8（本機 `docs/validation/P9.8.md`），正式 image／完整備份還原／8088 已於 2026-11-04 交付 0.40.16，見 P10.4（本機 `docs/validation/P10.4.md`）；其後 P10.5 修正勾選欄並交付 0.40.17，P10.6 完成全畫面對齊稽核後，P0–P10 共 68 份完成；P10.7 第一行修正與全頁複核後共 69 份，交付見下節。Linux 寫入、Windows 開發唯讀；未驗環境依跨階段矩陣（本機 `docs/validation/P6-matrix.md`）。每份驗證後本機 commit，不 push。

2026-11-01 使用者要求準備驗收並比對原始計畫，對照與操作清單見[驗收準備稽核](docs/reviews/acceptance-readiness-2026-11-01.md)。原始 33 項及後續定案契約分開核對；程式存在、歷史證據完整、目前測試通過及實際 8088 交付是不同判定，不能合併成「全部完成」。

2026-11-04 的[正式驗收狀態與待辦](docs/reviews/acceptance-status-2026-11-04.md)為目前簽收入口，列明 F01–F10 能力邊界、E01–E07 未驗環境及 U01–U13 人工項目。工程結案與 8088 交付不代替使用者簽收；正式 Linux／NAS、資料容量及備份安排依實際用途補驗。新增需求或缺陷仍回主計畫，不另維護第二套工程進度。

2026-10-30 依使用者要求，以 File Browser 實際畫面完成 P8.1–P8.10。[65 張來源](docs/reviews/filebrowser-visual-reference.md)、[整體差異矩陣](docs/reviews/filebrowser-visual-acceptance.md)及P8.9 兩平台完整測試／108 張原圖（本機 `docs/validation/P8.9.md`）保存證據。P8.10（本機 `docs/validation/P8.10.md`）已完成正式 image、schema 12→13／舊快照回復及 8088 保留資料交付；新需求另列計畫。

2026-10-29 已建立使用者操作的 Docker Desktop 本機試用，Compose project `filehub`、loopback 8088、固定已驗 image。原 8080 分頁重新載入仍顯示舊 llama-ui，現使用獨立 8088 Origin 並已在內建瀏覽器登入驗證；僅伺服器回應正常不能代替使用者分頁驗收。`filehub_state`／`filehub_files`／`filehub_cache` 是持久試用資料，須保留；啟停與本次驗證見[本機試用](docs/operations/local-preview.md)，不保存帳密或把這組 volumes 當自動測試資源清理。

已確認新版採 Node.js＋TypeScript＋Fastify，測試採 Vitest＋Playwright；目標支援內建儲存及外部既有資料夾／NAS／NFS。資料庫採 SQLite（WAL），正式部署為單台 Linux 主機，以 Docker Compose 將同一固定 image 分成 `api`、`worker` 兩個常駐服務，第一版各一個實例。Node.js `24.22.1` LTS、better-sqlite3 `13.0.3`、Drizzle ORM `0.45.4`／Kit `0.31.11`、pnpm `12.16.0` 不變；其餘依賴見 `docs/decisions/P0-tooling.md`。P0.5 固定 Debian Bookworm／linux/amd64 image digest，已在 Docker Desktop WSL2／ext4 驗證；限定 NFSv3 唯讀來源故障已另驗；裸機及其他實際掛載條件依跨階段矩陣保留界線。

## 工作範圍

- 原始碼發佈依 [source-publication](docs/operations/source-publication.md)：保留三處測試原始碼與必要 fixture，排除本機工具、秘密、資料庫、建置產物、階段驗證報告及原始擷取；停止追蹤不刪本機 bytes。第三方授權與產品／設計原始資產保留。
- 2026-11-05 發佈整理以 `codex/publish-clean` 為乾淨歷史分支；原本含產物的完整開發歷史保留本機 `main`，不可直接 push 或 merge 回發佈分支。推送前先成功刷新遠端並檢查新增可達歷史，不自動 push。
- 回答、文件與產品文案使用繁體中文（台灣用語）。
- 每次任務先閱讀本檔、`MEMORY.md`、`README.md`；實作前另讀 `IMPLEMENTATION_PLAN.md`、`ARCHITECTURE.md` 與 `CONTRIBUTING.md`，涉及介面時另讀 `DESIGN.md`。
- 參考來源為 `C:\Users\win10\Desktop\Github\filebrowser`；分析時保持來源不變，驗證使用指定 commit 的隔離副本。
- 根目錄 `IMPLEMENTATION_PLAN.md` 是後續實作的主計畫與進度依據，列出 P0–P10 的工作編號、修改位置、參考原碼及驗收。依使用者已授權階段與下一個未完成工作接續；每份更新狀態與 `docs/validation/<工作編號>.md`，以工作編號 commit，不自行跳過前置驗證。
- 架構與流程以 `ARCHITECTURE.md`、`CONTRIBUTING.md` 為依據；`docs/filebrowser-study/07-filehub-rewrite-blueprint.md` 保存行為需求與階段概覽，不另維護第二套工作進度。01–06 為來源研究，證據在該目錄的 `evidence/`；保留固定 commit、行號、REA Evidence ID 與驗證條件。
- `docs/toolchain-recommendation.md` 保存已確認工具鏈；工程與功能決策在 `docs/decisions/`，驗證在 `docs/validation/`，最新版本／進度依 README／主計畫。操作見 `docs/operations/`。UI 規範見 DESIGN；本機 Windows／Debian Chromium 與 Docker Desktop 結果不代表 GitHub hosted jobs、其他瀏覽器、裸機或真實網路掛載已驗證。
- 明確區分來源已確認行為、隔離環境實測、推論與 FileHub 設計建議。靜態分析不能當作執行結果。
- 不保存真實帳密、JWT、Cookie、使用者資料庫或無關網站的擷取內容。
- REA 原始匯出包、建置原始紀錄及上游授權副本保留 bytes；`.gitattributes` 避免 Git 換行轉換。原始建置紀錄的行尾空白保留，不為格式檢查重寫證據。

## 前端方向

2026-11-05 的 P10.7（本機 `docs/validation/P10.7.md`）以 0.40.18 修正手機 metadata／長名換行把 checkbox 拉向文字塊中央的問題；以第一行 22px 行盒對齊，並移除檔名／排序 text Button 的透明 border，保留原列高、水平欄位及 44px 手機 label。P10.6 的 label 中心量測不涵蓋此契約。Windows 全頁 105／105；Linux 原批與未改 timeout 的背景搬移補驗分開保留，不宣稱整批全過。兩平台截圖複核、正式 Compose 及原 8088 操作／DOM 驗證後交付；原分頁截圖 API 不可用，三尺寸目視依隔離 React 原圖。共 69 份完成，未重跑完整後端／release 矩陣。

2026-11-04 的 P10.6（本機 `docs/validation/P10.6.md`）以 e37ce90／0.40.17 檢查全部畫面家族：兩平台 204／204，480 張具名原圖、204 張代表原圖經 23 張聯絡表複核，未發現新增同類對齊缺陷；不改程式或版本。幾何、畫面檢視及人工簽收分開報告；透明 checkbox 量可見父層，原始 trace 暫存擷取不算具名原圖。正式 8088 原 image／23 產物相符；本次未操作原使用者分頁，實體裝置與其他瀏覽器仍保留未驗界線。

2026-11-04 的 P10.5（本機 `docs/validation/P10.5.md`）修正全選／每列 checkbox 及名稱欄對齊：桌面表頭與列共用 24px 置中欄，手機沿用 44px 並統一 8px gap。舊版三視窗先重現；Windows 21／21、Linux 9／9、Compose 5／5、39 張合成原圖及保留資料備份還原通過，8088 已為 0.40.17。原 IAB 本次連線不可用；HTTP 23 產物一致，不宣稱原分頁已操作驗收。

2026-11-01 使用者確認並授權實作「白色畫布」；規格與執行順序在 [P10-white-canvas](docs/decisions/P10-white-canvas.md)。0.40.16 的主內容／側欄／工具區／表頭與一般表面採白底；hoverSurface 為 #f7f9fc，disabledBackground 獨立保留 #f0f2f5。藍色操作、文字、H logo、互動／語意色及深色安全預覽沿用。AntD Table／Menu／text Button 與 owning CSS 共用色票；新區域不得把 sidebar 再當作停用色，也不加全站強制白色覆寫。P10.2（本機 `docs/validation/P10.2.md`） 已完成；P10.3（本機 `docs/validation/P10.3.md`） 於 2026-11-04 完成；新 Linux 六流程／1,026 白底通過並複核 290 張原圖。A06 原「黑畫面」描述為判讀錯誤，原 PNG 與像素證據保留。P10.4（本機 `docs/validation/P10.4.md`）已完成正式映像、備份還原及 8088 原分頁驗證；早期候選保留歷史。

2026-11-01 使用者核准[文件交疊 H 圖像 Logo](docs/design/P10/logo-image-v2.md)並要求調整。P10.1 的 BrandMark 共用於 Workspace／Login／PublicShell，favicon 與圖片引用同一份 Vite hash PNG；保留原始 bytes、透明留白及外層連結／名稱。圖片屬裝飾，alt 空且 aria-hidden，不重建 controller。正式 image 與 8088 已由 P10.4 交付 H 品牌與白色畫布；後續外觀仍依上列規格。

2026-10-31 的[配色與 SVG 識別檢查](docs/reviews/p10-color-and-logo-review.md)及[獨立比較工具](docs/design/P10/README.md)保留初始候選；30 張合成原圖及對比見 P10-design（本機 `docs/validation/P10-design.md`），不是正式 React 或 8088 交付。新方向與進度依主計畫／白色畫布規格，不將歷史候選寫成現行 palette。

P9 已獲使用者核准並授權依序實作：沉穩藍、深色檔名、淡底選取、統一表單／局部工具與工作入口，詳見[研究](docs/reviews/p9-design-review.md)及主計畫 P9。獨立 HTML 預覽只用合成資料，不作正式元件／API／授權／controller 驗收；P9.1–P9.9 已驗收並交付至 8088。下列 P8 行為契約仍有效；現行視覺數值依 P9 已驗證規格，不回寫歷史證據。CSS 按 owner 切片整理，避免再加全站 override。

檔案呈現分為 FileListing／ResourceActions／SelectionToolbar；FilePanel 保留取得資料、版本選取與動作協調。未選取不顯示批次按鈕；手機圖示保留完整可存取名稱與至少 44px 主要觸控範圍。版面驗收使用 66 項 fixture／三視窗與 1920px 專項，不能拿一筆資料或移除錯誤訊息達密度門檻。

沿用 React／TypeScript／Ant Design，現行依 P9 核准的沉靜藍、深色檔名、淡底選取與統一控制；P8 已保存固定版本 File Browser 的實際構圖、字體、Material 圖示與色票來源；依授權可直接取用並改寫 CSS／資產，需逐項保存來源、修改與授權聲明。已有 `app`、`theme`、公開 API client、登入／檔案工作空間及各功能頁；公開狀態頁為 `/?view=status`。UI 工作先讀 DESIGN 與全畫面審查，仍使用 ConfigProvider／集中 palette／自有 CSS 變數，不把 AntD 預設外觀當驗收目標。產品保留 FileHub 品牌、繁中、權限與安全流程，不搬入 Vue／上游後端或未接 API 的控制。

來源是列表／圖磚 mosaic／圖庫 gallery 三種模式。P8.3 已使 PreferencesSchema 與 DB CHECK 接受 list／mosaic／thumbnails，schema 13 migration 保留舊偏好／筆數；thumbnails wire value 保留為圖庫。日後增值仍須新 migration、knownDatabase／manifest 及相容測試，不重寫前十二份 SQL。P8.4 頂列／資源選單共用 actionsFor 與 snapshot；選取模式不改單擊開啟。資源選單關閉立即卸載，更多選單有受控展開／Escape／焦點；不得用正在離場的 menuitem 作下一次操作。搜尋呈現全頁時背景 inert，離開解除。P8.5 的目的地只讀既有授權 listing，提交仍驗 metadata；短表單 400px 置中，長 body 可捲且 footer 固定。全畫面預覽維持安全 renderer，資訊 disclosure 保留長路徑；上傳／工作換呈現不改 Workspace 的 controller ownership。公開頁的 PublicShell 只組版，不建立私有身份／工作 controller；skip link 聚焦 main 時保留分享 fragment。管理分類共用 query／navigate 守衛，只有分類列與寬表格內橫捲；不另建頁籤狀態。P9.7 工作浮卡非模態、380px／桌面右下各 24px／手機全寬，以實測高度預留空間，新增項目不搶其他 Modal 焦點，搜尋／導覽暫藏而 controller 存活。空狀態共用 EmptyState，原錯誤／限制不隱藏；更多區在選檔／新建時收合並保留返回焦點。已交付結果依 P9；P0–P8 文件及證據保持歷史結果。新候選方向與進度另依主計畫，不將原型視為已交付。

P7.1–P7.9 已完成殼層、工具列、搜尋、選取、導覽、設定、工作抽屜與其他畫面收斂；兩平台完整 Chromium 與逐張畫面驗收見 P7.9（本機 `docs/validation/P7.9.md`），8088 正式映像交付見 P7.10（本機 `docs/validation/P7.10.md`）。原始 UI 規範可由 `77b606b:AGENTS.md` 回查，原差距保存於[版面審查](docs/reviews/ui-layout-audit.md)。設定採根 query 頁面，Workspace 的上傳／工作 controller 跨頁存活；不擴大 SPA fallback 或改後端契約。功能驗收不能代替整體視覺驗收。

## 後端與測試規範

- 發行使用獨立 `pnpm test:release`（tests/release），要求本版及保留的 0.29.0／0.39.1 images；覆蓋全新安裝、schema 10→13、schema 12→13 的偏好／session 保留與各原 image 快照回復，以及未知 Python DB bytes 保留。receipt 在自有資源清理及其他服務核對後才標成功；不由一般 check 隱性要求 Docker。
- 唯讀平台的資料夾可因 canShare 而可選；Windows copy／move／ZIP 仍由 capabilities 禁止。測試依實際動作能力斷言，不以 checkbox 是否可選推論寫入權限。

- P6.3 正式 API／worker／admin 持 shared state flock，migration／backup exclusive；DB／FS 最後關閉後才釋放。完整備份另驗全部持久 owner guard，缺失／busy 不當作停機證據；舊 image 與外部寫入仍需操作者停寫。完整維護是 Linux 專用 filehub-full-v1，邊界見 docs/decisions/P6-maintenance.md。
- 還原只能新目標，state pending marker 在驗證完成前阻擋服務。重綁 entry／已證明 trash／ZIP／share／upload identities，清除 session 與候選；未完成工作保留 reservation／needs_review，不盲目 replay。--preserve-schema 只還原已知舊快照，不降版新 DB。

- P6.2 管理操作在 KDF／FS await 後再次驗 session／admin；停用、角色、密碼變更刪身份 session，工作／分享依 owner 的目前 grant。candidate 只由 CLI entry-offer 接主機路徑，HTTP 用 opaque ID；偏好只改目前 user。新增完整 UI／上限依 docs/decisions/P6-settings.md。
- Vitest 最多 2 workers，對齊 CI 的 2 CPU quota（該環境 os.availableParallelism 實測仍回 8）；案例內真實雙程序並行不受影響。KDF-heavy fixture 可 seed 已產生的合法測試 hash，實際登入與密碼行為仍跑正式 scrypt，不能放寬密碼參數掩蓋 timeout。

- P6.1 分享秘密放 URL fragment／Authorization，DB 只保存摘要。公開頁不讀身份 session，專屬 Cookie 限單分享 Path。來源需正 birthtimeNs，openScoped anchor 綁 dev／ino／birthtime；每段下載重查 owner grant／來源。密碼沿用單 KDF admission，冪等摘要不能另存快密碼 hash。詳見 docs/decisions/P6-sharing.md。

- P5 operation 與 P2 意圖共用持久子樹 reservation；不能繞過 queued／running／cancelling／interrupted／needs_review。claim 先建立 OFD guard，lease 5 秒／heartbeat 1 秒；所有更新驗 owner／attempt／lease。過期不等於停止，必須 proveOwner 成功才 fencing，未知副作用不 replay。詳見 docs/decisions/P5-operations.md。
- P5.2 manifest 每工作 1000 節點／16 層／2 GiB，單檔 1 GiB；copy 的私有 I/O helper 與跨裝置回收 helper 都繼承 operation guard。衝突 stop／skip 不覆寫；跨裝置先驗副本再送原入口 trash。operation-recover 只觀察／fsync，不 replay；未發布不明暫存保留 needs_review。打包 native helper 時同步 server package files allowlist。
- P5.3 ZIP 為 STORE／整份成功或失敗，產物 state 私有檔／0600，不使用預留 cache volume。2 GiB＋8 MiB／全域 8 GiB 管理配額、預留起 24h；未知／未清理保留容量。available／items／job 同交易，GET 不修復；下載需 owner 與目前 grant，GET 全 SHA、HEAD witness，共用 FileService 四份 admission。archive-maintain 在 writer／helper proof 停止且精確 witness 相符時 unlink／fsync，不自動發布未提交 ZIP。詳見 docs/decisions/P5-archives.md。
- P5.4 OperationController 屬 Workspace，最多 16 來源／50 工作 ID；storage 只含 owner 對應 UUID，不保存要求／CSRF。回應遺失只 GET 同 ID；讀取代次與狀態單調防舊結果，401 dispose。canCopy 表示背景來源能力，資料夾 canDownload 仍為 false；根目錄目的地以可寫 scope 判斷，不能用 root canWrite。Modal 關閉完成後才卸載以返回焦點，背景結果只 reload listing。
- P5.5 `pnpm test:nfs` 使用專屬 internal network／volume、固定 UNFS3 commit 與 NFSv3 ro／hard 來源；mount 後 UID 1000／CapEff 0，DB 保持本機。RPC 等待、父程序死亡、lease 過期都不代替 OFD proof；復原後可先 needs_review，再由精確維護清理成 cancelled。測試 SYS_ADMIN 不加入正式 Compose；receipt 在清理及其他服務身分／啟動時間核對完成後才 passed。邊界見 docs/decisions/P5-fault-acceptance.md。

- P4.4 瀏覽器縮圖一次一份、64 等候、含排隊 12 秒，單張最多 256 KiB；離開 abort／釋放 blob URL，401 先清除 pending。canvas 的預設 width 或 loading 尚未 mount 的空值不是完成證據，E2E 需等實際內容。

- P4.3 圖片 cache 為每個 API 自有 LRU，32 項／16 MiB，重啟清空；預留 `/data/cache` 不寫入。命中仍開原檔重授權及完整 SHA-256；key 包含 entry／path／stat／完整 hash／renderer profile。child 再驗來源 hash，輸出後核對目前 identity／download grant 才加入 cache。沒有持久轉檔工作。

- P4 預覽需要 download 權限，內容為 UTF-8 純文字、隔離子程序轉 JPEG 或 PDF.js 第一頁 canvas；不將 HTML／SVG／Markdown render 成內容 DOM。圖片 decoder／輸出／並行／時間限制見 docs/decisions/P4-previews.md。原檔 handle 為借用，不對 FileHandle.createReadStream 執行 destroy 後再繼續使用 handle；輸入讀取與 child 關閉完成後再釋放。

- P4 搜尋從已授權 path 開始，逐項重新授權與 scoped open；最多深度 8、掃描 10,000、結果 100、檢查點 2 秒／程序並行 2。單份 JSON 明示 partial reasons；不可將檢查點期限當核心 I/O 搶占保證。列表 filter 在完整有界 snapshot 上執行再分頁，filter 屬 version identity。

- 已建立 `apps/web`、`apps/server`、`packages/contracts` 的 private workspace；公開 error／health／auth／entries／files／writes／trash schemas 在 contracts，其餘模組按主計畫新增。公開契約不包含資料庫 entities、主機路徑、秘密或 server I/O。
- P0.6 正式 API 以模組相對路徑提供 `apps/web/build`，啟動要求完整產物；factory 只有明確 webRoot 才註冊靜態 plugin。僅首頁與已建 assets 可用，未知 API／檔案維持 JSON 404；HTML no-store，hash assets immutable。TypeScript dist 與 Vite build 分開，Git／Docker／ESLint 均忽略產物。
- Playwright wrapper 先設定 `.tools/playwright-browsers` 再載入 registry；install／test 用同一路徑（CI image 明確指定 `/opt/filehub-browsers`）。每測試自建 DB／API／動態埠，與 system 共用測試 service wrapper；IPC 不進正式入口。等待 DB 關閉與自然退出後才清理。不要用停用警告掩蓋 NO_COLOR／FORCE_COLOR 衝突；瀏覽器只引用公開 contracts，API client 必須驗 unknown、處理取消與舊結果。
- `buildApp` 與 `listenApp`／`closeApp`、API `main` 分離；匯入模組不得啟動服務或建立正式資料。factory 借用注入的 readiness probe，不關閉呼叫端資源；建立者負責 app 的關閉。
- `/health/live` 表示程序可回應；P0.3 起 factory 未注入 probe 預設回未就緒，正式 API 由 `main` 擁有 DB 並注入實際設定／schema／migration history 檢查。readiness 接受 AbortSignal；有界非同步等待不會搶占同步 SQLite 或核心 I/O。
- API／worker 各自擁有一條正式 DB 連線，只開既有 `state/filehub.db`，不自建或自動 migration；先 build／db:migrate，再分開 start:api／start:worker。worker 啟動時必須 DB 就緒，執行中未就緒則轉 unavailable 並繼續檢查；API 保留 live／ready 分離。migration 的 hash／revision／已知前綴門檻不變。
- `parseWorkerConfig` 共用 DB／log／關閉設定，不解析 API host／port；poll 預設 1000ms、50–60000ms。loop 取樣 readiness，Linux 就緒時另按維護間隔執行 UploadMaintainer（預設60000ms、1000–3600000ms），每批四筆並輪轉。info 記狀態／結果變化，debug 記每輪；Linux OperationExecutor 已執行持久 copy／move／archive 工作，維護與 owner proof 依 P5 決策。
- `lifecycle/shutdown.ts` 共用關閉 Promise、期限、SIGINT／SIGTERM callbacks；只移除自身 handlers。worker close／done 等到 loop 停止後才關閉 DB；直接借用 idle controller 的呼叫端仍負責其資源。deadline 不能搶占同步 SQLite 或核心 I/O。
- `FILEHUB_STATE_DIR` 預設為 cwd 下的 state；自訂須本機絕對路徑，拒絕 UNC／裝置路徑，但無法據此辨識 mapped drive 或 NFS，部署仍須查掛載。`FILEHUB_SQLITE_BUSY_TIMEOUT_MS` 預設 100，範圍 0–1000，沒有額外重試；此為 SQLite 等待設定，不是 wall-clock 或查詢期限。
- 連線使用 SQLite `3.53.4`、WAL、外鍵 ON、`synchronous=FULL`、`wal_autocheckpoint=1000`；upgrade driver 時同步核對 runtime gate。Drizzle SQL／metadata 放 `apps/server/drizzle/`，SQL 固定 LF 以穩定 migration hash，不修改已套用的 migration。
- DB 維護入口使用 SQLite backup API，驗 integrity／外鍵／schema 後只還原至新目錄，不覆寫既有 state。操作先停止兩服務與其他 DB 使用者；新 volume 用 `/data/state/restored` 等全新子目錄及一致設定，不直接還原到已存在的 mount 根目錄。DB-only 不涵蓋原檔／設定／工作狀態的完整回復，須依已完成的 P6.3 完整維護流程，見 `docs/operations/full-backup.md`。
- 公開錯誤僅含穩定 code、固定訊息、有限 details 與伺服器產生的 requestId；預設停用原始請求日誌，不輸出 URL、驗證輸入或 exception。Fastify 5.12.7 使用 `LogController` 設定 request logging，避免 deprecated 頂層選項。
- 權限、路徑與檔案服務供 API／worker 共用；前端型別與按鈕狀態不能代替後端執行期驗證。
- P1.2 `EntryService` 每次查帳號／entry／grant，對外只有公開 DTO；root／祖先 identity、state 與重疊保護在私有 service。所有 symlink 先拒絕；正式 Linux 的 scoped storage 使用 pinned fd／O_NOFOLLOW，Windows 為已驗一般替換的開發路徑。FS owner／handle 關閉與平台限制依 P1 決策，不能以字串 prefix 或 Windows 測試宣稱完整隔離。
- API／worker 共用本機 state 目錄與 SQLite WAL；DB／WAL／SHM 不放 NAS／NFS／SMB。工作與資源協調使用持久紀錄、短交易及有界 busy handling，不能只靠程序內鎖；檔案複製不持有長 DB 交易。
- 兩服務使用同一 image 版本／digest、相容的掛載路徑與必要身份。Compose 固定 UID/GID 1000、唯讀 rootfs、drop ALL、同 local state／files／cache volumes；外部掛載範例預設唯讀、不自動 mkdir／chown。migration 成功 gate 不能代替升級前的兩服務停機；備份須保持 DB 與必要檔案狀態一致並驗還原。
- Worker `main` 為 async，呼叫端須 await。Compose 在私有 tmpfs 發布原子 heartbeat，外部健康檢查核對 idle／ready、freshness、PID／Linux starttime 與 DB；它不是持久工作 lease。unhealthy 不等於自動重啟，沒有搶占同步／核心 I/O 的保證。
- Vitest projects 分開收集，suite 最多 2 workers；`pnpm check` 核對 metadata／typecheck／lint，完整 build 一次後跑原生測試，不要求 Docker／瀏覽器。`verify:core` 加 Chromium，`verify:p0` 再建正式 image 並跑 Compose；獨立 `test:integration` 也先 build，`:run` 命令要求已有產物。缺少 browser／Docker／image 直接失敗，不 skip。
- `tests/helpers/` 的目錄／子程序／環境 helpers 不依賴 runner；建立者先關閉資源，再核對 realpath、device／inode／非 symlink 清理自己的目錄，拒絕後保留現場。子程序等待 8 秒、緊急停止 2 秒，只終止自身 child；Compose 核對唯一 token，不 prune。Windows callbacks、Linux OS signal 與各瀏覽器平台分開報告。
- 大量或重複 Docker 測試前後，分開檢查 image／建置快取、測試容器／volume 與主機磁碟餘量；fixture 清理成功不代表建置快取已清除，也不代表 Docker Desktop VHDX 已縮小。保留發行測試所需舊 image 與使用者資料，勿以全域 prune 代替資源辨識。
- Docker VHDX 發生主機空間不足的寫入故障時，先恢復引擎並核對持久資料與服務，再辨識可清理資源；C 槽空間回升不代表 WSL／Docker 或資料已恢復，無法連線也不能推定容器已停止寫入。
- `.github/workflows/ci.yml` 固定 Actions SHA，Windows Server 2022／Ubuntu 24.04 core 與 Ubuntu Compose 沿用相同 scripts／frozen install。`docker/ci.Dockerfile` 供乾淨 Linux 核心驗收，專用 allowlist 排除主機依賴／產物／秘密。workflow 靜態驗證與本機實測不等於 hosted jobs 已成功。
- 關鍵檔案副作用使用隔離的真實暫存 FS 與正式 DB adapter；fixture、埠、帳號及清理範圍不得共用真實使用者資源。TypeScript 型別檢查獨立執行。
- WAL／跨程序案例使用實際 file-backed SQLite 與雙程序，不能以 in-memory DB 代替；P0 核對 driver 實際 SQLite 版本包含 WAL-reset 修補。
- 使用已定案 pnpm、單一 lockfile 與 frozen lockfile 安裝；Kit 在開發階段產生並審查 migration SQL／metadata，正式 image 以 Drizzle runtime migrator 執行一次性 migration。外部直接依賴精確鎖版，不使用浮動 `latest` 或 RC 替代定案版本。
- 小份實作與驗證後提交；同步小操作與持久背景工作依架構分流，避免將簡單改名也做成通用佇列。

## 版本與驗證

- 版本來源為根 `package.json`，目前 `0.40.18`；三個私有 workspace 同版，實質程式變更依 SemVer 同步。發行版本亦同步 Docker label、Compose／env 預設 image tag 及 `docker/nfs-fixture.Dockerfile` 的 CI image 預設；fixtures 從根版本取 tag，`check:project` 核對一致性。文件變更不增加版本。
- 修改文件後檢查相對連結、來源定位、圖表、證據邊界與 `git diff --check`。
- 更新本檔、`MEMORY.md`、`README.md`，介面知識另同步 `DESIGN.md`；只保留已驗證且可長期使用的資訊。
- 任務完成後提交本次相關變更；除非使用者另外明確要求，不自動 push。

## P2 寫入規範

- Linux 同步寫入使用 native/filehub-fs.c 的 renameat2 NOREPLACE 與 OFD flock，Node／TypeScript 管理授權／意圖，不能降級成 exists + rename。Windows 開發不啟用寫入。
- 入口與 member grant 皆須 opt-in；`.filehub` 私有 namespace 不接受公開 path／grant，不接管外來同名目錄。guard／private staging 的 owner 證據不可自動刪除，結果不明保留 reservation。
- 寫入 UUID 僅對相同帳號／種類／完整輸入重用，前端逾時查狀態，不自動重送；FS I/O 不進 DB 短交易。決策與操作見 docs/decisions/P2-synchronous-writes.md、docs/operations/writes.md。

- P2.3 回收以 entry 私有 trash、同 FS NOREPLACE rename；回收 prepared／terminal 與 intent 同一短交易。保留至還原，不提供自動清空／永久刪除；每 entry 1000 歷史紀錄，缺失／不同 witness 不可還原。還原／列表 owner 與目前 grant 均重查，規則見 docs/decisions/P2-trash.md。

- P2.4 write-recover 必須先證明舊 owner／在途 helper 已釋放 OFD guard，再 fencing／觀察；缺 guard 或 busy 保留 reservation。不得加入無證據 force-unlock／TTL 重播。恢復只判讀／fsync，詳細結果與 CLI exit 語意依 docs/decisions/P2-recovery.md。

## P3 上傳規範

- 採自訂 FileHub upload session v1，不能宣告 TUS 相容。單檔 1 GiB、段 4 MiB、固定 24h、逐段 SHA-256，公開 manifest 供重新選檔驗 prefix。配額與狀態依 docs/decisions/P3-upload-protocol.md。
- upload_sessions／upload_chunks 是持久管理紀錄；bytes 不進 SQLite。取消／到期的未知或尚未清理 payload 保留容量，GET 不修復 FS；撤權 owner 可取消自己的未發布 session，不能藉此發布／刪除原檔。
- receiver 先 fsync／驗權再提交 offset，錯誤只回復未提交尾端；發布前重讀每段與完整 hash。UploadService close 等待自己操作／guard，main 先 uploads、再 mutations、最後 DB。
- upload publication 是內部 rename intent，public rename 不接受私有 source。恢復檢查 upload row／plan／witness 連結及兩個 OFD owner，已發布內容再驗 hash；不能只憑 session 狀態或一個 guard 推測完成。
- UploadController 屬 Workspace，FilePanel key 改變不卸載佇列。單一傳送／100 項、每次最多 4 MiB Web Crypto，需 HTTPS／localhost；不將 File／CSRF 存 browser storage。重新選檔須驗全部已提交 prefix，不只比名稱與大小；送出 bytes 與 committed offset 分開。
- UploadMaintainer 不自動發布；接收中斷驗 prefix 才 truncate 未提交尾端，過期／取消只刪私有已知 inode／nlink=1 的 payload，精確 witness 與 guard fd 交給 native unlinkat／parent fsync。unknown／換 inode／hardlink／缺 guard 保留；只挑本批 publication，不自動恢復無關 P2 操作。
- maintenance 的私有 EntryService 方法不註冊公開 route，可在 owner／入口停用後清理已取消／到期的自有暫存；不授權公開瀏覽或發布。upload-maintain 是每批最多四筆，exit 0 只表示本批可判讀，不等於全域清空。
- 背景上傳完成只 reload listing，不以更新 FilePanel key 刷新；否則會關閉其他正在編輯的 Modal。401 立即 dispose queue／File 參照；最後三視窗加強案例驗對話框與輸入保留。
