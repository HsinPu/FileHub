# FileHub 計畫功能與驗收準備稽核

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

日期：2026-11-01。稽核程式基線 `fd2ce91`／0.40.16／schema 13；原始主計畫為 `0fa5bd7:IMPLEMENTATION_PLAN.md`（2026-10-27）。本報告比對原始 33 項核心切片、現行 P0–P10 計畫、後續決策、目前來源及測試證據，不以完成標籤直接代替實作與執行結果。

2026-11-04 後續更正：A06 的「手機 PNG 黑畫面」是本報告的判讀錯誤，原圖包含完整圖片／工具，SHA 與解碼像素已核對；A02 已由 P10.3（本機 `../validation/P10.3.md`）結案；A01／A03 已由 P10.4（本機 `../validation/P10.4.md`）完成正式 image、fixtures、發行及 8088 交付。以下 2026-11-01 的測試與交付盤點保持原日期範圍，最新進度依主計畫。

## 1. 驗收結論與適用範圍

**以正式分階段計畫及後續定案契約為準，原始 P0–P6 的 33 項核心工作皆有對應實作與可重跑案例；本次未發現整個核心功能模組缺席。但目前還不能宣告最新版本全部驗收及交付完成。**

- 現行計畫共 66 份，64 份已結案，開始時的 64 份驗證文件均存在。本次另補 P10.3 的回歸與測試修正紀錄，狀態為待驗證；P10.4 未開始。這個數量是工作項目盤點，不是功能品質百分比。
- 程式是 0.40.16；實際 Docker／8088 仍為 0.40.14。最新版 H logo、白色畫布及 320px 工具列尚未交付到 8088。
- 新版完整 Windows／隔離 Debian 回歸結果與環境界線見下節；本次檢查不部署、不更新使用者帳密或 volumes。
- 早期藍圖／File Browser 的所有功能不等於新版已承諾的全部範圍；下節列出明確縮限與未提供項目，驗收須按這些契約判定。

主進度仍以 [IMPLEMENTATION_PLAN.md](../../IMPLEMENTATION_PLAN.md)為準；本文件保存本次基線的稽核結果，不另維護第二份進度表。

目前未提供能力、未驗環境與正式人工簽收，請使用[2026-11-04 驗收狀態與清單](acceptance-status-2026-11-04.md)。下方 A01–A05 為 2026-11-01 的盤點，已收斂項目依上方後續紀錄及 P10.3／P10.4，不當作目前仍未交付。

## 2. 證據與本次執行

| 核對項目 | 結果／界線 |
| --- | --- |
| 原始主計畫 → 現行實作 | 原始 33 個 ID 均能對應目前來源、案例及各份驗證；逐項見 §3 |
| 現行工作及提交 | 66 份；64 份已有驗證文件及對應本機提交。P8.8–P8.10 使用 `P8.x:` 訊息格式，不能因沒有括號就誤判未提交 |
| 歷史證據完整性 | 8 組 SHA256SUMS、558 個檔案全部相符；證明現存證據未變，不能把歷史測試當本次重新執行 |
| 主機／Linux 來源 | 345 個來源檔 canonical LF／原始 PNG／WOFF2 摘要相符，來源基線均為 fd2ce91 |
| Windows 0.40.16 核心 | **423 個原生案例通過**；包含 metadata／型別／lint／build、toolchain／unit／integration／HTTP／system |
| Debian 0.40.16 核心 | **433 個原生案例通過**；與 Windows 的寫入能力分支不同，不合併計算成單一跨平台保證 |
| Windows 完整 Chromium | **207／207，exit 0**；完整 log（本機 `../validation/acceptance-2026-11-01/windows-full.log`）。下述測試等待修正後另外補驗該 spec 三視窗 **3／3** |
| Debian 完整 Chromium | 原始整批 **206／207，exit 1**，只有手機預覽在入場動畫中過早量測；完整 log（本機 `../validation/acceptance-2026-11-01/linux-full.log`）不回寫。補等待後該 spec 三視窗 **3／3**，另見下述證據 |
| 實際 8088 | 本次 live／ready／首頁為 200，未帶 Cookie 的 session 為 401；API／worker 健康、同一 0.40.14 image。未取得使用者私有 session 或重新登入 |
| 最新正式發行／還原 | 本次未執行；現存正式結果為 P9.9（本機 `../validation/P9.9.md`）的 0.40.14。0.40.16 的正式 image／Compose／release／備份還原及分頁交付仍屬 P10.4 |

原始計畫行、實際路徑、驗證檔摘要與 route 對照已保存在機器盤點（本機 `../validation/acceptance-2026-11-01/plan-source-audit.json`），結果摘要（本機 `../validation/acceptance-2026-11-01/summary.json`）、來源及原始紀錄索引（本機 `../validation/acceptance-2026-11-01/README.md`）與雜湊（本機 `../validation/acceptance-2026-11-01/SHA256SUMS`）可核對。本次不修改歷史 evidence bytes。靜態 route 清單包含直接註冊、GET／HEAD 陣列及來源中明示的迴圈展開，不把單次文字搜尋未命中當作缺功能。

### 這次發現並修正的測試時機問題

Linux 手機預覽在圖片已載入、`ant-zoom-appear-active` 尚未結束時執行嚴格幾何斷言，量到 x=0.1301、y=0.3825、width=389.6213、height=843.1806，而非 390×844 全視窗。原始失敗圖（本機 `../validation/acceptance-2026-11-01/original-linux-dialog-failure.png`）、原始斷言（本機 `../validation/acceptance-2026-11-01/original-linux-dialog-error.txt`）及trace 的去識別 DOM 摘錄（本機 `../validation/acceptance-2026-11-01/original-motion-extract.json`）保留；縮放比與 trace 的 134px／394px transform-origin 相符。

同一 CI image 的三個全新診斷 fixture 未再重現中間值，正常讀值與動畫結束後均為精確全視窗；不把這三次成功當作原始失敗不存在。修正 [dialog-layout.spec.ts](../../tests/e2e/dialog-layout.spec.ts)先等待入場 class 消失，再量測原有嚴格尺寸。**沒有改產品 UI、尺寸門檻、timeout 或 retry；產品版本維持 0.40.16。**

修正後 typecheck／lint 通過，Windows／Linux 該 spec 各三視窗 **3／3**；Windows log（本機 `../validation/acceptance-2026-11-01/windows-dialog-fixed.log`）、Linux log（本機 `../validation/acceptance-2026-11-01/linux-dialog-fixed.log`）。最終 345 個主機／Linux 來源摘要一致，與完整批次僅差這份測試；原始完整結果及補驗分開記錄，不能稱 Linux 整批已 207／207 通過。首次診斷容器漏 build 所致的缺產物錯誤另外保存，不計入產品案例結果。

## 3. 最初 33 項核心工作逐項比對

「已落地」表示下列正式入口／元件有實作及案例；平台、容量、後續契約與本次未重跑的專項仍依 §4–5，不代表任意環境全部通過。

### P0：工具鏈、資料庫與部署骨架

| 工作 | 原計畫功能 → 實際做法 | 原碼／案例及歷史驗證 |
| --- | --- | --- |
| P0.1 | 已落地：Node／pnpm 鎖版、private workspace、strict TS、lint、build 及單一 lockfile | [package.json](../../package.json)、[toolchain.test.ts](../../apps/server/tests/integration/toolchain.test.ts)、P0.1（本機 `../validation/P0.1.md`） |
| P0.2 | 已落地：Fastify factory、公開錯誤／健康、設定驗證及明確啟停，匯入不自動 listen | [app.ts](../../apps/server/src/app.ts)、[runtime.ts](../../apps/server/src/runtime.ts)、P0.2（本機 `../validation/P0.2.md`） |
| P0.3 | 已落地：better-sqlite3／Drizzle、WAL、已審 migrations、備份及全新目標還原 | [database.ts](../../apps/server/src/persistence/database.ts)、[persistence.test.ts](../../apps/server/tests/integration/persistence.test.ts)、P0.3（本機 `../validation/P0.3.md`） |
| P0.4 | 已落地：獨立 worker、正式 DB ownership、readiness／heartbeat／停止期限；P5 接入真正 executor | [worker.ts](../../apps/server/src/worker.ts)、[services.test.ts](../../tests/system/services.test.ts)、P0.4（本機 `../validation/P0.4.md`） |
| P0.5 | 已落地：同一 image 分成 api／worker、一次 migration gate、本機持久卷與健康／權限限制；新版本發行另驗 | [compose.yaml](../../compose.yaml)、[compose.test.ts](../../tests/system/compose.test.ts)、P0.5（本機 `../validation/P0.5.md`） |
| P0.6 | 已落地：React／AntD 正式 SPA、集中 theme、公開 API client 與真實瀏覽器 fixture | [App.tsx](../../apps/web/src/app/App.tsx)、[fixtures.ts](../../tests/e2e/fixtures.ts)、P0.6（本機 `../validation/P0.6.md`） |
| P0.7 | 已落地：分層 scripts、隔離資源清理、Windows／Linux CI 設定；hosted 執行不由本機結果代替 | [ci.yml](../../.github/workflows/ci.yml)、[temporary-directory.ts](../../tests/helpers/temporary-directory.ts)、P0.7（本機 `../validation/P0.7.md`） |

### P1：身份、入口與瀏覽下載

| 工作 | 原計畫功能 → 實際做法 | 原碼／案例及歷史驗證 |
| --- | --- | --- |
| P1.1 | 已落地：管理員 bootstrap、帳號 CLI、scrypt、可撤銷 Cookie session、CSRF、登入／登出；絕對 12 小時不續期 | [identity/service.ts](../../apps/server/src/modules/identity/service.ts)、[files-read.spec.ts](../../tests/e2e/files-read.spec.ts)、P1.1（本機 `../validation/P1.1.md`） |
| P1.2 | 已落地：managed／external 入口、相對 scope／grant、共用授權與 scoped filesystem；不接收一般瀏覽器主機路徑 | [entries/service.ts](../../apps/server/src/modules/entries/service.ts)、[entries.test.ts](../../apps/server/tests/integration/entries.test.ts)、P1.2（本機 `../validation/P1.2.md`） |
| P1.3 | 已落地：metadata、穩定排序／版本分頁、單檔 GET／HEAD／Range 與來源重新驗權 | [files/service.ts](../../apps/server/src/modules/files/service.ts)、[files.test.ts](../../apps/server/tests/integration/files.test.ts)、P1.3（本機 `../validation/P1.3.md`） |
| P1.4 | 已落地：登入、入口／麵包屑、列表、排序／選取、query 深連結與手機導覽；遞迴目錄樹延後 | [Workspace.tsx](../../apps/web/src/features/files/Workspace.tsx)、[workspace.spec.ts](../../tests/e2e/workspace.spec.ts)、P1.4（本機 `../validation/P1.4.md`） |
| P1.5 | 已落地：bootstrap／入口授權／完整唯讀操作、撤權／停用／離線重試與使用文件 | [cli.ts](../../apps/server/src/cli.ts)、[identity.test.ts](../../tests/system/identity.test.ts)、P1.5（本機 `../validation/P1.5.md`） |

### P2：同步寫入與垃圾桶

| 工作 | 原計畫功能 → 實際做法 | 原碼／案例及歷史驗證 |
| --- | --- | --- |
| P2.1 | 已落地：名稱／版本／衝突、持久子樹 reservation、Linux 原子不覆寫及 owner guard | [mutations.ts](../../apps/server/src/modules/files/mutations.ts)、[filehub-fs.c](../../apps/server/native/filehub-fs.c)、P2.1（本機 `../validation/P2.1.md`） |
| P2.2 | 已落地：同步新增資料夾／改名與 Modal，回應遺失查同 UUID，拒絕靜默覆寫 | [WriteDialog.tsx](../../apps/web/src/features/files/WriteDialog.tsx)、[files-write.spec.ts](../../tests/e2e/files-write.spec.ts)、P2.2（本機 `../validation/P2.2.md`） |
| P2.3 | 已落地：移入私有垃圾桶、分頁／狀態、原位或另選位置還原、同名拒絕；不提供永久刪除 | [trash/service.ts](../../apps/server/src/modules/trash/service.ts)、[trash.spec.ts](../../tests/e2e/trash.spec.ts)、P2.3（本機 `../validation/P2.3.md`） |
| P2.4 | 已落地：外改、程序中斷、雙程序／磁碟錯誤與保守恢復；先證明 owner 停止，不盲目重播 | [write-recovery.test.ts](../../tests/system/write-recovery.test.ts)、[write-errors.test.ts](../../apps/server/tests/integration/write-errors.test.ts)、P2.4（本機 `../validation/P2.4.md`） |

### P3：可靠上傳

| 工作 | 原計畫功能 → 實際做法 | 原碼／案例及歷史驗證 |
| --- | --- | --- |
| P3.1 | 已落地：自訂 session v1、1 GiB／4 MiB chunk、24h、配額、SHA-256 與持久狀態；選擇自訂而非 TUS | [uploads/catalog.ts](../../apps/server/src/modules/uploads/catalog.ts)、[uploads 契約](../../packages/contracts/src/uploads.ts)、P3.1（本機 `../validation/P3.1.md`） |
| P3.2 | 已落地：backpressure／offset、fsync、逐段及完整驗證、finalize 原子發布與重新授權 | [publication.ts](../../apps/server/src/modules/uploads/publication.ts)、[upload-receiver.test.ts](../../apps/server/tests/integration/upload-receiver.test.ts)、P3.2（本機 `../validation/P3.2.md`） |
| P3.3 | 已落地：多檔／資料夾階層、進度／取消／重試，重新選檔驗全部已提交 prefix 後續傳；跨頁 controller 保留 | [uploads/controller.ts](../../apps/web/src/features/uploads/controller.ts)、[uploads.spec.ts](../../tests/e2e/uploads.spec.ts)、P3.3（本機 `../validation/P3.3.md`） |
| P3.4 | 已落地：worker 到期／取消清理、重啟續傳、發布競態與容量故障策略；未知 payload 保留而非盲刪 | [uploads/maintenance.ts](../../apps/server/src/modules/uploads/maintenance.ts)、[uploads.test.ts](../../tests/system/uploads.test.ts)、P3.4（本機 `../validation/P3.4.md`） |

### P4：搜尋、預覽及縮圖

| 工作 | 原計畫功能 → 實際做法 | 原碼／案例及歷史驗證 |
| --- | --- | --- |
| P4.1 | 已落地：目前資料夾名稱篩選／有界遞迴搜尋分開，深度／數量／時間／取消與 partial 明示 | [search/service.ts](../../apps/server/src/modules/search/service.ts)、[search.spec.ts](../../tests/e2e/search.spec.ts)、P4.1（本機 `../validation/P4.1.md`） |
| P4.2 | 已落地：受限圖片、UTF-8 純文字與 PDF 第一頁、Range／MIME／下載 fallback；不 render 文件 HTML | [PreviewDialog.tsx](../../apps/web/src/features/previews/PreviewDialog.tsx)、[previews.spec.ts](../../tests/e2e/previews.spec.ts)、P4.2（本機 `../validation/P4.2.md`） |
| P4.3 | 已落地：子程序解碼、有界 cache／失效及重新授權，採 API 記憶體 LRU 而非磁碟 cache | [previews/cache.ts](../../apps/server/src/modules/previews/cache.ts)、[thumbnail-cache.test.ts](../../apps/server/tests/integration/thumbnail-cache.test.ts)、P4.3（本機 `../validation/P4.3.md`） |
| P4.4 | 已落地：安全縮圖、搜尋／預覽 UI、鍵盤、手機、損壞／不支援／超限與重試提示 | [Thumbnail.tsx](../../apps/web/src/features/previews/Thumbnail.tsx)、[thumbnails.spec.ts](../../tests/e2e/thumbnails.spec.ts)、P4.4（本機 `../validation/P4.4.md`） |

### P5：持久背景工作

| 工作 | 原計畫功能 → 實際做法 | 原碼／案例及歷史驗證 |
| --- | --- | --- |
| P5.1 | 已落地：operation／item、claim／attempt／lease、heartbeat／fencing、取消與可安全重試條件 | [operations/catalog.ts](../../apps/server/src/modules/operations/catalog.ts)、[operations.test.ts](../../apps/server/tests/integration/operations.test.ts)、P5.1（本機 `../validation/P5.1.md`） |
| P5.2 | 已落地：遞迴複製、同／跨 filesystem device 搬移、衝突 stop／skip、逐項結果與保守恢復 | [transfers.ts](../../apps/server/src/modules/operations/transfers.ts)、[transfers.test.ts](../../tests/system/transfers.test.ts)、P5.2（本機 `../validation/P5.2.md`） |
| P5.3 | 已落地：ZIP32 STORE、實際 bytes／SHA、授權下載、期限／配額及精確清理；不壓縮／不解壓 | [archives.ts](../../apps/server/src/modules/operations/archives.ts)、[archives.test.ts](../../apps/server/tests/integration/archives.test.ts)、P5.3（本機 `../validation/P5.3.md`） |
| P5.4 | 已落地：複製／剪下／目的地瀏覽、工作浮卡、逐項錯誤／取消／回查、下載 ZIP；僅符合 canRetry 的未開始工作可重試 | [OperationPanel.tsx](../../apps/web/src/features/operations/OperationPanel.tsx)、[operations.spec.ts](../../tests/e2e/operations.spec.ts)、P5.4（本機 `../validation/P5.4.md`） |
| P5.5 | 已落地專項 harness 與歷史結果：程序／helper 中斷、撤權、不同 device、ENOSPC、NFSv3 唯讀 hard 來源停頓／恢復；本次不重跑 NFS | [verify-nfs.mjs](../../scripts/verify-nfs.mjs)、P5.5（本機 `../validation/P5.5.md`）、P6.4（本機 `../validation/P6.4.md`） |

### P6：分享、設定及維運

| 工作 | 原計畫功能 → 實際做法 | 原碼／案例及歷史驗證 |
| --- | --- | --- |
| P6.1 | 已落地：單檔／資料夾公開分享、密碼／期限／撤銷、獨立公開身份及 owner／grant 重新驗權 | [shares/service.ts](../../apps/server/src/modules/shares/service.ts)、[shares.spec.ts](../../tests/e2e/shares.spec.ts)、P6.1（本機 `../validation/P6.1.md`） |
| P6.2 | 已落地：個人偏好／改密碼、管理員帳號／入口／grant、CLI opaque candidate、dirty／busy guard | [SettingsPage.tsx](../../apps/web/src/features/settings/SettingsPage.tsx)、[settings.spec.ts](../../tests/e2e/settings.spec.ts)、P6.2（本機 `../validation/P6.2.md`） |
| P6.3 | 已落地：停雙服務、完整備份／verify、新目標還原、identity 重綁、session 清除、未完成工作保留處置 | [snapshot.ts](../../apps/server/src/maintenance/snapshot.ts)、[maintenance.test.ts](../../tests/system/maintenance.test.ts)、P6.3（本機 `../validation/P6.3.md`） |
| P6.4 | 已落地：獨立正式發行／升級／舊快照回復／未知 DB 拒絕及操作文件；最新發行須補齊本節列明的 image 前置 | [release.test.ts](../../tests/release/release.test.ts)、[release.md](../operations/release.md)、P6.4（本機 `../validation/P6.4.md`） |

P7–P9 另完成導覽、局部工具／搜尋、選取／情境選單、全頁管理、三種檢視、對話框／全畫面安全預覽、公開頁與工作浮卡的一致性；不是額外缺少的後端功能。各工作及驗證可沿[主計畫](../../IMPLEMENTATION_PLAN.md)查回；P10.1／P10.2 的品牌與白底原圖分見 P10.1（本機 `../validation/P10.1.md`）／P10.2（本機 `../validation/P10.2.md`）。

## 4. 原案、後續決策與目前不提供的能力

| 原案／可能期待 | 目前實際契約 | 判定及依據 |
| --- | --- | --- |
| 目錄樹／逐層展開 | 目前目錄 listing＋入口／麵包屑；沒有遞迴樹 | 明確延後，[P1-workspace](../decisions/P1-workspace.md)；需要樹時另列工作 |
| session renewal | 絕對 12h，無 refresh／滑動續期 | 已定案調整，[P1-session-and-access](../decisions/P1-session-and-access.md) |
| 每動作獨立 create／delete ACL | scope 分 browse／download／write，寫入能力共用 | 已定案邊界，P6 矩陣（本機 `../validation/P6-matrix.md`）；不是完整細粒度 ACL |
| 跨頁累積選取 | 選取綁目前 listing version；切頁清除 | 已定案調整，P6 矩陣（本機 `../validation/P6-matrix.md`）；不宣稱跨頁批次 |
| TUS | 自訂 FileHub upload session v1 | 原計畫允許二擇一，[P3 協定](../decisions/P3-upload-protocol.md)；不具 TUS 相容宣告 |
| 永久刪除／自動清空垃圾桶 | 保留到還原，沒有永久 DELETE 或自動 GC | 明確安全縮限，[P2-trash](../decisions/P2-trash.md)；須自行規劃容量與後續維護 |
| 壓縮 ZIP／解壓／自動重播工作 | ZIP STORE；只重試可證明尚未開始的 interrupted 工作，不重播不明副作用；無解壓 | 已定案資源／恢復契約，[P5-archives](../decisions/P5-archives.md)、[P5-operations](../decisions/P5-operations.md) |
| 磁碟縮圖 cache、任意媒體／整份文件預覽 | 每 API 記憶體 LRU；受限 JPEG、純文字、PDF 第一頁 | 已定案範圍，[P4-previews](../decisions/P4-previews.md)；不是影音播放器／文字編輯器／完整 PDF 閱讀器 |
| 全文內容搜尋 | 名稱篩選與有界遞迴名稱搜尋 | 按 P4 計畫實作；沒有內容索引或任意 NAS 全掃描 |
| 舊 Python FileHub DB 直接移轉 | 未知 DB 拒絕，沒有舊資料轉換工具 | 沒有匯入契約，[發行流程](../operations/release.md)；若須帶入舊 DB，這是額外工作 |
| 藍圖的 `/api/v1/*` 名稱 | 正式採 `/api/session`、`/api/entries/:id/*`、`/api/operations` 等 | 初期 API 命名草案已由公開 contracts／routes 取代，不是缺登入或檔案 API |
| 任意主機／NAS／多副本部署 | 單台 Linux／amd64，API／worker 各一；DB 在本機。NAS 是已掛載檔案來源 | 適用範圍，非所有環境保證；細節依跨階段矩陣（本機 `../validation/P6-matrix.md`） |

若上述能力屬於這次實際上線的必要條件，就應先新增明確工作與測試；不能僅因主計畫大多結案就宣稱它們已提供。

## 5. 驗收前缺口與處理順序

| 編號 | 問題與影響 | 下一步／完成條件 |
| --- | --- | --- |
| A01 | **新版未交付**：8088 是 0.40.14，無法驗收最新版 H logo／白底／320px 修正 | 依 P10.4 完成正式 image／Compose／release，停雙服務備份並驗新目標還原，再保留原資料更新 8088、驗實際分頁 |
| A02 | **P10.3 待驗證**：本次已補功能回歸及動畫等待修正／三視窗補驗，原 Linux 整批失敗保留；尚未依該份視覺矩陣完成全頁面／狀態的逐張收斂與簽核 | 依 P10.3 驗證紀錄（本機 `../validation/P10.3.md`）接續；同一來源已成功的測試可引用，只針對缺證、修改或失敗補驗，不為填文件重複建置 |
| A03 | **發行 fixtures 缺失**：目前 Docker 缺 `filehub:0.29.0`、`filehub:0.39.1`，亦尚無 0.40.16 正式 runtime image | 沿[發行文件](../operations/release.md)指定固定 commit，在隔離 checkout 重建兩份舊 image；不拿 0.40.14 改 tag 冒充舊版本，不使用舊 image 開升級後 DB |
| A04 | 維運文件過時：開發流程首頁 0.40.15、發行頁 0.40.6、CI 時限 50 分鐘與實際 110 不符；早期 API 草案仍易被讀成現況 | 本次同步文件，保留 P0–P9 歷史 evidence；程式無變更則不增版 |
| A05 | 真實部署環境仍有未驗範圍：裸機／arm64、真實 NAS／NFSv4／SMB、NFS 寫入、硬體斷電、其他瀏覽器／實機手機、長時間壓力 | 不阻擋已定義的單機／容器驗收；若實際使用需要其中一項，先建立該環境專項。GitHub hosted CI 本次未觸發或查證 |
| A06 | **2026-11-04 已更正：原圖判讀錯誤**。原 Linux／Windows 手機 PNG 都有標題、工具與藍色合成圖；各有 85,800 藍色圖片像素，中心 ARGB FF2864DC，原 Linux SHA 與歷史清單一致 | A06 更正（本機 `../validation/P10.3/A06-correction.json`）及 P10.3（本機 `../validation/P10.3.md`）保存原圖／像素與來源；不改歷史原圖、失敗與補驗紀錄，不宣稱已找到產品黑畫面根因 |

本次沒有清理、移動或重設 `filehub_state`／`filehub_files`／`filehub_cache`，不改 `.env` 的固定正式 image，也不以測試 container 的 image 當作正式 runtime 交付。

結束時七個既有服務的容器 ID／啟動時間及掛載設定與開始時相同，四個自有完整驗證／診斷／補驗容器均已清理；最後盤點（本機 `../validation/acceptance-2026-11-01/docker-final.json`）。新的 CI image 保留以供同來源驗證重用；沒有執行全域 prune 或移除其他 image／volume。

## 6. 使用者實際操作驗收清單

下表是待執行的人工驗收步驟，**不是本次已在使用者資料上操作的結果**。新版交付後，用專用驗收資料夾與測試帳號操作，避免以真實重要檔案測試寫入／回收。

| 流程 | 要看到的結果 |
| --- | --- |
| 版本／登入 | 顯示正確版本與 H 品牌；錯密碼拒絕，登入／登出成功，重新整理與深連結可恢復 |
| 入口與權限 | 內建／外部來源可瀏覽；member 只見授權 scope，唯讀不出可執行寫入，無管理權不讀 admin |
| 列表與三檢視 | 名稱／日期排序、分頁、列表／圖磚／圖庫及保存偏好正常；長名自然換行、切頁清選取 |
| Linux 同步寫入 | 新資料夾／改名成功，同名衝突拒絕、不覆寫；回應不明可查原 UUID，不重送猜測 |
| 垃圾桶 | 移入前確認、原檔離開列表；原位／另選位置還原，衝突清楚，不出現未提供的永久清空 |
| 上傳 | 多檔／資料夾、空檔、取消／重試、重選檔續傳；切設定頁不停止，完成後下載 bytes 一致 |
| 搜尋 | 目前資料夾與包含子目錄明確分開；清除／返回／取消生效，partial／錯誤不冒充完整結果 |
| 安全預覽 | 圖片／文字／PDF 第一頁可用，HTML／SVG 不執行；不支援或損壞可下載原檔 |
| 背景工作 | 複製／搬移／ZIP 可切頁回查；逐項成功／部分失敗／取消／需處置與實際檔案一致 |
| 公開分享 | 單檔／資料夾、密碼與訪客頁；撤銷／到期停止存取，不取得私人身份權限 |
| 設定與管理 | 偏好保存、草稿離頁確認、角色／停用／grant 及密碼變更後 session 失效符合規則 |
| 響應式／鍵盤 | 桌面／平板／手機、200% 縮放與 Tab／Enter／Escape 可操作；焦點清楚、主要手機觸控區至少 44px |
| 維運演練 | 兩服務重啟保留資料；依停機流程備份、verify、還原新目標並核對檔案，不覆寫原 state |

正式簽收應附版本／image ID、日期、操作者、使用平台、每項通過／不通過及問題編號；未驗項目保留空缺，不能由本文件的計畫對照自動填成通過。
