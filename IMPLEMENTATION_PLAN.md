# FileHub 分階段實作主計畫

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

本文件是新版 FileHub 從 P0 開始的實作順序與進度依據。後續每次開工先選定這裡的一份工作，依指定參考、修改位置及驗收條件完成，再更新狀態並 commit。

建立日期：2026-10-27；2026-10-30 新增 P8／P9，2026-11-01 完成 P10.1／P10.2。**P0–P9 已完成 62 份；加上 P10.1–P10.7，目前共完成 69 份，程式版本 `0.40.18`／schema 13，8088 已交付 `0.40.18`。** P8 的 [File Browser 全畫面還原](docs/reviews/filebrowser-visual-reference.md)與驗收保留歷史；P9 的[設計研究](docs/reviews/p9-design-review.md)已完成實作與保留資料交付。P10.3 於 2026-11-04 完成視覺驗收及原圖判讀更正；P10.4 已完成正式交付。原始計畫功能對照、最新結果及缺口見[驗收準備稽核](docs/reviews/acceptance-readiness-2026-11-01.md)。歷史功能驗收依 P6.4（本機 `docs/validation/P6.4.md`）及跨階段矩陣（本機 `docs/validation/P6-matrix.md`）。

## 計畫放置與使用方式

| 文件／位置 | 責任與更新時機 |
| --- | --- |
| 根目錄 `IMPLEMENTATION_PLAN.md`（本檔） | 主計畫、工作編號、順序、進度、下一份工作；每次實作完成後更新 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 已確認架構、模組邊界、資料與程序協調；工程決策改變時更新 |
| [工具鏈定案](docs/toolchain-recommendation.md) | 已確認版本及相容性驗證要求；版本變更時更新 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 實作、測試、版本及提交流程；scripts 建立後補入實際命令 |
| [DESIGN.md](DESIGN.md) | 視覺與元件規範；UI 工作前閱讀，實作後同步已驗證的規格 |
| [改寫藍圖](docs/filebrowser-study/07-filehub-rewrite-blueprint.md) | 產品行為、API 草案與跨階段驗收需求；本計畫將其拆成可執行工作 |
| `docs/decisions/` | 已有 P0 工具鏈與 API 生命週期決策；後續只在有實際決策時新增，例如 `P1-session-and-access.md` |
| `docs/validation/` | 每份工作的驗證摘要，例如 `P0.1.md`、`P0.2.md`；保存命令、環境、結果與未驗證項目 |
| `README.md`、`AGENTS.md`、`MEMORY.md` | 使用方式、開發入口與長期經驗；依本次實際變更同步 |

本檔管理執行順序與進度，架構與工具鏈文件管理已確認決策。研究報告與歷史原碼提供行為依據；若有衝突，先記錄差異並更新對應決策，不能把參考來源的設計默認成新版規格。

### 每次依計畫開工

1. 讀 [AGENTS.md](AGENTS.md)、[MEMORY.md](MEMORY.md)、[README.md](README.md)、本檔，以及該份指定的參考；UI 工作另讀 DESIGN。
2. 確認 Git 狀態、前置工作與實際目錄，選下一個未完成項目，改為 `進行中`；先收斂前面的 `待驗證` 或受阻前置，不能跳過它們直接做後面的 `未開始`。一次做一份；若太大，以 `P1.3a` 等子編號再拆，保留原目標與階段順序。
3. 寫清楚本份輸入、輸出、權限、錯誤與副作用，再補必要測試並實作；預定檔名可調整，但需同步本表。
4. 執行適用測試、型別／lint／build 與實際畫面檢查。不能用 mock、`inject` 或 Windows 本機結果代替未跑的真實 DB、TCP、Linux／NFS 驗證。
5. 更新本檔、驗證摘要及實際受影響的文件；只暫存本份變更。完成檢查後 commit，訊息包含工作編號，例如 `feat(P1.3): add scoped directory listing`；未明確要求不 push。
6. 下一次先核對前一份 commit 與未完成項，再接續下一份。使用者說「按計畫繼續」時，從下一個未完成工作接續，不重做已完成階段。

狀態使用 `未開始`、`進行中`、`待驗證`、`受阻`、`完成`；`受阻` 必須寫明缺少條件。測試或必要環境尚未具備時保留 `待驗證`，不先標完成。工作完成仍需通過[每份工作共同完成條件](#每份工作共同完成條件)；不以階段表上的一句成功描述代替實測。

## 參考文件與原始碼索引

### 新 FileHub 與研究報告

下表代號供各階段的「參考」欄使用；報告中的固定 commit、行號及 Evidence ID 繼續保留。

| 代號 | 參考文件 | 使用目的 |
| --- | --- | --- |
| A | [ARCHITECTURE.md](ARCHITECTURE.md) | 模組、contracts、入口、FS／DB、API／worker 與部署邊界 |
| C | [CONTRIBUTING.md](CONTRIBUTING.md) | 測試分層、隔離 fixture、scripts、CI、版本與 commit |
| T | [工具鏈定案](docs/toolchain-recommendation.md) | Node `24.22.1` LTS、better-sqlite3 `13.0.3`、Drizzle ORM `0.45.4`／Kit `0.31.11`、pnpm `12.16.0` |
| D | [DESIGN.md](DESIGN.md) | React／Ant Design、token、元件及畫面驗收方向 |
| U | [介面版面審查](docs/reviews/ui-layout-audit.md) | 原始 UI 規範、八組控制列、工作區寬度、導覽及設定流程差距；P7 的問題依據 |
| V | [File Browser 全畫面審查](docs/reviews/filebrowser-visual-reference.md)、65 張畫面索引（本機 `docs/reviews/filebrowser-visual-reference/README.md`） | P8 的主要視覺依據：實際畫面、尺寸、上游原碼、與 FileHub 差距及保留的行為契約 |
| N | [P9 設計研究](docs/reviews/p9-design-review.md)、[獨立預覽](docs/design/P9/README.md) | 新的色彩、資訊層級、元件及尺寸提案；P8 保持既有交付，P9 正式實作依下表逐份驗證 |
| B | [07 改寫藍圖](docs/filebrowser-study/07-filehub-rewrite-blueprint.md) | 功能需求、資料實體、API 草案與驗收矩陣 |
| R1 | [01 來源與架構](docs/filebrowser-study/01-source-and-architecture.md) | 來源身分與證據強度 |
| R2 | [02 樣式與版面](docs/filebrowser-study/02-ui-style-and-layout.md) | 畫面結構、響應式及元件行為參考 |
| R3 | [03 後端與 API](docs/filebrowser-study/03-backend-and-api.md) | 來源後端流程、儲存、上傳、搜尋及原碼定位 |
| R4 | [04 流程與狀態](docs/filebrowser-study/04-user-flows-and-state.md) | 登入、查詢、選取、寫入、上傳、分享的操作分支 |
| R5 | [05 安全與改寫邊界](docs/filebrowser-study/05-security-and-rewrite-boundaries.md) | session、授權、路徑、預覽及公開分享的重寫要求 |
| R6 | [06 執行證據](docs/filebrowser-study/06-runtime-evidence.md)、證據索引（本機 `docs/filebrowser-study/evidence/README.md`） | 確認哪些畫面／請求已實測；不將有限結果當完整驗收 |

### File Browser 原碼

本機唯讀來源：`C:\Users\win10\Desktop\Github\filebrowser`，固定 commit `833d908884d5c801f30f5c098d7977177eb3a36b`。以下路徑相對該來源根目錄；連結固定在同一 commit。Go、Vue、Pinia 與 bbolt 用於理解行為，實作仍依已定案的 Node／React／SQLite 架構。

| 代號 | 必讀原碼及相關測試 | 對應用途 |
| --- | --- | --- |
| FB0 | [http/http.go](https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/http/http.go)、`http/static.go`、`cmd/root.go` | 服務組裝、靜態資產與請求流程；不沿用其部署拓樸 |
| FB1 | [http/auth.go](https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/http/auth.go)、`users/permissions.go`、`frontend/src/stores/auth.ts`、`frontend/src/views/Login.vue` | 登入與權限行為比對；session 撤銷依 FileHub 重設計 |
| FB2 | [files/scoped.go](https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/files/scoped.go)、`files/listing.go`、`http/resource.go`、`http/raw.go`、`http/rules_path_test.go` | 路徑、列表、下載與邊界案例 |
| FB3 | [frontend/src/views/files/FileListing.vue](https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/views/files/FileListing.vue)、`frontend/src/views/Layout.vue`、`frontend/src/components/Sidebar.vue`、`frontend/src/stores/file.ts`、`frontend/src/router/index.ts` | 殼層、導覽、列表、URL 與選取；另按 D 重寫視覺 |
| FB4 | [http/resource.go](https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/http/resource.go)、`fileutils/copy.go`、`frontend/src/components/prompts/Rename.vue`、`frontend/src/components/prompts/ResolveConflict.vue` | 寫入與衝突；直接覆寫／永久刪除不作新版預設 |
| FB5 | [http/tus_handlers.go](https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/http/tus_handlers.go)、`http/tus_multichunk_test.go`、`http/tus_symlink_test.go`、`frontend/src/stores/upload.ts`、`frontend/src/api/tus.ts`、`frontend/src/utils/upload.ts` | 上傳 offset、長度、衝突與 UI 佇列 |
| FB6 | [http/preview.go](https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/http/preview.go)、`http/search.go`、`search/search.go`、`frontend/src/views/files/Preview.vue`、`frontend/src/components/Search.vue` | 搜尋、預覽、快取與降級 |
| FB7 | [http/share.go](https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/http/share.go)、`http/public.go`、`http/public_symlink_test.go`、`http/users.go`、`frontend/src/views/settings/Users.vue` | 公開分享、管理與權限回歸 |
| FB8 | `frontend/src/css/` 的 `_variables.css`、`fonts.css`、`base.css`、`header.css`、`listing.css`、`listing-icons.css`、`mobile.css`、`dashboard.css`、`login.css`、`upload-files.css` | P8 視覺還原；實際 cascade／量測／固定來源連結見 V，資產授權須逐項核對 |
| FB9 | `frontend/src/components/header/HeaderBar.vue`、`components/Sidebar.vue`、`components/Search.vue`、`components/ContextMenu.vue`、`components/files/ListingItem.vue`、`components/prompts/`；`frontend/src/views/` 的 Login／Share／Settings／settings／files | 所有主要頁面的構圖、情境動作、浮層及全畫面預覽；components 短路徑相對 `frontend/src/`，完整檔名對照依 V §4 |

### 清空前的 FileHub

以下檔案只存在本儲存庫歷史 commit `77b606bb9bd552a00c5e13c3dc16571623548565`，不是目前工作目錄中的可用程式。用於找回需求與回歸案例，不直接恢復舊版程式、沿用舊資料庫或假設舊測試已通過。讀取單檔可用 `git show 77b606bb9bd552a00c5e13c3dc16571623548565:<路徑>`。

| 代號 | 歷史檔案及測試 | 對應用途 |
| --- | --- | --- |
| FH0 | [舊 README](https://github.com/HsinPu/FileHub/blob/77b606bb9bd552a00c5e13c3dc16571623548565/README.md)、`compose.yaml`、`backend/app/cli.py`、`backend/tests/test_compose_mounts.py` | 內建儲存、管理員 bootstrap、外部掛載與部署需求比對 |
| FH1 | [backend/app/services/access.py](https://github.com/HsinPu/FileHub/blob/77b606bb9bd552a00c5e13c3dc16571623548565/backend/app/services/access.py)、`backend/app/api/routes/auth.py`、`backend/tests/test_access.py`、`backend/tests/test_access_revocation.py`、`backend/tests/test_directory_registry.py` | 多目錄 grant、session、撤權與入口註冊回歸 |
| FH2 | [frontend/src/features/files/FileWorkspace.tsx](https://github.com/HsinPu/FileHub/blob/77b606bb9bd552a00c5e13c3dc16571623548565/frontend/src/features/files/FileWorkspace.tsx)、`frontend/src/features/files/DirectoryTree.tsx`、`frontend/src/features/files/useDirectoryListing.ts`、`frontend/tests/workspace-loading.spec.ts`、`backend/tests/test_listing_performance.py` | 原 FileHub 工作空間、目錄導覽、舊請求、載入與大目錄問題 |
| FH3 | [backend/app/services/trash.py](https://github.com/HsinPu/FileHub/blob/77b606bb9bd552a00c5e13c3dc16571623548565/backend/app/services/trash.py)、`backend/app/services/transfers.py`、`backend/tests/test_trash.py`、`backend/tests/test_transfers.py` | 名稱、改名、垃圾桶、還原與衝突 |
| FH4 | [backend/app/services/folder_uploads.py](https://github.com/HsinPu/FileHub/blob/77b606bb9bd552a00c5e13c3dc16571623548565/backend/app/services/folder_uploads.py)、`backend/tests/test_folder_uploads.py`、`frontend/src/features/files/UploadPanel.tsx`、`frontend/src/features/files/FolderUpload.tsx` | 資料夾上傳、逐項結果與中斷處理 |
| FH5 | [backend/app/services/operations.py](https://github.com/HsinPu/FileHub/blob/77b606bb9bd552a00c5e13c3dc16571623548565/backend/app/services/operations.py)、`backend/app/services/archives.py`、`backend/tests/test_operations.py`、`backend/tests/test_archives.py`、`frontend/src/features/files/OperationPanel.tsx` | 背景操作、禁止盲目重播、ZIP 與工作 UI |
| FH6 | [backend/app/api/routes/shares.py](https://github.com/HsinPu/FileHub/blob/77b606bb9bd552a00c5e13c3dc16571623548565/backend/app/api/routes/shares.py)、`backend/tests/test_shares.py`、`backend/tests/test_accounts.py`、`frontend/tests/shares.spec.ts`、`frontend/tests/accounts.spec.ts` | 分享、帳號與管理流程 |
| FH7 | 同一 `77b606b` 的 `AGENTS.md` §1–2、§6–7、§20–24、§44–47；`frontend/src/features/files/WorkspaceShell.tsx`、`FilesPage.tsx`、`frontend/src/styles.css` | Stripe／Linear／Ant Design 原始視覺意圖、精簡工具列、帳號導覽及長表單承載；只作設計參考 |

## 階段順序與修改位置

| 階段 | 可以交付的成果 | 前置條件 |
| --- | --- | --- |
| P0 | 可建置、啟停、測試與備份還原的最小雙服務骨架 | 無；從 P0.1 開始 |
| P1 | 登入後依 grant 瀏覽入口、列表及下載 | P0 完成 |
| P2 | 可驗權限、處理衝突的新建／改名／垃圾桶還原 | P1 完成；先做跨程序寫入協調基礎 |
| P3 | 有暫存、進度、取消及重啟策略的上傳 | P2 的路徑、衝突與寫入協調可共用 |
| P4 | 有界搜尋與安全預覽／縮圖 | P3 完成；沿用 P1 讀取與 P2／P3 變更契約 |
| P5 | 持久複製、搬移、ZIP 與工作追蹤 | P2 協調、P3 暫存及 P4 讀取邊界已驗證 |
| P6 | 分享、管理頁與可還原的發行流程 | P1–P5 已完成相應驗收 |
| P7 | 整體介面收斂、情境工具列、管理工作區與實際試用驗收 | P0–P6 功能基線完成；以 U／D／FH7 為依據，從 P7.1 開始 |
| P8 | 以 File Browser 實際畫面還原全部既有頁面的視覺、三種檢視及整體交付 | P7 完成；全畫面審查 V 已保存，P8.1–P8.10 已完成 |
| P9 | 改善視覺層級、色彩、操作辨識與跨頁一致性 | P8 完成；設計研究／獨立預覽已備妥，P9.1–P9.9 已全部完成，包含正式映像與保留資料交付 |

原則上按表內編號順序進行。後續階段若依賴尚未建立的能力，先新增明確的前置子工作並更新本檔；不能跳過測試或暗中將整個後續階段塞進當前切片。

下列位置以 `apps/server/src`（後端）、`apps/web/src`（前端）、`packages/contracts/src`（公開契約）為基礎。單元測試放 application 的 `tests/unit/` 或靠近模組，整合測試放 `apps/server/tests/integration/`；P0.2 的真實 HTTP／產物子程序測試放 `tests/http/`，Playwright 瀏覽器流程留 `tests/e2e/`，平台與雙程序測試留 `tests/system/`。只建立當份需要的檔案，不預先填滿空模組。

## P0 契約工具鏈與可啟動骨架

**目標：** 先讓最小服務能建置、啟動、請求、關閉與清理。API／worker 都存在，但此階段尚不提供檔案操作產品功能。

| 編號／狀態 | 要做的內容 | 預計新增／修改位置 | 參考 | 本份驗收 |
| --- | --- | --- | --- | --- |
| P0.1 完成 | 已建立 private workspace／精確依賴、TypeBox 選型、版本 `0.1.0`、strict TS／lint／工具鏈測試及 build | 根 manifests／lockfile／TS／ESLint／Vitest 設定；三個 workspace 的 package／TS 設定與 `src/index.ts`；`apps/server/tests/integration/toolchain.test.ts` | A §1–2、C §2／8／10、T、[決策](docs/decisions/P0-tooling.md) | Windows x64 乾淨 frozen install、獨立 typecheck、lint、2 測試、build 與反向檢查通過；SQLite `3.53.4`；正式 Linux／雙程序驗證留後續，見摘要（本機 `docs/validation/P0.1.md`） |
| P0.2 完成 | 已建立公開 error／health 契約、可注入 Fastify factory、設定驗證與 API 啟停；版本 `0.2.0` | contracts 的 `errors.ts`／`health.ts`；server 的 `app.ts`、`server.ts`、`runtime.ts`、`config/`、`plugins/`；`apps/server/tests/unit/`、`apps/server/tests/integration/`、根 `tests/http/`、`.env.example` | A §2–4、C §4–5、R3 §1–3、FB0、[決策](docs/decisions/P0-api-lifecycle.md) | Windows 型別／lint／build、40 測試與 frozen install 通過；inject 與 TCP／產物分開驗證，匯入無啟動副作用、非法設定／啟動失敗清理與錯誤隱私均通過；正式 DB readiness 留 P0.3，見摘要（本機 `docs/validation/P0.2.md`） |
| P0.3 完成 | 已建立 SQLite／Drizzle adapter、schema revision 1、一次性 migration、DB 備份還原 harness 與正式 API readiness；版本 `0.3.0` | `apps/server/src/` 的 `persistence/`、`migrate.ts`、`config/`、`server.ts`；`apps/server/drizzle/`、`apps/server/drizzle.config.ts`；`apps/server/tests/` 的 `helpers/database.ts`、`integration/persistence.test.ts`；根 `tests/http/persistence.test.ts` | A §8、T、C §2／5、[決策](docs/decisions/P0-persistence.md) | Windows 型別／lint／乾淨 build、75 測試、Kit metadata／無差異生成通過；SQLite 3.53.4／WAL／外鍵、短交易／rollback、跨連線及雙程序 busy、schema／history 不符拒絕就緒、隔離備份還原已測；Linux／真正雙服務留 P0.4–P0.5，見摘要（本機 `docs/validation/P0.3.md`） |
| P0.4 完成 | 已建立獨立 idle worker、共同設定／DB ownership／關閉 helpers 與實際服務程序 harness；版本 `0.4.0` | `apps/server/src/` 的 `worker.ts`、`worker/idle.ts`、`lifecycle/shutdown.ts`、`config/`、API／runtime；`apps/server/tests/` 的 `unit/`、`integration/worker.test.ts`；根 `tests/system/`、`tests/helpers/environment.ts`、scripts／Vitest | A §3／6–8、C §5–6、T、[決策](docs/decisions/P0-worker-lifecycle.md) | Windows 型別／lint／乾淨 build、107 測試通過；API／worker 不同程序及連線共用同一暫存 WAL，分開啟停／重啟、就緒狀態、DB／signal／timer 清理與 fixture 移除通過；Linux OS signal／Compose 留 P0.5，未建立 job claim／重試，見摘要（本機 `docs/validation/P0.4.md`） |
| P0.5 完成 | 已建立固定 Linux 同 image 的 migration／api／worker、本機持久卷、權限／掛載／健康契約與 DB 維護；版本 `0.5.0` | `Dockerfile`、`.dockerignore`、`compose.yaml`、`compose.mounts.example.yaml`、`.env.example`；server 的 `worker/heartbeat.ts`、`worker.ts`、`config/`、`healthcheck.ts`、`db-maintenance.ts` 及測試；`tests/system/compose-fixtures.ts`／`compose.test.ts`；[部署決策](docs/decisions/P0-deployment.md)、[操作](docs/operations/deployment.md) | A §8、C §5、T、FH0、R3 §9 | 型別／lint／乾淨 build、121 原生與 4 Linux Compose tests 通過；同 image／UID／ext4 WAL、migration 失敗阻擋、SIGTERM、worker 停滯健康、重建持久化、Linux bind 權限及新 volume DB 還原通過。平台為 Docker Desktop WSL2／amd64，真實 NFS 未驗，見摘要（本機 `docs/validation/P0.5.md`） |
| P0.6 完成 | 已建立 React／Ant Design 系統概覽、集中主題、可取消的 schema 驗證 API client、同源 SPA 與隔離 Playwright fixture；版本 `0.6.0` | `apps/web/index.html`、`vite.config.ts`、`src/main.tsx`、`app/`、`theme/`、`lib/api.ts`、CSS／測試；server `plugins/web.ts`、app／main；`playwright.config.ts`、`scripts/playwright.mjs`、`tests/e2e/`、Dockerfile | A §2／8–9、C §6–7、D、R2／R6、[決策](docs/decisions/P0-web.md) | 142 原生＋18 Chromium＋4 Linux Compose tests、型別／lint／乾淨 build 通過；正式 SPA 同源讀公開 ready，載入／503／錯誤與恢復、三視窗／鍵盤／溢位已驗；HTML 不快取、未知 API／檔案仍 JSON 404，Linux image 資產 hash 一致。未建立登入或檔案功能，見摘要（本機 `docs/validation/P0.6.md`） |
| P0.7 完成 | 已整理共用目錄／程序／環境 fixtures、版本核對與統一驗收 scripts、CI 及 P0 操作／平台限制；版本 `0.7.0` | `tests/helpers/` 與各層 fixtures、6 個清理防護 tests；根 scripts／Playwright 設定、`.github/workflows/ci.yml`、`docker/ci.Dockerfile`／專用 dockerignore；[決策](docs/decisions/P0-ci-and-fixtures.md)、[P0 操作](docs/operations/p0-checklist.md)、README／A／C／T／DESIGN | C §8–10、A §7–9、T、R6 | Windows／隔離 Debian 各 148 原生＋18 Chromium、正式 Linux Compose 4 cases、frozen install／型別／lint／build、actionlint 通過；ownership 清理與既有服務比對通過。GitHub hosted jobs 未執行，NFS／其他平台限制明列，見摘要（本機 `docs/validation/P0.7.md`） |

**P0 完成門檻：** P0.1–P0.7 均有驗證摘要；實際工具／SQLite 版本、API／worker 啟停、migration 失敗門檻與還原均有證據。已定版本若無法取得或相容，先記錄錯誤及修正決策，不默換版本或把安裝失敗當成功。

## P1 登入與唯讀工作空間

**目標：** 完成第一條可用流程：「管理員初始化 → 登入 → 看見獲授權入口 → 列表／下載 → 登出後舊 session 失效」。

| 編號／狀態 | 要做的內容 | 預計新增／修改位置 | 參考 | 本份驗收 |
| --- | --- | --- | --- | --- |
| P1.1 完成 | 已建立可撤銷 session、scrypt 密碼、Cookie／Origin／CSRF、持久節流及最小帳號 CLI；版本 `0.8.0`／schema 2 | `modules/identity/`、`cli.ts`、identity tables／Kit migration、公開 auth contracts；整合／升級／單元／真實 CLI／Linux image 測試；[決策](docs/decisions/P1-session-and-access.md)、[操作](docs/operations/identity.md) | A §4、B §4–5、R5 §2／8、FB1、FH0／FH1 | 160 原生、18 Chromium、4 Linux Compose 通過；涵蓋密碼／session hash、撤銷／重播／期限、CSRF／Origin、節流、schema 1 升級與 stdin／TTY CLI；限制見摘要（本機 `docs/validation/P1.1.md`） |
| P1.2 完成 | 已建立 managed／external UUID 入口、根／子 grant、CLI 與公開 entries、scoped path；版本 `0.9.0`／schema 3 | `modules/entries/`、`storage/scoped.ts`、CLI、entries／grants Kit migration／contracts；[決策](docs/decisions/P1-entries-and-scoped-paths.md)、[操作](docs/operations/entries.md) | A §5、B §1／4、R5 §3–4、FB2、FH1 | Windows／Debian 各 182 原生＋18 Chromium、4 Compose 通過；不可見入口／撤權／scope、state／重疊保護、traversal／symlink／junction／目錄替換、公開 DTO 與 Linux fd 錨定已驗；限制見摘要（本機 `docs/validation/P1.2.md`） |
| P1.3 完成 | 已建立 metadata、有界即時列表／版本分頁與單檔／Range 下載；版本 `0.10.0`，schema 3 不變 | `modules/files/`、EntryService 授權快照、resource contracts；6 個 FS 整合、13 Range 單元、真實 TCP 與 Compose binary smoke；[決策](docs/decisions/P1-files-read.md) | A §4–5／7、B §5／7、R3 §4／6／8、FB2、FH2 | Windows／Debian 各 202 原生＋18 Chromium、4 Compose 通過；5000 上限／100 分頁、雙類入口／grant、外部變更、下載 bytes、HEAD／中斷清理已驗；限制見摘要（本機 `docs/validation/P1.3.md`） |
| P1.4 完成 | 已建立登入、AppShell、入口／scope 切換、麵包屑、Table／排序／選取／版本分頁與手機導覽；決定單層載入、不預掃遞迴樹；版本 `0.11.0` | `app/`、`features/auth/`、`features/files/`、client／useResource、CSS；6 client 單元、12 workspace E2E、CI UTF-8 locale；[決策](docs/decisions/P1-workspace.md) | D、B §2–3、R2、R4 §1–5、FB3、FH2、R6 | Windows／Linux 各 208 原生＋30 Chromium、4 Compose 通過；URL／刷新／晚回應／loading-empty-error／bytes／鍵盤與 1440／800／390px 無溢位已驗，6 張截圖見摘要（本機 `docs/validation/P1.4.md`） |
| P1.5 完成 | 已串起正式 CLI bootstrap／入口授權與完整唯讀 E2E、升級身份保留及最小操作說明；版本 `0.12.0`，schema 3 不變 | `tests/e2e/files-read.spec.ts`、共用 actions／CLI provisioning／snapshot fixtures、identity upgrade、async 按鈕名稱；[操作](docs/operations/read-only-workspace.md) | C、B §7、R5、FH1／FH2 | Windows／Linux 各 209 原生＋45 Chromium、4 Compose 通過；管理員／member、登出失敗重試／重播、撤權／停用、離線／恢復、拒絕無 logical DB／原檔寫入已驗；摘要與六張截圖（本機 `docs/validation/P1.5.md`）；P1 保持唯讀 |

**P1 完成門檻：** 權限與路徑保護涵蓋 API 及下載，而不只隱藏前端按鈕；內建與外部入口皆有可重現案例。完整管理頁留 P6，P1 必須已有可用的初始化／授權方式。

## P2 安全寫入與垃圾桶

**目標：** 先建立可共用的寫入規則與持久協調，再開放新建、改名、移至垃圾桶與還原。

| 編號／狀態 | 要做的內容 | 預計新增／修改位置 | 參考 | 本份驗收 |
| --- | --- | --- | --- | --- |
| P2.1 完成 | 定義名稱／預期版本／衝突政策，建立 API 與 worker 共用的來源目的地／子樹寫入協調、必要意圖與恢復紀錄 | `storage/`、`modules/files/`、必要 persistence schema／migration、write contracts | A §5–6、B §5、R5 §3–4、FB4、FH3／FH5 | Windows／Linux 各 233 原生、3 Chromium 及 4 Compose 通過；持久子樹 reservation、owner／generation 與 schema 3 升級已驗，未接寫入 HTTP；驗證（本機 `docs/validation/P2.1.md`） |
| P2.2 完成 | 實作有界同步的新建資料夾／改名與對話框 | `modules/files/`、`features/files/` 的操作對話框／toolbar、contracts；單元／整合／E2E | A §6、B §2／5、R4 §8、FB4、FH3 | Windows／Linux 各 238 原生＋48 Chromium、4 Compose 通過；Linux NOREPLACE、雙方 scope／版本、大小寫／Unicode／衝突／消失來源、焦點與選取更新已驗，Windows 寫入明確拒絕；摘要（本機 `docs/validation/P2.2.md`） |
| P2.3 完成 | 固定垃圾桶位置／保留／唯讀及跨檔案系統政策，實作回收列表、移入與還原 | `modules/trash/`、trash schema／migration、`features/trash/`、contracts、回收 fixture | B §1／4–5／7、A §5–6、R5、FH3 | Windows／Linux 各 244 原生＋9 選定 Chromium、4 Compose 通過；同 FS 移入／換名還原、owner／撤權、衝突保留、bytes／inode、缺失 payload 不可還原、schema 5 升級已驗；中斷恢復接 P2.4，摘要（本機 `docs/validation/P2.3.md`） |
| P2.4 完成 | 驗證外部變更、磁碟錯誤、程序中斷與雙程序寫入競爭；整理操作結果 | `tests/system/`、寫入／trash 整合與 E2E、錯誤文案、README、D | C、B §7、R4 §8、FH3 | Windows／Linux 各 257 原生＋54 Chromium、最終正式 Compose 4 通過；真雙程序／kill／OFD proof、EXDEV／EACCES、注入 ENOSPC／EIO、owner fencing、回應遺失查詢、跨 PID namespace 恢復已驗；摘要（本機 `docs/validation/P2.4.md`） |

**P2 完成門檻：** 寫入協調基礎已可讓 P3／P5 重用；不把每次改名排成通用背景任務。FileHub 的協調不能阻止外部程式直接修改檔案，相關競態須依實測邊界回報。

## P3 可靠上傳

**目標：** 暫存內容在驗證與 finalize 完成前，不冒充完整原檔；UI 與後端都有逐項結果。

| 編號／狀態 | 要做的內容 | 預計新增／修改位置 | 參考 | 本份驗收 |
| --- | --- | --- | --- | --- |
| P3.1 已完成 | 定案 TUS 或自訂 session 協定、chunk／大小／容量／checksum／到期政策及狀態，建立持久 upload session | `modules/uploads/`、upload schema／migration、contracts、協定決策文件 | A §4／7、B §4–5、R3 §7、R4 §7、FB5、FH4 | 建立／查詢／offset／取消／完成契約一致；不能將自訂 finalize 假裝成標準 TUS；過期與重啟策略有可測案例 |
| P3.2 已完成 | 實作有 backpressure 的串流暫存、offset 驗證與 finalize 發布，套用 P2 協調與重新授權 | upload service／routes、filesystem 暫存 adapter、整合測試 | A §6–7、R5 §4、FB5、FH4 | 重送／錯 offset／超長／斷線不破壞原檔；finalize 驗大小與適用完整性；同名與撤權被阻擋；FS／DB 間失敗可恢復 |
| P3.3 已完成 | 建立上傳面板、進度／取消／重試與資料夾階層輸入 | `apps/web/src/features/uploads/`、controller、檔案列表整合、E2E | D、B §2–3、R4 §7、FB5、FH4 | 切頁不丟正在傳送狀態；逐項錯誤可理解；相對資料夾路徑驗證；空檔、長名、檔案／目錄衝突有測試；重新整理恢復依既定契約 |
| P3.4 已完成 | 到期清理、取消／finalize 競爭、重啟與容量故障驗收 | upload cleanup lifecycle、`tests/system/`、上傳 E2E／整合、README | C、B §7、FB5、FH4 | 清理只動本次／已授權暫存範圍；取消不刪已發布原檔；舊 session／重複 finalize 不重複發布；兩服務重啟後狀態正確 |

**P3 完成門檻：** 接收、暫存、驗證、發布、取消及清理都有明確 owner；以 bytes／hash 證明結果，不只檢查進度條。

## P4 搜尋預覽與衍生內容

**目標：** 可用的查找與預覽不繞過原檔授權，也不讓大量檔案或不可信內容拖垮服務。

| 編號／狀態 | 要做的內容 | 預計新增／修改位置 | 參考 | 本份驗收 |
| --- | --- | --- | --- | --- |
| P4.1 已完成 | 區分目前列表篩選與遞迴搜尋；固定深度、結果量、時間、取消及部分結果契約 | `modules/search/`、contracts、前端搜尋 controller、search 整合／E2E | A §4／7、B §1／3／7、R3 §8、R4 §12、FB6 | 無權子目錄不進結果；取消舊查詢，外部目錄消失可回報；達上限顯示截斷／部分狀態；大目錄測量有環境與數據 |
| P4.2 已完成 | 建立圖片／文字／PDF 預覽、下載 fallback、Range 與 MIME／內容安全政策 | `modules/previews/`、讀取 service、`features/previews/`、fixtures／E2E | D、B §2／5／7、R5 §7、R4 §11、FB6 | 超大／損壞／不支援檔可降級；不執行使用者 HTML／SVG／腳本；Range、下載名、斷線清理與授權每次檢查 |
| P4.3 已完成 | 建立有界縮圖產生及可重建 cache；固定內容 identity、失效、容量與 decoder 資源限制 | preview renderer／32 項與 16 MiB 記憶體 LRU、隔離子程序、系統測試；選型見 [P4 縮圖](docs/decisions/P4-thumbnails.md) | A §5／7–8、R3 §8、R5 §7、FB6 | 同路徑換檔不取錯快取；撤權不洩漏衍生檔；超大圖／惡意輸入有界；不將 CPU 工作直接塞入 API event loop，長時間預生成另列工作 |
| P4.4 已完成 | 串接列表縮圖模式，完成搜尋與預覽 UI／鍵盤／手機驗收，整理量測與失敗訊息 | files／search／preview UI 與 E2E、響應式及 fixture、D、驗證摘要 | C §7、D、R2／R6、B §2／7 | 列表與縮圖切換不遺失路徑／選取；桌面／平板／手機預覽與返回正常；載入錯誤可重試／下載；資源上限有實測紀錄，不能以少量 fixture 宣稱全部格式／效能已驗證 |

**P4 完成門檻：** 搜尋、原檔、預覽及 cache 套用同一授權邊界。若新增持久背景轉檔依賴，先將 P5 執行器基礎拆成明確前置工作並更新計畫。

## P5 持久背景工作與檔案轉移

**目標：** 長時間複製、跨磁碟搬移及 ZIP 在切頁、取消、重啟後仍有可信的逐項結果。

| 編號／狀態 | 要做的內容 | 預計新增／修改位置 | 參考 | 本份驗收 |
| --- | --- | --- | --- | --- |
| P5.1 已完成 | 在 P0 worker／P2 協調上建立 operation／item、原子 claim、lease／attempt、取消、狀態與進度節流 | `modules/operations/`、worker executor、operation schema／migration、contracts；雙程序整合／系統測試 | A §6、B §3–5、T、FH5 | 競爭下只有有效 owner；失效 owner 不更新狀態；重新領取前確認舊執行／殘留 FS I/O 已停止或轉需處置，不能只看 lease 到期 |
| P5.2 已完成 | 遞迴複製、同／跨裝置搬移與逐步恢復策略；固定跨入口／覆寫能力 | operations handlers、共用 storage／access、轉移 fixtures／測試 | A §5–7、B §5／7、R3 §6、FB4、FH3／FH5 | 複製到自身子樹拒絕；來源目的地均授權；跨裝置在副本驗證前不刪來源；撤權、來源變更、磁碟滿與部分成功可辨識，重試不盲目覆寫 |
| P5.3 已完成 | 建立 ZIP 工作、產物授權下載、到期／取消清理及壓縮資源限制 | `modules/operations/` 的 archive handler、artifact 儲存、下載契約、整合／系統測試 | A §6–7、R3 §8、R4 §9、FH5 | 封存每項重新驗權限；資源與暫存有上限；產物歸屬、到期與取消清楚；驗 ZIP 內容及中途失敗，不只檢查下載 status |
| P5.4 已完成 | 複製／剪下／目的地與衝突對話框、工作面板、逐項錯誤、取消與回查 | `features/operations/`、檔案 clipboard controller、contracts、E2E | D、B §2–3、R4 §6／9、FB4、FH5 | 切頁／重連依 operation ID 恢復；partial／cancelled 不顯示全成功；選取與剪貼簿失效會清理；重送請求去重語意已測 |
| P5.5 已完成 | 完整故障環境驗收：程序中斷、外部改檔、撤權、跨磁碟、NFS 離線與恢復 | `tests/system/`、相關 E2E、deployment limits、驗證摘要 | C、A §6–9、B §7、FH1／FH5 | 記錄測試平台／掛載與操作結果；NFS 卡住不冒充取消成功；重新啟動不重播含糊寫入；必要環境缺少時保持待驗證 |

**P5 完成門檻：** 同步 API、上傳、垃圾桶與 worker 共用寫入協調；一個 API＋一個 worker 不等於沒有跨程序競態。不引入額外 Redis 或多副本作未驗證擴充。

## P6 分享管理與發行維運

**目標：** 在核心操作穩定後加入公開分享、完整管理 UI 與可實際還原的正式發行流程。

| 編號／狀態 | 要做的內容 | 預計新增／修改位置 | 參考 | 本份驗收 |
| --- | --- | --- | --- | --- |
| P6.1 已完成 | 分享來源、secret／密碼摘要、期限、撤銷及獨立公開路由／頁面 | `modules/shares/`、share schema／migration、公開 contracts、`features/shares/`、分享 E2E | B §4–5／7、R5 §5、R4 §10、FB7、FH6 | 未登入、錯密碼、到期、撤銷、來源移動／刪除、owner 撤權及子路徑越界均測；公開存取不洩漏其他入口或 session |
| P6.2 已完成 | 完整帳號／入口／grant／個人設定 UI，沿用 P1 已有服務與 CLI 契約 | `modules/identity/`、`modules/entries/`、`features/settings/`、管理／偏好 contracts、E2E | D、B §1–2、R4 §12、FB7、FH1／FH6 | 一般帳號不能呼叫管理 API；停用／改密碼及改權限即時影響後續請求／工作；mount 仍由 OS／Compose 管理；未儲存與失敗狀態可理解 |
| P6.3 完成 | 完整備份／還原與協調升級：DB、必要金鑰設定、原檔、外部儲存一致性及工作恢復 | `maintenance/`、state flock、`compose.backup/restore.example.yaml`、完整備份操作與 Compose／system tests | A §8、C §9、FH0、B §7 | Windows 412／412、Linux 完整 421／421，最後維護專項 15／15；正式 Compose 5／5及最後受影響案例1／1；完整還原後登入／grant／原檔／trash／ZIP／upload，工作不重播，見 P6.3（本機 `docs/validation/P6.3.md`） |
| P6.4 完成 | 發行驗收與使用文件；核對全階段矩陣、版本、映像與新舊資料相容範圍 | README、0.33.0／schema 12、獨立 release project、CI job 預算、全量與受影響 E2E、發行操作／矩陣 | C §9–10、B §7、R5、FH0 | 核心 Windows 413／Linux 423、Linux Chromium 120、Windows 首輪 117＋修正後 36、最後 Linux 21；Compose 5、正式新裝／升級／回復 3、NFS＋ENOSPC 通過。未知 Python DB 拒絕與未驗環境見 P6.4（本機 `docs/validation/P6.4.md`） |

**P6 完成門檻：** 產生可重現的正式產物與已測安裝／備份／還原步驟。整體計畫完成前，須逐項核對 B §7 的跨功能矩陣及所有待驗證紀錄。

## P7 整體介面與工作空間收斂

**歷史狀態：P7 已完成 10／10 份，連同 P0–P6 共完成 43 份；交付版本 `0.39.1`／schema 12。** 本節保存當時以 U／FH7 為依據的目標與已驗結果；新的視覺要求依下方 P8，不回寫歷史驗收。8088 交付與資料核對依 P7.10。

### 目標與範圍

讓檔案內容成為主要工作區，將八組常駐控制收斂為路徑列、主要工具列、按需顯示的搜尋／選取控制；沿用既有 React／Ant Design、色票、字體及 32px 桌面控制項。設定成為有導覽的頁面，背景工作使用可收合工作抽屜，小型確認／改名／分享建立仍用 Modal。

本階段沿用 API、公開 contracts、權限、SQLite schema、檔案協調、上傳協定與工作 executor。歷史原碼不直接恢復；目錄樹、深色主題、新檔案格式、舊 DB 匯入與真實 NAS 部署不在 P7 內。若實作發現必須改後端契約或新增依賴，先更新本計畫及決策，不能混進版面整理。

### 固定的畫面目標

- 桌面維持 224px 側欄、頁首以 56px 為目標；檔案工作區取消 1120px 上限，左右 padding 24px。公開服務概覽繼續使用原閱讀寬度，不改全域 main 造成連帶影響。
- 手機內容 padding 16px，主要觸控範圍至少 44px；保留輸入字級 16px、可見焦點及完整控制名稱。標準內文仍為 14px，不以全頁縮字來塞入功能。
- 預設工具列有一個明確的主操作「上傳」及次要「新建資料夾」；檔案／資料夾上傳由同一入口選擇。排序、檢視與重新整理集中，無選取時收起批次動作；選取後在固定位置顯示可用操作與更多選單。
- 一個主要搜尋輸入配明確範圍「目前資料夾／包含子目錄」；前者仍是列表 filter，後者仍是有界遞迴搜尋。限制放說明入口，部分結果及實際錯誤仍直接顯示，不能將兩種結果混成同一列表。
- 麵包屑是主要路徑導覽；直接輸入相對路徑改為可展開的「前往路徑」，保留鍵盤及 scope 邊界。操作名稱可以精簡，但可存取名稱與錯誤語意須完整。
- 視覺驗收以同一組隔離 fixture 為準：1440×1000 的正常列表、沒有面板或錯誤展開時，表頭頂緣距視窗頂部不超過 320px，首屏至少可見 10 筆短名資料；390×844 可見表頭與至少 3 筆短名資料。1920px 另驗檔案區利用可用寬度，不新增一整套寬螢幕瀏覽器專案。
- 高度門檻在 P7.2–P7.4 逐步達成，最後由 P7.9 收斂；首屏之外仍須驗長名稱、空目錄、選取、進行中工作及錯誤，不為達門檻裁掉訊息或壓縮焦點範圍。

### 依序執行的工作

下表的前端檔名若省略前綴，一律相對 `apps/web/src/`；同組以「／」連寫的短檔名沿用前一個目錄，Workspace 指 `features/files/Workspace.tsx`、CSS 指 `styles.css`。`tests/`、`docs/`、`.github/` 與 manifests 則相對儲存庫根目錄。「擬新增」是實作時才建立的元件或測試，現在不存在，也不表示已通過驗收。每份均更新 `docs/validation/P7.<編號>.md`、本表與 D，再本機 commit、不 push。

| 工作編號／狀態 | 要改什麼 | 修改位置與產物 | 參考 | 本份驗收 |
| --- | --- | --- | --- | --- |
| P7.1 完成 | 工作空間殼層、寬度、標題與間距；先保存同 fixture 的舊畫面，再限制 CSS 影響範圍，讓檔案區延展 | `apps/web/src/styles.css`、`features/files/Workspace.tsx`、`theme/index.ts`；新增 `features/files/WorkspaceShell.tsx`、`tests/e2e/workspace-layout.spec.ts`；基線與新截圖 | D、U、FH7；現有 `workspace.spec.ts`／`smoke.spec.ts` | 1440／800／390px 及 1920px 專項；檔案區無舊 max-width 截斷、無外層橫捲，公開概覽／登入／公開分享維持原閱讀寬度；URL、入口與 controller 生命週期不變；已驗結果見 P7.1（本機 `docs/validation/P7.1.md`） |
| P7.2 完成 | 合併主要工具列、主次動作、排序／檢視／重新整理；麵包屑與可展開路徑輸入；合併上傳入口 | `features/files/Workspace.tsx`、`features/uploads/UploadPanel.tsx` 的 UploadPicker、CSS；新增 `features/files/FileToolbar.tsx`／`PathNavigation.tsx`；更新 `workspace`／`files-write`／`uploads` E2E | D、U、FH7；P1.4、P2.2、P3.3 決策 | 主操作清楚，兩種上傳與新建皆接既有流程；長路徑可讀、Escape／焦點返回正確、無權操作不能送出；切換檢視、排序與路徑不丟失既定 URL／選取語意；已驗結果見 P7.2（本機 `docs/validation/P7.2.md`） |
| P7.3 完成 | 將目錄篩選／遞迴搜尋整理為一個入口與範圍選擇；清楚分開結果、載入、取消與部分結果說明 | `features/search/SearchPanel.tsx`、`features/files/Workspace.tsx`／`navigation.ts`、CSS；新增 `features/search/SearchControls.tsx`；更新 `search.spec.ts`／`workspace.spec.ts` | D、U、P4-search 決策、`lib/useResource.ts` | 用相同關鍵字驗目前目錄／含子目錄範圍不同；清除、切範圍、改路徑及返回不留下舊結果；filter URL／版本分頁仍正確；晚回應／401／partial 不被隱藏；已驗結果見 P7.3（本機 `docs/validation/P7.3.md`） |
| P7.4 完成 | 情境選取工具列、列表／縮圖密度、列內操作與更多選單；合併重複或常駐停用動作 | `features/files/Workspace.tsx`、`styles.css`；新增 `features/files/SelectionToolbar.tsx`／`FileListing.tsx`／`ResourceActions.tsx`；更新 `workspace`／`files-read`／`files-write`／`operations`／`thumbnails`／`shares` E2E | D、U、P1.4／P4.4／P5.4 決策；`ResourceSchema` 能力欄位 | 未選取／單選／多選主次清楚且不大幅跳版；既有資料夾單擊與鍵盤開啟不變；第 2 頁、切入口、撤權、衝突及真實下載仍正確；Windows 可選來分享不代表可寫入；無面板時達首屏門檻；已驗結果見 P7.4（本機 `docs/validation/P7.4.md`） |
| P7.5 完成 | 全域導覽、帳號選單、手機 Drawer；將設定／分享／回收筒與檔案工具列分工，工作入口保持可見 | `features/files/WorkspaceShell.tsx`／`Workspace.tsx`、CSS；新增 `features/files/WorkspaceNavigation.tsx`／`app/AccountMenu.tsx`；更新 `workspace`／`settings`／`shares`／`trash` E2E | D、U、FH7 的 WorkspaceShell；P1.4／P6.2 規範 | 所有導覽連到已存在且可用的流程，過渡階段仍開啟原設定／分享／回收介面；沒有假連結。角色可見性、當前入口／scope、手機選單、Tab／Escape／焦點及登出失敗重試通過；設定移頁在下一份處理；已驗結果見 P7.5（本機 `docs/validation/P7.5.md`） |
| P7.6 完成 | 將大型設定從 Modal 改為有導覽的設定頁；保留個人、帳號、儲存授權表單與離開保護 | `features/settings/SettingsDialog.tsx`／PersonalSettings／AccountSettings／StorageSettings、`features/files/Workspace.tsx`／`navigation.ts`、`app/App.tsx`、CSS；新增 `features/settings/SettingsPage.tsx`、`apps/web/tests/unit/navigation.test.ts`；更新 `settings.spec.ts` | D、U、FH7 §47、P6-settings 決策、公開設定契約 | 私有設定 URL 可刷新、返回與深連結；member 不見管理區且直接 API 仍受後端保護。未儲存草稿、儲存失敗、停用／角色／改密碼、登出與瀏覽器返回有明確行為；跨頁上傳／工作 controller 不被重建；已驗結果見 P7.6（本機 `docs/validation/P7.6.md`） |
| P7.7 完成 | 統一上傳與背景工作的工作抽屜；真實狀態摘要、收合、清單及按需展開的細節，避免面板推移檔案列表 | `features/uploads/UploadPanel.tsx`、`features/operations/OperationPanel.tsx`、Workspace、CSS；新增 `features/tasks/TaskDrawer.tsx`；更新 `uploads.spec.ts`／`operations.spec.ts` | D、U、P3.3–P3.4、P5-workspace 決策及兩個 controller | 抽屜關閉／切頁不停止或重送工作，重開可看最新狀態；進度以 committed bytes／後端狀態為準，取消中／部分完成／needs_review 明確；401 dispose、回應遺失查同 ID、File 不入 storage、Modal 草稿保留皆回歸；已驗結果見 P7.7（本機 `docs/validation/P7.7.md`） |
| P7.8 完成 | 收斂分享管理／回收筒管理頁、預覽／短對話框及公開頁的一致外觀；保留各自安全邊界 | `features/shares/`、`features/trash/`、`features/previews/PreviewDialog.tsx`、`features/files/WriteDialog.tsx`／Workspace／navigation、`features/auth/Login.tsx`、CSS；新增 `features/shares/ShareManagementPage.tsx`／`features/trash/TrashPage.tsx`；更新 `shares`／`trash`／`previews`／`preview-navigation`／`files-write` E2E | D、U、P2-trash、P4-previews、P6-sharing 決策 | 大清單有頁面空間、短操作保留 Modal；回收 owner／還原衝突、分享期限／撤銷／公開授權、預覽降級／Escape／返回焦點仍正確；公開分享不請求身份 session，不把秘密寫入頁面導覽或 storage；已驗結果見 P7.8（本機 `docs/validation/P7.8.md`） |
| P7.9 完成 | 整體視覺收斂與跨功能回歸，檢查每份成果組合後是否仍一致 | 全部受影響前端與 `tests/e2e/`；`tests/e2e/workspace-layout.spec.ts`、`playwright.config.ts`／`.github/workflows/ci.yml`（僅必要矩陣／整批預算調整）、DESIGN；`docs/validation/P7.9.md` 與合成資料截圖 | 本節門檻、D、U、C、P6 功能矩陣 | Windows 與隔離 Debian `pnpm check`／完整 Chromium；1440／800／390px 與 1920px 專項。逐張檢視所有畫面情境，單獨報告首輪及修正回歸，不把多輪相加；不以改 screenshot 或擴 timeout 掩蓋問題；未驗平台保留界線；已驗結果見 P7.9（本機 `docs/validation/P7.9.md`） |
| P7.10 完成 | 建正式 image、驗 Compose／發行，再保留資料更新本機 8088 試用，實際交付可操作分頁 | 根版本／workspace manifests／Docker label／Compose 版本同步；`docs/operations/local-preview.md`、README、`docs/validation/P7.10.md`；本機忽略的 `.env` 只記 image／Origin 等設定 | C、P6.3／P6.4、部署／完整備份／發行操作 | 本版正式 image 的 Compose／release 通過；保留舊 image，先停兩服務、完整備份與隔離驗還原，再以同一新 image 更新 API／worker／migration。8088／Origin 一致、healthy／ready、原帳密／入口／原檔保留；在使用者瀏覽器實際看見新版並登入，其他服務身分／啟動時間未變；已驗結果見 P7.10（本機 `docs/validation/P7.10.md`） |

### 實作前固定的狀態與導覽契約

1. **持續工作由 Workspace 擁有。** UploadController／OperationController 在設定／分享／回收頁及抽屜開關之間保持同一 instance；只在身份失效或 Workspace 真正卸載時 dispose。返回檔案仍使用原 entry／scope／path／sort／filter／版本分頁，既有選取清除規則維持。
2. **沿用根路徑 query，不擴大伺服器 fallback。** P7.6 採 `/?view=settings&section=personal|accounts|storage`，P7.8 增加 `/?view=shares` 與含 entry 的 `/?view=trash`；私有頁保留檔案 query 作返回上下文，缺少 view 視為 files。無權設定 section 要顯示拒絕或導回個人設定，不請求管理資料。所有非公開頁仍由 SessionApp／Workspace 管理。
3. **公開入口保持獨立。** `?share=<id>#<secret>` 的優先順序、公開 Cookie／API 與 `?view=status` 不混入私有導覽。服務狀態連結使用新分頁，避免為看狀態卸載正在工作的 Workspace；未知 `/api/*` 仍為 JSON 404，不新增任意 SPA catch-all。
4. **草稿與離開有一個共同規則。** 表單 dirty、送出中、失敗重試及完成回饋保持可辨識；側欄、設定 section、返回、登出等站內轉換使用一致 guard。整頁離開採瀏覽器標準保護，取消返回不得造成歷史循環。短操作 Modal 沿用 afterClose 返回焦點，不因背景刷新卸載草稿。
5. **視覺隱藏不能代替權限。** 操作仍依目前 canBrowse／canDownload／canWrite／canCopy／canShare 及入口／工作能力決定；狀態變動需重查，公開能力與權限不因更多選單或小螢幕而放寬。取消、衝突、未知結果與既有工作 UUID 行為不變。

### 每份驗證、版本與交付方式

- P7.1 先以至少 60 項的合成 fixture 保存正常、長名稱、混合檔案／資料夾的三視窗基線，後續沿用同一資料條件。首屏門檻用正常短名資料，不拿只有一筆檔案的畫面宣稱密度已驗。
- P7.1–P7.8 先跑受影響的 typecheck／lint／build、必要單元及對應 E2E；純 CSS 不為實作細節寫鏡像測試。變更導覽、搜尋、選取或 controller 生命週期時，以行為測試確認取消／晚回應／權限／焦點與資料副作用。Linux 專屬寫入用隔離 Linux fixture，不用 Windows disabled 案例替代。
- 可沿用既有入口：`pnpm typecheck`、`pnpm lint`、`pnpm build`、`pnpm test:e2e:run workspace.spec.ts`；需要其他案例就列出實際 spec。獨立 E2E 前先 build；主機資產建置不可與正在使用該資產的測試並行。
- P7.9 以 `pnpm verify:core` 作兩平台完整回歸入口；`workspace-layout.spec.ts` 是 P7.1 擬新增案例，納入既有三個 Chromium projects。沿用 1 browser worker、零 retry 與 30 秒單 case，若案例數增加需調整整批預算，記錄依據；GitHub hosted jobs 仍只有實際執行後才報成功。
- P7.10 依序使用 `pnpm test:compose:build`、`pnpm test:compose:run`、`pnpm test:release`；release 所需的 0.29.0 fixture image 與本次更新前 0.33.0 image 均保留。UI-only 不例行重跑 NFS 故障；若改到儲存或執行器，先擴充計畫與必要驗證。
- 版本只在實質程式變更時依 SemVer 增加：外觀修正通常 PATCH，新增相容的導覽／操作流程按 MINOR 評估；依既有規則同步 package 與 image 版本。這次規劃文件不增版，也不預填尚未發行的版本。
- 每份都有獨立驗證摘要、實際修改位置、畫面檢查與未驗界線，驗證後以工作編號 commit，例如 `fix(P7.1): ...`；不 push。先完成前一份再開始下一份，較大工作可按既有規則拆成子份，不把整個 P7 混成一次提交。
- P7.10 的本機試用資料不是測試 fixture：保留 `filehub_state`／`filehub_files`／`filehub_cache`，不重建帳號或清空 DB，不清理舊站聊天。密碼、Cookie、分享秘密、真實 DB／備份與使用者畫面不放 Git；驗收輸出只用合成或遮蔽資料。

**P7 完成門檻：** 十份均有驗收摘要與本機 commit；功能回歸、同條件畫面比對、首屏密度／主次操作／鍵盤／響應式檢查及正式 image／本機分頁交付皆通過。工具或環境不足時保留對應工作為待驗證，不能只憑 screenshots 檔案存在、HTTP 200 或歷史 P6 數字宣稱完成。

## P8 File Browser 畫面還原

**狀態：10／10 份完成。** P8.1–P8.10 的全部既有畫面、三檢視／schema 13、兩平台完整回歸、正式 image／發行與 8088 保留資料交付已驗證，版本 0.40.6。

### 範圍與固定目標

- 使用 V 的固定 commit、原圖與量測，還原頂列／側欄、三種檢視、選取、搜尋、短浮層、預覽、登入、設定、分享及上傳；FileHub 特有的多入口、垃圾桶與持久工作依同一視覺語言延伸。
- 桌面頂列橫跨全頁、高 64px；側欄 256px，800px 視窗為 160px，≤736px 為可收合側欄。桌面搜尋約 400×47px，麵包屑高 48px，檔案 main 起點約 x=288px／平板 x=192px，右側 16px。中文及額外入口可合理調整，差異須寫明。
- Roboto／中文 fallback、Material filled 類型圖示、主藍 `#2196f3`、資料夾 `#1d99f3`、背景 `#fafafa`、16px 內文；正常詳細列約 65px、圖示 32px，圖磚圖示 64px、圖庫圖像區 192px。直接取用資產先完成授權、來源與修改紀錄，產品維持 FileHub 品牌。
- 列表／圖磚／圖庫均納入，不再要求使用者選其中一種。既有 `thumbnails` preference 對應圖庫，保留舊值；P8.3 才新增 `mosaic` 及必要 migration，不強制覆蓋使用者偏好。
- 桌面動作集中於頂列、選取呈藍底白字；手機更多選單與底部選取列。保持原資料夾開啟語意，選取模式可鍵盤操作且有完整名稱，不能照搬全域移除 outline 或以顏色作唯一狀態。
- 短操作浮層採 2px 圓角、窄版置中與平面按鈕；現有安全預覽改全畫面。設定採橫向分頁與卡片，上傳／工作採右下浮動面板、手機底部全寬。浮動區不得遮住最後一項或與選取列互蓋。
- API／worker、session／CSRF、grant、原子寫入、垃圾桶、upload protocol、工作 ID／保守恢復保持既有契約。明確例外為 P8.3 的第三種檢視偏好；其他必要契約調整先列子工作並驗證，不暗中擴充。
- 來源的編輯儲存、CSV 表格 renderer、影音／EPUB、tar、格式搜尋捷徑、深色切換、開放註冊與 shell 僅列參考；P8 不加入未有產品契約的功能或假按鈕。FileHub 原有格式限制、PDF.js 第一頁及公開身份分離維持。

### 依序執行的工作

下表省略前綴的前端路徑皆相對 `apps/web/src/`；`packages/`、`apps/server/`、`tests/`、`docs/` 相對根目錄。「擬新增」檔案在對應實作時才建立。每份完成後更新 `docs/validation/P8.<編號>.md`、D、相關操作文件與本表，驗證後本機 commit，不 push。

| 工作編號／狀態 | 要改什麼 | 修改位置與產物 | 參考 | 本份驗收 |
| --- | --- | --- | --- | --- |
| P8.1 完成 | 套用視覺 token、字體與統一圖示；保留本版同 fixture 的基線；建立實際取用資產的來源／授權紀錄 | `theme/index.ts`、`app/Providers.tsx`、`app/ToolIcon.tsx`、`styles.css`；必要時擬新增 `assets/` 與 `THIRD_PARTY_NOTICES.md`；`docs/decisions/P8-visual-system.md` | V §3–6、D、FB8、上游 LICENSE；既有 theme／build 與 smoke | 實際字型／圖示載入且無外站請求，中文 fallback 正確；逐項保存授權與修改聲明，不能只指向上游 repo。token／AntD portal 一致，登入／工作區／設定的三視窗基線與變更均逐張檢視；typecheck／lint／build、對應 smoke 通過；結果見 P8.1（本機 `docs/validation/P8.1.md`） |
| P8.2 完成 | 全寬頂列、搜尋位置、下方側欄、麵包屑及功能入口；移除檔案頁重複標題，建立手機頂列／側欄 | `features/files/WorkspaceShell.tsx`、`WorkspaceNavigation.tsx`、`Workspace.tsx`、`FileToolbar.tsx`、`PathNavigation.tsx`、`app/AccountMenu.tsx`、CSS；`workspace-layout`／`workspace-navigation`／`settings-navigation` E2E | V 的桌面／平板／手機、FB3／FB8／FB9、P7 導覽與 controller 契約 | 1440／800／390px 及 1920px 專項對照頂列、側欄、main 起點與路徑列；真實入口／scope／分享／垃圾桶／設定可達，窄側欄可捲且無外層橫溢。Tab／Escape／返回焦點、dirty guard、根 query 與持續 controller 不變；結果見 P8.2（本機 `docs/validation/P8.2.md`） |
| P8.3 完成 | 詳細列表、橫向圖磚及大圖庫；一致檔案圖示、長名與排序；持久偏好新增第三模式 | `features/files/FileListing.tsx`／`Workspace.tsx`／`FileToolbar.tsx`、`features/previews/Thumbnail.tsx`、`features/settings/PersonalSettings.tsx`、CSS；`packages/contracts/src/settings.ts`、server settings／schema、新增 Drizzle migration／metadata；既有 preference／navigation／DB／thumbnails E2E | V 三種模式、FB3／FB8、P4 預覽、P6 settings；現有 `preferences_view` CHECK | 用同一 66 項 fixture 驗三模式、長名、空目錄、分頁、選取及安全縮圖。舊 `list`／`thumbnails` 偏好／筆數保存，新增 `mosaic` 通過 API runtime schema／DB CHECK，非法值拒絕；舊 schema 12 fixture 升級／備份回復驗證。不得重寫已套用 migration；本份獨立做契約與資料回歸，結果見 P8.3（本機 `docs/validation/P8.3.md`） |
| P8.4 完成 | 搜尋展開與返回、頂列情境動作、右鍵／更多選單及手機底部選取列；取消常駐 checkbox／逐列操作欄的外觀 | `features/search/SearchControls.tsx`／`SearchPanel.tsx`、`features/files/SelectionToolbar.tsx`／`ResourceActions.tsx`／`FileListing.tsx`／`Workspace.tsx`、CSS；`search`／`files-read`／`files-write`／`workspace-states` E2E | V 搜尋／選取／右鍵／手機畫面、FB6／FB9、P4-search、P5-workspace | 未選／單選／多選、取消與鍵盤選取模式可操作，原資料夾開啟語意不變；操作來自同一能力／版本選取。filter 與遞迴範圍明示，partial／401／晚回應不被遮蔽；右鍵所有功能亦可用鍵盤，手機不遮最後一項，無假格式捷徑；結果見 P8.4（本機 `docs/validation/P8.4.md`） |
| P8.5 完成 | 短對話框外觀與目的地選擇、全畫面圖片／文字／PDF 預覽及降級 | `features/files/WriteDialog.tsx`、`features/operations/DestinationDialog.tsx`／`DestinationBrowser.tsx`、`features/previews/PreviewDialog.tsx`、`features/shares/ShareDialog.tsx`、`features/trash/TrashPanel.tsx`、CSS；`files-write`／`operations`／`previews`／`preview-navigation` E2E | V 各浮層／預覽、FB4／FB6／FB9、P2／P4／P5 決策 | 置中短表單與全畫面內容分流，三視窗有可達標題／關閉／footer，長名可讀；Escape／焦點返回及草稿保留。真實不覆寫衝突、UUID 不重送、取消／未知狀態不變；預覽仍借用安全 binary／PDF renderer，內容不轉成 HTML，無編輯／播放器假控制；結果見 P8.5（本機 `docs/validation/P8.5.md`） |
| P8.6 完成 | 登入、公開分享的密碼／單檔／資料夾頁，以及公開狀態／錯誤的樣式 | `features/auth/Login.tsx`、`features/shares/PublicShare.tsx`、`app/SystemOverview.tsx`、CSS；`workspace`／`shares`／`smoke` E2E | V 登入／公開頁／錯誤、FB1／FB7／FB9、P6-sharing | 窄版置中登入與短錯誤、簡單公開 metadata／下載卡；桌面／手機完整可用。密碼前不漏名稱，公開頁不讀身份 API、不帶私有導覽，secret fragment 不入 storage／query／截圖；撤銷／失效／下載仍走正式 API，狀態頁 ready／錯誤／重試真實；結果見 P8.6（本機 `docs/validation/P8.6.md`） |
| P8.7 完成 | 設定、帳號／儲存授權表單、分享管理與垃圾桶頁統一橫向分頁／卡片／表格 | `features/settings/ManagementNavigation.tsx`／`SettingsPage.tsx`／PersonalSettings／AccountSettings／StorageSettings、`features/shares/ShareManagementPage.tsx`、`features/trash/TrashPage.tsx`／TrashPanel、CSS；`management-layout`／`settings`／`settings-navigation`／`private-pages`／`shares`／`trash` E2E | V 設定／帳號／分享管理、FB7／FB9、P6-settings、P2-trash | 桌面雙欄／手機單欄，長分頁可達、只表格內橫捲，短浮層依 P8.5；角色與直接 API 拒絕、dirty／busy guard、儲存失敗保草稿、密碼／角色失效與還原衝突回歸。保留 opaque candidates／grant，不加來源主機路徑表單或公告；結果見 P8.7（本機 `docs/validation/P8.7.md`） |
| P8.8 完成 | 上傳／背景工作改右下可收合面板，手機底部全寬；摘要、分區與詳細狀態 | `features/tasks/TaskDrawer.tsx`、`features/uploads/UploadPanel.tsx`、`features/operations/OperationPanel.tsx`、Workspace、CSS；必要時擬新增共用呈現元件；`task-drawer`／`uploads`／`operations` E2E | V 上傳三種狀態、FB5／FB9、P3／P5 controller、P7.7 | 真實傳送中／驗證／完成／取消／needs_review，收合／切頁不丟 File、不重送且不 dispose；committed 進度與發布確認仍正確。手機面板與選取列不互蓋，關閉不取消，開啟不奪其他 Modal 焦點；回應遺失只查同 ID；結果見 P8.8（本機 `docs/validation/P8.8.md`） |
| P8.9 完成 | 全頁面整合視覺比對與跨功能回歸，逐項記錄共同外觀及必要差異 | 全部受影響前端與 `tests/e2e/`，共用 EmptyState／既有 26 份 spec 與 fixture；DESIGN、`docs/validation/P8.9.md` 與三視窗合成截圖 | V 全畫面矩陣、D、C、P6／P7 功能與安全基線 | Windows／隔離 Debian `pnpm verify:core`；三種檢視、所有既有私有／公開頁、主要浮層與空／錯誤／唯讀／選取／進行中狀態逐張對照。1440／800／390px 與 1920px 專項，零 retry；不以隱藏錯誤、縮字或假資料達標。按本節共同視覺門檻結案，未測平台保留界線；依 P8.9（本機 `docs/validation/P8.9.md`）及[差異矩陣](docs/reviews/filebrowser-visual-acceptance.md) |
| P8.10 完成 | 正式 image、Compose／發行及保留資料的 8088 交付；驗 P8.3 schema 升級與回復 | 根版本／workspace／Docker／Compose、`tests/release/` 的 schema 12 升級 fixture、部署／備份操作、`docs/validation/P8.10.md`、local-preview／README | C、P6-maintenance／release、P7.10、P8.3 migration、V | 本版 `test:compose:build`／`test:compose:run`／`test:release`；保留原 image，停雙服務、完整備份並在新目標驗還原，使用 schema 12 舊 image fixture 驗偏好與資料保留／原快照回復。既有 0.29.0 發行 fixture 仍保留。更新三角色同一 image，實際使用者分頁檢視與操作新版，原帳密／入口／原檔及其他服務未變，絕不清理試用 volumes；結果見 P8.10（本機 `docs/validation/P8.10.md`） |

### 畫面與驗證的共同完成門檻

1. **同條件比較。** 沿用 P7 的 66 項 fixture 驗密度，另有與 V 相同類型的短名／長中文／圖片／PDF／空目錄資料。每份保存上游參考圖、FileHub 改前／改後、視窗、字型與平台；原圖不可修圖，秘密只在擷取時遮蔽並記錄。
2. **還原可量測。** 共同殼層以頂列 64px、側欄 256／160px、麵包屑 48px、正常列 65px 為目標；允許字形／像素 rounding 約 2px，差異超出須有具體原因。比較圖示大小、文字、色票、選取、陰影、動作位置與留白，不以 CSS 值正確代替整頁檢視。
3. **密度不壓過內容。** 正常詳細列表 1440×1000 表頭頂緣目標約 112px，加入必要能力／入口狀態後上限 224px，首屏至少 10 筆；390×844 至少 3 筆。圖磚／圖庫按 V 的卡片比例，手機可單欄，不拿列表門檻硬壓圖庫。長名稱／錯誤／面板另外驗，不為達門檻裁掉內容。
4. **差異有明確歸屬。** 品牌、繁中、FileHub 額外入口／工作狀態、安全 renderer 等合理差異列入驗收表；沒有對應功能的來源控制明示未納入。不得把本來不一樣的互動寫成「已完全照抄」。
5. **工程測試按切片。** P8.1–P8.8 跑 typecheck／lint／build、實際受影響的單元／E2E；純外觀不寫鏡像測試。P8.3 額外跑契約／DB migration／偏好持久測試，P8.9 跑兩平台完整集合，P8.10 跑發行及資料交付。只有改到儲存／executor 才擴至 NFS 故障驗收。
6. **版本與提交。** 純文件不增版；實質程式依 SemVer 同步根／workspace／image，新增第三模式及公開契約按相容功能評估 MINOR，外觀修正按 PATCH。每份驗證後以 P8 編號 commit，Git 僅保存合成資料與必要遮蔽證據，不 push。

**P8 完成門檻：** 十份全部驗證、逐張視覺比對及本機 commit，正式 image／migration／還原與使用者實際分頁交付通過。這次的 65 張 File Browser 參考畫面不能代替未來 FileHub 的實作驗收。

## P9 視覺層級與一致性

**狀態：9／9 份完成，正式映像與 8088 保留資料交付通過。** 使用者已核准[設計 N](docs/reviews/p9-design-review.md)及[獨立預覽](docs/design/P9/README.md)，並授權依序實作、每份驗證後本機 commit，不 push。設計檢查見 P9-design（本機 `docs/validation/P9-design.md`），不計入產品完成數；8088 於 P9.9 驗證與保留資料交付。

### 目標與保存契約

- 方向為「沉靜藍的檔案工作區」：深色檔名、可讀的次要資訊、沉穩藍色操作、淡藍選取、中性分區及一致表單。維持 File Browser 的熟悉結構，P9 的數值與畫面按 N 驗收，P8 的證據不回寫。
- 目前單一 palette／ConfigProvider／自有 CSS variables 繼續使用。保留現有本機字型／Material 圖示及授權；不新引入 UI library、遠端字體、深色主題、裝飾圖或動畫依賴。
- 前端呈現調整不改 API／DB／schema／migration、授權、session／CSRF、原子寫入、垃圾桶、upload protocol、operation recovery 或安全預覽。三檢視與偏好值不變；若發現必須改契約，先另列子工作與理由，不能夾帶。
- Workspace 持續擁有上傳／工作 controller；導覽、搜尋 portal、URL／guard、draft、version selection、actionsFor、公開身份與 fragment 邊界不變。正式版所有分享／垃圾桶／管理入口保留，不能依預覽的有限場景刪功能。
- CSS 隨 owning component 切片整理，將同一狀態的適用宣告收斂回既有區域；不在檔尾再追加另一套全站 P9 override，不一次刪除全部歷史樣式。

### 依序執行的工作

所有路徑未列完整時相對 `apps/web/src/`；測試相對根目錄。每份輸出 `docs/validation/P9.<序號>.md`、改前／改後合成原圖及本機 commit；未做的檢查明列，不先建空白 PASS 文件。

| 工作／狀態 | 要改什麼與輸出 | 修改位置 | 先讀參考／前置 | 驗收重點 |
| --- | --- | --- | --- | --- |
| P9.1 完成 | 共用色彩、字體層級、控制／邊界／圓角與焦點；盤點並整理重複的 owning style。保留 0.40.6 同 fixture 基線；建立 P9 token 決策 | `theme/index.ts`、`app/Providers.tsx`、`styles.css` 的 theme／基礎與共用控制；`tests/e2e/visual-system.spec.ts`；`docs/decisions/P9-visual-system.md` | D、N §2–3／5、P8.1、`docs/decisions/P8-visual-system.md`；P8.10 完成 | 文字／按鈕實際對比、selected／hover／focus／disabled、字體載入與中文、AntD portal 一致；登入／列表／設定三視窗檢視。這份僅改共用基礎，不提前改 shell 或 controller；結果見 P9.1（本機 `docs/validation/P9.1.md`） |
| P9.2 完成 | 整理私有頂列、側欄、標題／路徑與局部工具：上傳／新建有文字，工作／帳號有明確入口；手機搜尋與工具優先序 | `features/files/WorkspaceShell.tsx`、`WorkspaceNavigation.tsx`、`Workspace.tsx`、`FileToolbar.tsx`、`PathNavigation.tsx`、`app/AccountMenu.tsx`；CSS；`workspace-layout`／`workspace-shell`／`workspace-navigation`／`settings-navigation` E2E | N §4–6、P9.1、P8.2／P8.4、既有 `navigation.ts`／`useLocation` | 1440／800／390 與 1920px 布局；具權限的主操作、前往路徑／排序／檢視及全部導覽可達；Tab／Escape／返回焦點、dirty guard、根 query／controller 不變。工作入口先重用原 TaskDrawer open 狀態，不另建一份 state |
| P9.3 完成 | 列表 52px 短列／手機摘要、名稱層級、圖磚／圖庫 placeholder、淡藍選取及情境選單；桌面選取列替換局部工具，手機保留底部列 | `features/files/FileListing.tsx`、`ResourceActions.tsx`、`ResourceMenu.tsx`、`SelectionToolbar.tsx`、`features/previews/Thumbnail.tsx`；CSS；`file-views`／`file-context`／`workspace-layout`／`workspace-states`／`files-read` E2E | N §3–6、P9.2、P8.3／P8.4、P4 安全縮圖 | 同一 66 項／50 筆分頁、三模式、長名／空／readonly；排序、版本選取、切模式不清選取、鍵盤／右鍵／更多可用；首屏密度與選取位移達下節。縮圖錯誤／重試不隱藏，不新增 preference migration |
| P9.4 完成 | 搜尋範圍／結果與 partial 層級、共用短表單／目的地／分享／回收確認；全畫面預覽的工具與資訊一致 | `features/search/SearchControls.tsx`／`SearchPanel.tsx`、`features/files/WriteDialog.tsx`、`features/operations/DestinationDialog.tsx`／`DestinationBrowser.tsx`、`features/shares/ShareDialog.tsx`、`features/previews/PreviewDialog.tsx`、`features/trash/TrashPanel.tsx`；對應 search／writes／operations／previews E2E | N §4–5、P9.3、P8.4／P8.5、P2／P4／P5 決策 | scope／filter／partial／401／晚回應、長表單捲動與 footer、Escape／返回／草稿；目的地授權、不覆寫與 UUID 恢復不變。原始內容仍用安全 renderer，不以 HTML 模仿內容或增加假工具 |
| P9.5 完成 | 設定、帳號、儲存授權、分享管理、垃圾桶統一標題／卡片／表格／原生 select／提交層級 | `features/settings/ManagementNavigation.tsx`／`SettingsPage.tsx`／`PersonalSettings.tsx`／`AccountSettings.tsx`／`StorageSettings.tsx`、`features/shares/ShareManagementPage.tsx`、`features/trash/TrashPage.tsx`／`TrashPanel.tsx`；CSS；management-layout／settings／private-pages／shares／trash E2E | N §4–5、P9.4、P8.7、P6-settings／P2-trash | 桌面雙欄／窄版單欄、只分類／表格容器內橫捲、管理與 member 差異；query 深連結／back、dirty／busy／儲存失敗保草稿、撤權／密碼失效、還原衝突與 opaque candidate 均回歸 |
| P9.6 完成 | 登入明確 label 與可讀寬度、公開單檔／資料夾／密碼頁及狀態頁；公開頁取消無內容側欄，減小裝飾圖示 | `features/auth/Login.tsx`、`app/PublicShell.tsx`、`features/shares/PublicShare.tsx`、`app/SystemOverview.tsx`；CSS；workspace／shares／smoke E2E | N §4–5、P9.5、P8.6、P6-sharing | 成功／載入／錯誤／失效／readonly；手機短頁與長名；密碼前不漏名稱、公開不呼叫私有身份、fragment 不遺失／不入 storage／截圖；服務狀態及重試真實，不加註冊或新登入方式 |
| P9.7 完成 | 工作入口 0／進行中／待確認、浮卡密度與狀態色；空目錄／無結果／無工作／錯誤的一致性 | `features/tasks/TaskDrawer.tsx`、`features/uploads/UploadPanel.tsx`、`features/operations/OperationPanel.tsx`、Workspace／header slot、`app/EmptyState.tsx`；CSS；task-drawer／task-dock-layout／uploads／operations／workspace-states E2E | N §4–5、P9.6、P8.8／P8.9、P3／P5 controller 契約 | 無工作不出浮卡但有可達入口；進行中／待確認有文字；手動聚焦、Escape 返回、新項目不搶 Modal；切頁／隱藏不重建 controller，committed／unknown／needs_review 不省略。手機選取＋工作與最後一列可達性實測 |
| P9.8 完成 | 完整視覺／可存取性與跨功能驗收；依候選規格逐張審查並記必要差異 | 全部受影響前端、既有 `tests/e2e/`；必要的對比／reflow assertion；DESIGN、`docs/validation/P9.8.md`、已新增 `docs/reviews/p9-visual-acceptance.md` | N、D、C、P9.1–P9.7、P8.9 功能基線 | Windows／隔離 Debian `verify:core`，三視窗全頁面／三檢視／主要浮層及狀態原圖；1920px／320px 寬／短手機、真實 200% zoom、鍵盤／focus／reduced-motion、對比。零 retry；保存原失敗與修復，不直接覆寫 baseline 掩蓋差異 |
| P9.9 完成 | 正式 image、Compose／release、完整備份／隔離還原及 8088 保留資料交付 | 發行版本一致性、Docker／Compose、`tests/release/`、`docs/validation/P9.9.md`、`docs/operations/local-preview.md`／release、README | P9.8 完成；P8.10、P6-maintenance／release 與 full-backup 流程 | 本版正式 image 同源、Compose／release；仍驗保留的 schema 10／12 升級與原快照回復。停雙服務、完整備份並於新目標還原，原帳密／入口／檔案／三 volumes／其他服務保留；再驗實際分頁，沒有實際操作就保留交付界線 |

### 共同比對與完成門檻

1. **先驗產品，再記完成。** N 的原型是候選方向，不具實際 API／身份／grant／controller；不能搬原型資料、有限示意動作或 PNG 當實作。P9.1–P9.7 每份跑 typecheck／lint／build、相關真實 E2E 與人工畫面／焦點檢查，沒有新行為不寫鏡像 unit tests。
2. **同資料同視窗。** 使用 66 項合成 fixture，1440×1000／800×1024／390×844、light／scale 1，先等實際字體／內容。保存 P8.10 基線 commit、P9 候選及正式改前／改後；preview 最上方審查列不進產品，尺寸從產品 viewport 計算。
3. **幾何及可讀性。** 桌面表頭 y≤224px、至少 13 筆正常短列完整可見；手機 y≤320px、至少 6 筆。長名、真錯誤、partial 及展開工作不套正常密度門檻，也不為達標隱藏它們。桌面選取位移≤4px，手機底列不得遮住最後一列；主要手機 hit area≥44px、input 16px。
4. **狀態及色彩。** 一般文字／主要按鈕實際對比≥4.5:1；邊界／焦點依適用的非文字門檻另驗。selected、hover、focus、disabled、loading、empty、error、partial、readonly 均有規格與畫面；不只比較正常列表，也不將幾組色票通過稱為完整 WCAG 驗證。
5. **驗證範圍。** P9.8 跑完整兩平台核心與 Chromium，逐項記錄新視覺與必要差異；P9.9 才建正式 image、發行／還原／交付。未觸及 storage／executor 不重跑 NFS 故障驗收，未驗瀏覽器／裸機／NAS 仍保留界線。
6. **版本與提交。** 本次研究／原型不改產品版本。第一份產品修正預期為 `0.40.7`，依實際變更套用 SemVer，版本／images 一致性按既有規則；不得先宣告未發布版本。每份以 `fix(P9.1): ...` 等編號本機 commit，不 push。

## 每份工作共同完成條件

- 本份功能契約、實作與實際檔名一致；新增資料表附已審 migration，公開 DTO 不含 DB entities／主機路徑／秘密。
- 依本份內容執行必要的單元／整合案例，覆蓋正常與必要失敗分支；FS／DB 副作用檢查實體結果。真實 TCP、瀏覽器、雙程序與環境測試按適用範圍執行，純文件與設定依 C 的適用檢查處理。
- 型別檢查、lint、受影響 build 與必要安全／權限回歸通過；UI 實際檢視桌面、平板、手機與鍵盤，不能只看編譯成功。
- fixture、埠、帳號及清理 ownership 隔離，不碰真實使用者資料；驗證紀錄不包含秘密或無關擷取內容。
- 依實際程式變更更新 SemVer；純文件不增加版號。同步 README、主計畫、架構／流程、AGENTS／MEMORY 與適用的 DESIGN。
- `git diff --check` 與 staged scope 檢查通過；以工作編號 commit，只提交本份變更，提交後核對工作區。需要環境但未執行的關鍵驗證不得標完成。

### 驗證摘要格式

以下是後續於 `docs/validation/<工作編號>.md` 使用的格式，不是本次測試結果：

```markdown
# P0.1 驗證摘要
- 狀態：進行中／待驗證／完成
- 實作範圍與實際修改路徑：
- 參考文件、原碼 commit 與決策：
- 環境：OS、Node／pnpm、SQLite、image／掛載（適用者）
- 執行命令、exit code 與結果：
- 檔案／DB／畫面核對結果：
- 未執行項目、限制及原因：
- 下一份工作或剩餘子項：
```

驗證摘要與狀態同次提交；實作 commit 由 Git log 中的工作編號回查，不要求文件在該 commit 內記錄自己的 hash。大型 trace、影片與 log 使用已定保存策略，不放進歷史研究 `evidence/`。

## P10 配色與 SVG 識別候選

另依使用者要求完成 [Image Gen 圖像 Logo 第二稿](docs/design/P10/logo-image-v2.md)。P10.1 已採選定稿；新 PNG 的正式 React 驗收獨立於舊 SVG 證據。

2026-11-01 已完成 H 圖像品牌 P10.1，範圍為三個品牌 host、favicon 與 owning CSS；使用選定 PNG 並保留原始 bytes 與透明留白。當次實作與驗收見 P10.1（本機 `docs/validation/P10.1.md`）。

使用者接著確認「整個工作區像同一張白色畫布」，規劃後要求調整。最新[色彩規格、畫面範圍、修改檔案及驗收矩陣](docs/decisions/P10-white-canvas.md)是依據；P10.2 已完成主內容／側欄／搜尋／表頭／圖庫空白區白底，藍色操作與 H logo 保留，灰／藍底用於互動與狀態。P10.3 已完成兩平台回歸、290 張 Linux 原圖複核與三視窗白底補驗；P10.4 已完成正式交付。

2026-10-31 的[研究](docs/reviews/p10-color-and-logo-review.md)、[比較預覽及三份 SVG](docs/design/P10/README.md)與 P10-design（本機 `docs/validation/P10-design.md`）保存初始結果。原灰色版底、主藍換色與暖金資料夾方案由白色畫布規格取代；舊證據不回寫，最新進度依下表。

| 工作／狀態 | 修改位置 | 參考與驗收 |
| --- | --- | --- |
| P10.1 已完成 | BrandMark／PNG、Workspace／Login／PublicShell、favicon、owning CSS、320px 工具列 | 0.40.15；三視窗品牌 3／3、既有 E2E 21／21、靜態網站 12／12，實際 PNG／cache／HEAD 與 16／24／32／48px、320px 已驗。見 P10.1（本機 `docs/validation/P10.1.md`）；本份驗證時未交付，後續由 P10.4 交付 |
| P10.2 已完成 | theme/index.ts 與 owning CSS；殼層／搜尋／三檢視／管理／登入／公開／工作；visual-system E2E | 0.40.16；sidebar／disabled 拆分、一般白底與集中 hover。metadata／型別／lint／build、Windows Chromium 57／57、配色擷取 6／6 與手機／平板穩定取樣各 1／1；92 張原圖、1,026 個實際合成背景及對比見 P10.2（本機 `docs/validation/P10.2.md`）。本份驗證時未交付，後續由 P10.4 交付 |
| P10.3 完成 | 既有 core／E2E、DESIGN、本份紀錄（本機 `docs/validation/P10.3.md`） | 2026-11-04；沿用 Windows 423＋207／207、Linux 433＋原整批 206／207及修正後該 spec 各 3／3；新 Linux 六流程 6／6、1,026 白底、290 張原圖逐張複核。A06 為原圖判讀誤判，兩平台手機各有 85,800 藍色圖片像素，原 bytes 保留。未改產品／版本，接 P10.4 |
| P10.4 完成 | 正式 image／Compose／release、完整備份還原、local-preview 與根文件 | 2026-11-04；0.40.16 正式 image、23 個 web 產物一致，Compose 5／5、release 4／4；停雙服務備份／verify、全新 volume 還原及資料／FileService 核對，再更新 8088。原分頁登入與白底／H 品牌／三檢視／預覽／設定／工作已驗；原三 volumes、帳密／偏好／原檔、舊 images 及其他五服務保留。見 P10.4（本機 `docs/validation/P10.4.md`） |
| P10.5 完成 | styles.css 的勾選欄 owner、selection-alignment E2E、版本與交付文件 | 2026-11-04；0.40.17，舊版三視窗重現後修正 2px 勾選框／4px 名稱偏差；Windows 21／21、Linux 9／9、39 張原圖及 Compose 5／5。備份／verify／新目標還原、資料與 23 個 HTTP 產物一致，8088 已更新；原 IAB 連線不可用，不將合成畫面當使用者分頁簽收。見 P10.5（本機 `docs/validation/P10.5.md`） |
| P10.6 完成 | 全畫面來源盤點、隔離截圖／DOM 幾何、根文件 | 2026-11-04；0.40.17 基線，兩平台各 93＋9 案共 204／204、480 張原圖／204 張代表圖檢視、23 張聯絡表；13,921 圖示／1,236 checkbox 觀測，表單及表格內容起點偏差 0px，未發現新增同類缺陷。8088 原 image／23 產物一致、測試容器已清理；僅文件，不增版、不重建正式服務。範圍與限制見 P10.6（本機 `docs/validation/P10.6.md`） |
| P10.7 完成 | 第一行 CSS、selection-alignment／合成 fixture、全頁掃描、版本與交付文件 | 2026-11-05；0.40.18，舊版 11／55／53px 重現後修正；兩平台三視窗全頁掃描與原圖複核，Windows 105／105、Linux 原批及背景搬移獨立補驗分列。52／64px、44px 及原選取契約保留；Compose 5／5、完整備份／新目標還原及 8088 原分頁已驗，見 P10.7（本機 `docs/validation/P10.7.md`） |

P10.1 程式版本為 0.40.15，P10.2 的白底外觀修正增加 PATCH 至 0.40.16。P10.3 單純驗證／文件不增版，有修正才依規範同步。技術棧、controller、API、資料庫與 schema 沿用。P10.3／P10.4 已結案，0.40.16 的交付保留歷史；P10.5 修正勾選欄並交付 0.40.17；P10.6 的全畫面對齊稽核未新增已確認缺陷，不改版本或正式映像。

## 下一次開工入口

**P0–P10 共 69 份完成。** 2026-11-05 已依 P10.7（本機 `docs/validation/P10.7.md`）將 8088 保留資料更新至 0.40.18；原始需求與縮限依驗收稽核，未驗環境依跨階段矩陣。後續新需求另列計畫；每份驗證後本機 commit，不 push。
