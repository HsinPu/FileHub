# 專案知識

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

## Compose 連接埠與登入

- Compose 的預設 `FILEHUB_PUBLIC_ORIGIN` 固定為 `http://127.0.0.1:8080`。修改主機埠時也要更新 origin，因為登入驗證瀏覽器的 Origin，而 `/health/ready` 可獨立通過。設定驗證允許 loopback HTTP，跨機使用 HTTPS 來源。安裝範例見 [README](README.md#使用-docker-compose-啟動)。

## 原始碼發佈與測試產物

- 2026-11-05 使用者定案保留測試原始碼，只排除截圖、log、驗證報告等產物，並明確授權最後修正與乾淨快照一併上 `main`。`tests/`、`apps/server/tests/`、`apps/web/tests/` 及必要 fixture 保留；不要用圖片／文件副檔名刪除必要測試資料、Logo、字型或授權。`.gitignore` 不能清掉舊 commit；原開發歷史留本機 `codex/development-history-2026-11-05`，乾淨快照由 `main` 接續，不混回原歷史。移除索引前保存精確清單及 hash，保持本機 bytes 不變；遠端未成功刷新時不能宣稱目前內容已核對。規則見 [source-publication](docs/operations/source-publication.md)。

## 全畫面對齊檢查

- 2026-11-04：P10.6（本機 `docs/validation/P10.6.md`）／0.40.17 的兩平台 204 案與 480 張具名原圖未找到新增同類對齊缺陷。DOM 幾何是候選篩選，不能取代光學判斷；焦點外圈、手機 44px、前置圖示及受控表格橫捲應按設計契約判讀。Checkbox input 的 opacity:0 是元件實作，應量可見外層；不能以 input 不可見就宣告沒有 checkbox。截圖 wrapper 也可能攔到 Playwright 內部 trace 暫存擷取，只以實際保留的具名 PNG 計數並保留原始紀錄；代表圖檢視與自動量測數量分開。縮圖疑點回原圖／幾何核對，不根據縮圖推定固定頂列或預覽故障。

## 第一行文字與勾選框

- 2026-11-05：P10.7（本機 `docs/validation/P10.7.md`）／0.40.18 證明 Checkbox 與 label 置中不代表與第一行檔名對齊。手機 metadata 與長名換行會改變整塊文字高度；應固定第一行的行高／padding 與勾選欄起點，保留 label 的 44px 點擊區，不能把整塊文字中心當基準。AntD text Button 仍有透明 1px border，會影響實際文字起點及列高；owning CSS 需一併處理表頭與檔名。長名 fixture 須真的在各視窗換行，且符合檔案系統 byte 上限。Linux 全頁掃描的一次搬移狀態等待超時與三視窗獨立補驗分開報告，不放寬 timeout，也不將補驗改寫成原批全過。

## 勾選欄對齊

- 2026-11-04：P10.5（本機 `docs/validation/P10.5.md`）／0.40.17 修正表頭 Checkbox 直接接文字、每列另有 24px 置中欄造成的 2px checkbox／4px 名稱偏移；手機因 header gap 12px／row gap 8px，名稱亦差 4px。表頭及每列必須共用欄寬、對齊及 breakpoint 間距，不能用 translate 或全站 Checkbox override 補償。新 E2E 驗本頁 50 列的未選／部分／全選、Space 及 44px hit area，舊版三視窗失敗後修正通過。AntD 6 DOM 沒有 ant-checkbox-inner，量測前確認實際元素。原生回歸、發行矩陣及真實使用者分頁須與本份受影響集合／HTTP 產物核對分開判定。

## 驗收稽核

- 2026-11-04：0.40.16／P0–P10 的 66 份工程工作與 8088 交付完成，人工正式簽收尚無逐項紀錄。[驗收狀態](docs/reviews/acceptance-status-2026-11-04.md)區分首版未提供／已定案縮限、未驗真實環境與人工簽收；垃圾桶無永久清空／GC、上傳單檔 1 GiB、背景每工作 1,000 節點／2 GiB 與舊 Python DB 無匯入，須先確認是否符合實際使用。原始失敗加受影響補驗不改寫成完整重跑；工程結案也不代表真實 NAS／異地復原已驗。
- 2026-11-01 以原始主計畫 `0fa5bd7` 對照程式 `fd2ce91`／0.40.16，原始 33 項均有實作及可重跑案例；範圍、後續契約差異與交付前置見[驗收準備稽核](docs/reviews/acceptance-readiness-2026-11-01.md)。來源／案例存在不等於已執行；歷史 SHA256SUMS 相符也不等於最新版本重新通過。
- 靜態 API 盤點須涵蓋 method 陣列與模板迴圈：僅搜 app.get/post 會漏掉 download／artifact／preview 的 GET／HEAD 及 cancel／retry。P8.8–P8.10 提交使用 `P8.x:`，不能只搜括號中的工作編號就判定未提交。
- 背景工作有「重試未開始工作」：後端要求 interrupted、owner 已釋放且所有 item 仍 pending／沒有副作用證據；與不明工作不得盲目 replay 的規則並不矛盾。發行舊 image fixtures 缺失時依固定 commit 隔離重建，不以改 tag 或新 image label 假冒舊 provenance。
- 本次 Linux 手機預覽在 ant-zoom-appear-active 中量得 389.621×843.181，圖片可見／naturalWidth 正確不代表 Modal 已停止縮放；測試改為先等進場 class 消失，保持原嚴格門檻。原整批 206／207 與補驗 3／3 分開記錄。2026-11-04 重新檢查原 PNG：兩平台手機各有 85,800 藍色圖片像素、中心 FF2864DC，先前黑畫面描述為判讀錯誤，沒有產品故障證據。視覺印象與原 bytes 不符時，先核對雜湊、解碼像素與原圖，不推定 compositor 缺陷；更正見 P10.3，歷史原圖／JSON 保留。

## 白色畫布

- 2026-11-01：使用者確認並要求調整整體白色畫布；規格在 [P10-white-canvas](docs/decisions/P10-white-canvas.md)，取代早期灰底／暖金資料夾候選。0.40.16 已調整主內容、側欄、搜尋、表頭與 gallery 空白區，保留藍色操作、H logo、互動／語意色與深色安全預覽；P10.2（本機 `docs/validation/P10.2.md`） 已驗 Windows 57／57 及代表配色，P10.3 於 2026-11-04 結案（Linux 新補六流程 6／6、1,026 白底及 290 張原圖複核）；P10.4 於 2026-11-04 完成正式映像及保留資料交付。
- AntD `colorBgContainerDisabled` 原指向 `palette.sidebar`；白底改版已拆成 `disabledBackground`，避免停用狀態隨靜態底色消失。表頭／gallery 的硬編碼灰底另沿 owner 改為 surface；Table token 同步涵蓋公開資料夾，hoverSurface 共用於 CSS／AntD Table／Menu／text Button。
- 浮層在 screenshot 前雖停用動畫，先讀 computed style 仍可能拿到進場中間值。這次手機 Drawer 的祖先 opacity 約 0.766；量測須先等待有限的 Animation.finished，再取樣。舊中間值保留且排除幾何比較，不回寫成穩定測量。

## Docker 測試與容量

- P10.4（0.40.16）：Compose 5／5、release 4／4；正式 web 23 檔與主機摘要一致，舊 fixtures 從固定 0.29.0／0.39.1 commits 隔離重建。8088 必須修改忽略的 .env 固定 FILEHUB_IMAGE 並重建雙服務，單純 commit／重啟不會換 image。停機完整備份、全新目標還原與正式 FileService 實讀後才切換；最後由原 IAB session reload 驗 H PNG、一般白底、三檢視與流程，保留所有使用者 volumes／備份及其他服務。

- Compose fixture 以 token 核對並清理自己的容器與 volume；建置腳本另產生版本化正式 image、CI image 與 NFS fixture image，清理 fixture 不會自動移除這些 image 或 Docker 建置快取。P9.8 紀錄同版 CI image 多次建置，需獨立盤點；image layer 可共用，不能直接加總各 image 的標示大小作為實際占用。Docker Desktop 的 VHDX 主機檔案大小與 Docker 實際資料量也要分開量測。
- 2026-10-31 曾發生 Docker VHDX 寫入時 C 槽已滿；Windows VHDMP 事件 11／126 記錄狀態 `0xC000007F` 並取消呈現磁碟。當次空間回升後 Docker 仍卡在 starting，WSL 列舉、Docker Desktop 正常停止及僅終止 docker-desktop 均逾時；不能以空間回升推定服務或資料已恢復，須先確認後再清理。

## 配色與 SVG 識別

- P10.1（0.40.15）：H 圖像由共用 BrandMark 呈現；PNG import 與 HTML favicon 使用同一資產，Vite 實際發出 hash 路徑，不能把 /src 路徑留到正式 HTTP。裝飾 img 不重複提供連結名稱；保留原圖 bytes 與透明邊距，框尺寸不等於有色圖案範圍。
- 320px 驗收發現 local-controls 的不換行內容為 344px、可用欄寬僅 288px；將品牌恢復舊大小仍有相同溢位。窄版隱藏重新整理／排序的視覺文字，保留 aria-label、title 與至少 44px 控制，不能用 body overflow:hidden 掩蓋。

- Image Gen 的圖像 Logo 候選需保存原始 PNG、提示詞與實際尺寸／alpha；顯示尺寸及指定色碼不能當作檔案尺寸或精確像素色。2026-10-31 的 H 圖像稿已驗 1254×1254 及透明抽樣；不得沿用上一稿 SVG 的小尺寸／原型證據，見 [圖像稿](docs/design/P10/logo-image-v2.md)。

- 2026-10-31：0.40.14 當時的品牌在三個 host 以字母 F／CSS 圓框呈現。候選 SVG 以 even-odd 負形 F 與資料夾路徑繪製；外部 img 不繼承 currentColor，需明確的彩色／單色／反白資產，多份 inline 另處理 title ID。結構檢查不代替實際小尺寸／深淺背景看圖；新 palette 仍屬候選，正式值依 DESIGN／theme。

## P9 設計與共用視覺經驗

- P9.9（0.40.14）：即使 UI 更新仍為 schema 13，交付也先停雙服務、完整備份並驗新目標還原。真實副本的帳密摘要／FileService 讀取不能稱為已用真實密碼 HTTP 登入；原分頁既有 session 與合成發行登入分別保存證據。

- P9.8（0.40.14）：原生縮放擷取需避免 CSS clip，等待選單退場與有限 Animation.finished；outline:none 要驗線型而非假設 computed width 為 0。來源 fingerprint 應在 diff 格式整理後固定；完整批次與後補來源分開保存，不能回寫成同一份測試。

- P9.7（0.40.13）：浮卡 clearance 應量實際高度；暫藏時保留、關閉時釋放。短手機要用實際 112px 頂列與選取列驗整筆檔案可達，不能固定 63px 當未遮住；語意色須另定淺背景，避免深色主色生成灰褐底。

- P9.6（0.40.12）：Grid 的 auto 最小欄寬會使手機 max-width 失效，需 minmax(0,1fr)；混合 CSS selector 只移除 owning selector。選取列替換局部工具後排序仍須可達，子選單裝飾圖示需 aria-hidden，公開頁統一由 shell 擁有頁尾。

- P9.5（0.40.11）：同一表單多個動作要共用一條 footer，不能逐按鈕再包 footer。正常 1440px 管理資料表給足 580／600px 所需寬度，窄版僅表格與分類容器橫捲；DOM 與視覺順序一致。

- P9.4（0.40.10）：手機 affix wrapper 的外框應保留 44px，但內層 input 必須 min-height 0，避免兩層高度相加。搜尋結果保留完整 path 的 accessible name 與原 open callback；CSS 色票斷言需跟核准 palette，不能保留 P8 亮藍。

- P9.3（0.40.9）：AntD small 的 padding 權重必須與 normal／hover／selected 一起收斂，避免幾何修正蓋過狀態色；選取列替換局部工具後，重新整理須仍可由更多所選操作抵達。手機圖磚勾選需獨立欄，不壓住圖示。

- P9.2（0.40.8）：選取列移出 header portal 後需自身 mobile z-index，否則表格會攔截點擊；20 可低於 Modal／資源選單。ViewControl 共用於一般及選取工具列，切換模式不清除選取；工作 header trigger 重用原 focus／open ownership，晚到工作不搶 Modal。

- P9 已核准並授權逐份實作／驗證／本機 commit，不 push；P9.1（0.40.7）完成共用基礎，進度只依主計畫。AntD input 的 `:focus` 會蓋低權重 `:where()`；具產品 class owner 的 `:focus-visible` 可保留 2px 外框，不用 !important。對比需等待元素及祖先實際 Animation.finished，選取背景中途不能當最後色；本份穩定文字 6.478、輸入邊界 3.259:1。原型邊界 8d99a8 僅 2.895，正式採 8190a2。原生 select 共用宣告收斂；未提前改布局、controller 或 8088。

- 2026-10-30 使用者要求研究「看起來不協調」並設計 P9。已依 0.40.6 的 13 張代表原圖／目前原碼建立 `docs/reviews/p9-design-review.md`：分開記錄主觀層級問題與可量測的 `#fff`／`#2196f3` 一般字級選取對比 3.124:1。候選為沉穩藍 `#245ea8`、深色檔名、淡底選取與一致表單；正式 palette／schema／8088 未改。
- 獨立預覽在 `docs/design/P9/`，只服務合成資料及明列資產，沒有正式 API／storage／身份。37 張 Windows Chromium 原圖含三視窗／手機工作＋選取；此證據不代表 React／Linux／真實寫入／全部頁面已驗。頂部審查列占 40／61px，幾何比較需標明；640px reflow 不是實際 200% zoom。
- 規劃建立時 P9 九份產品工作均未開始；目前進度僅依主計畫，P8 的 53 份保持完成。CSS 以現有 owner 收斂，禁止為新方向再加全站覆寫；公開／私有身份、controller、選取、偏好及安全 renderer 的行為仍保留。正式實作需另驗完整 API／鍵盤／三視窗與兩平台，不把 HTML 原型直接搬入產品。

## File Browser 新視覺依據

- P8.10（0.40.6／schema 13）正式 image、Compose 5／5、release 4／4；新增 0.39.1/schema 12 偏好及原 session 升級、mosaic 持久與 preserve-schema 原 image 隔離回復，保留 0.29.0 fixture。Compose restart 後直接等待 health，不再 up；up 會重新啟動已退出的 migration，被運行中 shared lifecycle lock 正確拒絕。真實 8088 先停雙服務、完整備份／verify、新 volume 還原並以正式 FileService 驗目前授權的 bytes；使用者分頁沿用原 session 驗新版。還原副本清 session，本次未用真實密碼登入副本，不把 credentials digest／service read 當成已做 HTTP 登入。原三 volumes、備份／還原副本與舊 images 保留；秘密／私有清單只留忽略位置，Git 只存去識別 receipt。
- P8.9（0.40.6）共用 Material EmptyState，空目錄不留表頭，錯誤／partial 不隱藏。窄版新建在 click capture 先收合並聚焦更多鈕，再讓 Modal 記住返回位置；選檔在 change capture 收合，早於 input 清值。E2E 初始資料改用正式 IdentityService／EntryService 與真實 KDF，避免每案重開五次 CLI；仍獨立 DB／API／FS，finally 關 DB，CLI 專項仍驗。Windows 曾在頁面建立前遇到 8 秒啟動／30 秒 seed 期限，只有 trace 無截圖時應先查 fixture，不按測試名稱推定產品壞掉；原批次保留、不延長期限或 retry。E2E 以新 seed 重跑；Windows 最後 CSS 補驗 12 案及完整原生，Linux 完整集合與兩平台最後工作樣式各 12 案補驗。maintenance 的運行中阻擋與還原登入分為兩案，保留所有檢查及各 20 秒期限。
- P8.8（0.40.5）工作浮卡透過 portal 呈現 aria-modal=false，Tab 可離開、只有手動開啟才 focus；搜尋／手機導覽暫藏時保留邏輯 open 的底部空間，不因浮卡隱藏而造成背景頁捲動位移。新工作自動展開不搶既有 Modal，進度與完成不重開；controller 仍屬 Workspace。手機選取列 width:auto 避免 left/right 留邊再加 100% 造成溢位。新增測試須依正式 upload create 的 200 契約，不能想當然斷言 201；以真實 API 及 Linux 三視窗補驗。
- P8.7（0.40.4）ManagementNavigation 共用 Workspace navigate／guard，member 只有個人／分享／目前入口垃圾桶，admin 才有帳號／儲存。使用 aria-current 真連結，不維護另一份頁籤狀態；窄分類列只調自身 scrollLeft。fileAction helper 必須等直接控制或更多觸發可見，不能用首次 isVisible=false 把尚未 mount 的 portal 當手機；修正後兩平台／三視窗偏好持久通過，期限與 retry 不放寬。Linux 原失敗批次中斷時，只 SIGINT 已驗 /proc/cmdline 的自身 runner、保留記錄並確認 fixture 退出後刪唯一 UUID 容器，其他服務不動。
- P8.6（0.40.3）PublicShell 只共用版面，公開頁不建身份／上傳／工作 controller；skip link 以 focus main 保留分享 fragment。密碼對話框與密碼輸入可有相同 accessible name，測試要先限定 dialog 再取 label。登入驗證若要重試成功，必須請求 workspaceData 以建立真實合成帳號，只有 page 的 fixture 不會建立 admin。舊 files-shell 的 flex page-heading 需在公開狀態明確還原 block，標題順序與三視窗皆驗。手機隱藏最後欄只套 data-row-key 資料列，避免連 AntD 空狀態 placeholder 一起隱藏。
- P8.5（0.40.2）目的地可瀏覽公開 listing 的授權子目錄，保留版本分頁，手輸／衝突放 disclosure；真正提交仍驗 metadata。預覽全畫面只改呈現，UTF-8 pre、JPEG blob、PDF 第一頁與取消不變。Modal 幾何要等 ant-zoom 進場結束，不能量中途 scale；loading 動作固定 aria-label／aria-busy 並以 pending 停用，避免角色名稱被 icon 改變。Windows／Linux 三視窗依 P8.5。
- P8.4（0.40.1）頂列與資源選單共用公開能力／snapshot；原孤立 Dropdown trigger 曾在右鍵後過早收合，需驗實際可見畫面；資源選單改原生 menu 語意／方向鍵與界外 pointerdown，關閉立即卸載，更多選單受控並在重新開啟後才取 item，避免點到離場舊選單。搜尋全頁時 main／sidebar inert，返回解除且保留 URL filter。手機選取列 8px 留邊與內容底部空間；≤450px 收起 metadata 保持正常短列 65px。
- 瀏覽器測試前固定 build，不能在載入期間重建 hash assets；P8.4 已以 trace 證明交錯建置造成舊 JS／CSS 404。測試 helper 必須先展開真正可見的窄版控制，不能等不存在的 role。隔離 Chromium＋API＋worker 採已驗 256 PID，128 曾出現 pids.events max=5；不放寬產品／KDF／期限來掩蓋環境錯誤。
- P8.3（0.40.0／schema 13）保留 list／thumbnails 值及筆數，新增 mosaic；SQLite CHECK 以新表完整複製再 rename，Kit 的交易內 foreign_keys 切換須審查，前十二份 SQL／journal 前綴不改。schema 增版須同步 knownDatabase／snapshot manifest；13 快照、Linux 完整維護 CLI 及舊快照讀取已驗，未知 14 繼續拒絕。三模式不改 controller 或暫時檢視保存語意，完整發行與 8088 交付依 P8.10。
- P8.2（0.39.3）殼層採 64px 全寬固定頂列、256／160px 側欄、736px 手機斷點。搜尋用 portal 進 header，但 ownership 留 FilePanel，結果留 main；controller 不跟呈現搬移。展開控制需送出／Escape 收合，避免蓋住麵包屑；固定 header 的層級也須實測跳至內容連結未受遮擋。57 項分批回歸、三視窗及 1920px／短側欄通過，依 P8.2。
- P8.1（0.39.2／schema 12）已以同源 WOFF2 建立 Roboto 400／500／700、Material 工具圖示與集中 token；raw 字型／授權 bytes 保留，正式 assets 附版次 Notice。font name table 不一定保留完整授權 metadata，Bold 缺項須明示，不能捏造。三視窗真實 HTTP／FontFace loaded 與 portal／授權回歸 12／12；8088 尚為 0.39.1。
- 增版後先完成主機權限的離線 frozen install，再跑 pnpm scripts，避免 verifyDepsBeforeRun 在並行 scripts 前各自嘗試安裝／撞 store lock；不得用停用此檢查掩蓋 metadata 未同步。P8.1 依賴與 lockfile未變。

- 2026-10-30 使用者明確改以 File Browser 實際畫面為目標，且要求全部畫面都看；P7 的 Stripe／Linear 視覺方向已被取代。已逐張檢視歷史 16 張＋新 49 張，來源、圖庫、尺寸與覆蓋界線見 `docs/reviews/filebrowser-visual-reference.md`。當時僅研究與規劃；後續實作與版本依 IMPLEMENTATION_PLAN，不把來源圖當產品驗收。
- File Browser 的三種模式不同：list 是 65px 詳細列，mosaic 是橫向圖示＋資訊的圖磚，gallery 是大圖庫。循環切換鈕上的圖示不能當成目前模式證據，擷取後須核對實際畫面／listing class；新圖 19／22／23 已依 pixels 更正名稱。研究時 FileHub defaultView／DB CHECK 只有 list／thumbnails；P8.3 已依新 migration／契約加入 mosaic，保留 thumbnails 舊值，不改舊 SQL。
- 固定來源 commit 833d9088 在隔離重建後 image／binary SHA 與原研究相同，瀏覽器版本與畫面資料仍可能不同。16 張歷史圖已核對 hash，原始證據不回寫。REA 被動 CDP 不能獨立證明 image；需結合 build、執行檔 hash 與容器 ownership。五筆完整 inline records 用 selected-records 包裝保存，不冒稱 canonical session bundle。
- 來源上傳浮動卡的外層 `.upload-files` 可是零高度，應等其 `.card.floating` 可見；切換檢視後等新 class／實際 item 可見再量測，避免拿 loading 或隱藏 header 的 0px 當正常尺寸。分享 QR 也會編碼秘密，研究畫面在 screenshot 時遮蔽；不事後修圖。
- 視覺可依適用授權直接沿用，實際取用字體／圖示／CSS 要保存來源與聲明；FileHub 品牌、session／CSRF、opaque grants、垃圾桶、UUID／controller 與安全 renderer 不隨外觀移植。來源新增檔案／編輯／影音／EPUB／tar／深色開關等沒有既有契約時不放假控制。

## P7 UI 原始規範與版面差距（歷史）

- P7.10 將原 0.33.0／8088 試用停機後完整備份，先以 0.39.1 在新 volume 還原並驗原密碼登入／逐檔下載，再更新三角色至同一固定 image。原三個使用者 volumes、備份／還原副本及舊 image 均保留；只清理隔離演練服務。真實備份、部署 env 與使用者畫面留在忽略位置，Git 只存筆數／驗證布林／manifest digest。

- P7.9 完整 Chromium 是 168 cases（含三視窗），隔離 CLI／KDF 成本使整批預算採 75 分鐘、core job 110 分鐘；單例 30 秒、expect 8 秒、零 retry／單 worker 保持。公開分享固定表格配置需同時驗手機下載按鈕在視窗內及資料夾連結至少 44px，避免高 specificity 的桌面規則蓋過手機規則。長表單截圖先回頂部／表格左端，保留原圖而不修圖。 私有管理頁的 page-heading 樣式須限 files-shell，避免影響公開狀態頁。

- P7.8 的分享／垃圾桶沿用根 query 並保留檔案上下文，SessionApp／Workspace 不重建。收合抽屜保留 DOM，同檔名可同時出現在檔案表與抽屜；測試先限定具名 region，不放寬 strict。公開分享仍不讀身份 API；撤銷 pending 經共同 guard 阻擋離開。 撤銷 busy 提示須在要求結束時清除，避免與已撤銷狀態矛盾。

- P7.7 的 TaskDrawer 只訂閱 Workspace 的 controller；進度／完成不強制重開抽屜，目的地 Modal 收合完成後才顯示工作。隱藏抽屜期間以公開 API 驗發布，再重開驗最新狀態與保留的 Modal 草稿。上傳發布仍遵守 P2／P5 的父子 reservation，不假設同入口 ZIP 排隊時可發布。

- P7.6 的私有設定沿用根 query，useLocation 以 history.state 整數索引復原取消的返回，不重新 push 造成歷史循環。SettingsPage 共同 guard 管分類／側欄／登出與 beforeunload；表單、File 與秘密不進導覽 state。設定頁不依 entries reload 卸載，只有管理分類按角色讀管理資料。

- P7.5 的手機導覽等 Drawer 收合後才執行動作；Drawer 保持 mounted，避免開場尚未完成就關閉時丟失 afterOpenChange(false)。鍵盤測試驗實際外層 focus trap；從帳號選單開 Modal 須等開場完成再送 Escape。

- P7.4 將 FilePanel 的呈現拆為 FileListing／ResourceActions／SelectionToolbar，保留 version 綁定選取與原 capability 條件。UI 測試須先等列表中的實際控制可見，再判斷桌面按鈕或手機選單；從選單開 Modal 後先等正式焦點完成再送 Escape。

- P7.3 的目前資料夾仍走 filter URL／版本分頁，遞迴搜尋沿用暫時狀態；切範圍清選取並取消結果。遞迴期間保留的目錄 filter 會明示暫停套用，清除或離開路徑後不帶回舊搜尋。

- P7.2 的路徑編輯必須在列表尚未載入時仍可操作，才能取消舊目錄請求；Escape 關閉後返回觸發按鈕。上傳選單使用原生 filechooser，Linux 測試核對兩種選取與實際 bytes，Windows 的 disabled 不作寫入證據。

- P7.1 使用每測試隔離的 66 項短名 fixture，加長中文、PNG／PDF 與空資料夾情境；修改殼層前先保存 0.33.0 三視窗基線。檔案區寬度應以 viewport 扣除 224px 側欄驗證，公開概覽／登入／分享不共用這項規則。

- 清空前 `77b606bb9bd552a00c5e13c3dc16571623548565:AGENTS.md` 保存完整 Stripe／Linear／Ant Design 視覺要求；重點是緊湊工具列、清楚主操作、資訊層級及適合承載內容的頁面，不只是藍色／14px／32px token。舊規範及舊原碼只作設計回查，不帶回舊後端或認證模型。
- 0.33.0 的 Workspace 在檔案列表前堆疊八組控制，再加麵包屑；全域 main 的 1120px／40px 基線原供公開概覽，也套用到檔案頁。差距記錄在 `docs/reviews/ui-layout-audit.md`；主計畫 P7 依序收斂，最新完成範圍依主計畫與各份驗證。功能驗收與整體視覺驗收分開。
- 原生 select 沿用既有 DESIGN 規範；歷史大型設定 Modal 已於 P7.6 改為設定頁，短表單仍用 Modal。P1.4 延後目錄樹的決策仍有效，不因版面整理加入預掃 NAS。功能與無溢位通過不代表視覺層級已驗收。
- P7 的單一進度來源仍是根 `IMPLEMENTATION_PLAN.md`。私有頁沿用根 query，不擴大靜態 fallback；Workspace 持續擁有 UploadController／OperationController。

## P6 發行驗收經驗

- 0.29.0 schema 10 的正式 image 已實測升至 schema 12，並以升級前完整快照／preserve-schema 加原 image 在新 volume 回復；原升級 DB 不降版。release project 的 receipt 只在 token 清理及其他服務 ID／StartedAt 比對後標 verified／cleaned，缺舊 image 直接失敗。
- canShare 讓唯讀平台也可選取資料夾以建立分享；UI 測試應檢查 copy／move／ZIP 能力是否停用，不能一概要求資料夾 checkbox disabled。平台拒絕寫入與可讀分享是不同能力。

## P6 維護經驗

- state shared／exclusive flock 只能協調參與它的程序；父程序退出後，inherited FD 的副作用 helper 仍可能活著。完整快照另驗 DB owner guard 與全部 guard files，缺失／busy 必須保留現場；不能以 PID 或 lease 推測 I/O 已停。
- 可攜還原不能只複製 DB 與 bytes。root／private control／trash／artifact／upload／share 綁定實體 identity，需以原 manifest 的精確 witness 證明後再綁新副本；未知 ownership 不採用。快照 DB 用 DELETE journal 並拒絕 sidecar，避免未 hash 的 WAL overlay。
- 還原的待完成 marker 可在工具崩潰釋放 flock 後繼續阻擋正式服務。還原前驗來源，完成 receipt／DB／檔案核對後才移除 marker；既有目標與失敗目錄不覆寫。

## P6 設定經驗

- grid 內含橫捲表格時需 minmax(0,1fr) 與子項 min-width:0；只檢查 dialog 的 scrollWidth 不足，body 可能已橫捲而外框正常。管理單欄位操作不夾帶 snapshot 的其他舊旗標，以免覆蓋另一個更新。

- Docker --cpus=2 下 Node availableParallelism 實測回 8，Vitest 預設排程會讓 KDF 密集案例超時並連帶觸發下一例 admission。固定最多 2 workers，fixture 直接 seed 合法合成 hash；實際登入／改密碼仍用完整 scrypt，時限不變。
- 設定表單用同 URL retainOnReload 避免卸載草稿；一般路徑列表維持舊結果隔離。AntD Modal 是 portal，需由 ConfigProvider 的 Modal root 明確提供 CSS 變數，不能假定繼承 .filehub-root。
- 管理 KDF／FS await 後須重驗 admin；寫入 opt-in 完成 private sync 後先存 owner 證據再驗最後啟用，撤權時不能遺失已知 ownership。

## P6 分享經驗

- 分享的 parent anchor 必須在同一次 fd 走訪驗證；先驗來源再另開 descendant 會留下替換窗口。持久來源另綁 birthtimeNs（拒絕缺少此資訊的來源 FS），避免只憑可重用 inode 認定長期相同物件。Windows 仍保留開發隔離限制。
- 公開 grant 與身份 session 分開；公開頁不請求 /api/session。密碼前 challenge 不回名稱，下載每段驗 owner／分享並等待 pending read 完成後關 handle。request digest 只能包含慢速密碼結果，不能另存快速密碼摘要。

## P5 持久工作經驗

- 真正 NFSv3 hard mount 在 exporter 暫停時，archive helper 的 thread 停在 rpc_wait_bit_killable。取消仍為 cancelling；父程序 SIGKILL 且 lease 過期後，helper 的 FD 3 仍阻擋新 OFD proof，重新啟動 worker 不重播。恢復後 proof／精確 witness 清理才可 cancelled，來源 SHA-256 未變；不能用 API 健康或 PID 消失推定 I/O 結束。
- 故障 harness 必須先恢復自己暫停的 exporter，再停止／核對自己的容器；只有驗證、其他服務身分／啟動時間與清理全過才寫 passed。NFS kernel／image／掛載能力缺少時直接失敗。1 MiB 私有 tmpfs 提供真實 ENOSPC，不填滿主機磁碟；正式 Compose 仍 drop ALL。

- P5.4 controller 隨 Workspace 存活，切頁保留 clipboard／工作；storage 只保存 userId 對應的最多 50 個 UUID。POST 回應遺失只 GET 同 ID。interrupted 的安全 retry 不增加 attempt，回應遺失後同 attempt 的 queued 仍須接受；舊 claim 由較低 attempt 擋下，不能將 interrupted → queued 一概視為舊回應。
- canCopy 讓 Linux 有下載權限的資料夾可作背景來源，不改變 canDownload 的單檔語意。目的地 scope 可寫與 root 的可重新命名能力分開；grant 的讀／寫採正向聯集。Modal 必須等 afterClose 才卸載，否則 Escape 無法返回原按鈕焦點。背景完成 reload listing，保留其他 Modal 的輸入。

- ZIP 的 artifact／item／job terminal 放同一短交易；executor 支援 handler 已原子完成的相同 owner／attempt。CRC／中央目錄除整合測試外，以 Python zipfile 檢查正式 image 輸出，不只驗 HTTP status。
- 產物放 state 私有範圍，沿用 EntryService 禁止註冊重疊 state 的隔離；預留 cache 根尚無獨立入口排除／ownership 模型，未啟用為 ZIP 位置。管理配額不是 filesystem 硬配額，DB-only backup 不包含 ZIP bytes。

- manifest 的根節點相對路徑為空字串；組合路徑不能直接呼叫要求非空 name 的 joinPath，否則變成尾端斜線而被 scoped storage 拒絕。使用 treePath 明確處理根。
- Docker 的 --tmpfs 設定位於 HostConfig.Tmpfs，不一定列於 inspect Mounts；資源 probe 同時核對精確 tmpfs 設定、無其他掛載與 token。ENOSPC 使用獨立 1 MiB tmpfs，避免填滿主機或其他案例的共享磁碟。

- DB lease 與 OS I/O liveness 是不同證據；OFD guard 要由所有副作用 helper 繼承。父程序退出而 helper 仍持有 fd 時，不能 fencing、取消成功或重跑。未知副作用保留 reservation；只有所有 item 未開始且舊 owner 已證明停止才允許明確 retry。
- idempotency 比對完整輸入前先固定 JSON 欄位順序；同 UUID 不因 HTTP 欄位順序改變而誤判不同要求。

## P4 搜尋與預覽經驗

- PDF canvas 預設寬 300，不能用 width>0 判定 render 完成；條件式 loading 尚未 mount 時 count=0 也會過早通過。E2E 應等實際圖形像素或明確 ready 狀態。P4.4 已以失敗截圖確認競態，修正後三視窗獨立驗證通過，保留首批失敗結果。

- P4.4 縮圖採可視範圍載入；E2E 必須捲到卡片再斷言 request／失敗，不可以未發請求的等待當作產品錯誤。瀏覽器 queue 一次一份、最多 64 等候，含排隊 12 秒；切換時 abort／釋放 URL，401 先清除 pending。

- P4.3 選擇明確有界的記憶體 LRU（32 項／16 MiB），沒有另加磁碟 ownership／清理或持久 jobs。來源 identity 含完整 SHA-256，cache 不代替開原檔／重授權；子程序亦核對傳入 hash，快速換檔不沿用舊衍生圖。支援 PNG／JPEG／WebP 8-bit，16-bit／動畫／超像素降級。

- P4.2 實測 FileHandle.createReadStream 的 destroy 會使後續 stat 得到 file closed，即使 autoClose=false；圖片子程序改借用 bounded read，Readable 僅管理資料流，等待 reader／child 結束後原建立者關閉 handle。取消不可先關 fd 再讓在途讀取繼續。
- 預覽新增 sharp 0.35.5／pdfjs-dist 6.4.299 精確依賴；PDF 只用 canvas／worker，不使用完整 viewer、annotations、forms 或 OpenAction。合成 HTML／PDF 腳本 canary 與正常圖形各自驗收，不宣稱所有 PDF／字型已相容。

- 名稱搜尋與列表篩選共用 EntryService／scoped storage，不建立第二套 path 或授權規則。入口消失會回 503；子項消失回部分結果。回傳前再驗 grant signature，撤權時不保留已收集結果。
- 大目錄量測固定記錄平台、檔數、掃描量、elapsed 與 RSS 差值；限時結果不代表已掃完整個樹，RSS 差值也不是程序 peak。瀏覽器取消用 AbortController 加 generation 防止晚到結果。

## 儲存庫狀態

- 舊版 FileHub 已在 `26d4bd6` 清空，該 commit 於本次對話推送到 `origin/main`；先前內容仍可從父 commit `77b606b` 查閱。
- P0–P7 的 43 份工作已完成；產品為 `0.40.6`／schema 13，8088 交付、原帳密與資料保存依 P7.10。2026-10-30 新增 P8 十份視覺還原工作，P8.1–P8.10 已完成，新增需求另列計畫；不再以「全計畫已完成」描述目前狀態。各份在 main 驗證後本機 commit、不 push；部署界線依 P6-matrix，歷史驗收不回寫。
- 2026-10-29：使用者要求實際操作，已用正式 0.33.0 image 在 Docker Desktop 建立 `filehub` project，現使用 `http://127.0.0.1:8088/`；`.env` 忽略且固定已驗 image ID。`filehub_state`／`filehub_files`／`filehub_cache` 是須保留的試用資料；「我的檔案」已開放寫入。隱藏互動輸入建立管理員，不將帳密存入文件／設定／腳本；正式上傳下載 580 bytes 及 Chromium 登入／文字預覽已驗，原有五服務未變。啟停方式依 `docs/operations/local-preview.md`。
- 同一 localhost Origin 曾跑其他前端時，主機 HTTP 200 與健康檢查不能代替使用者的實際分頁驗收。本次內建瀏覽器的 8080 分頁重新載入仍顯示舊 llama-ui／API 404；切換 8088 時同步 HTTP port 與 PUBLIC_ORIGIN、先停兩服務並保留 volumes。原帳密與 580-byte 檔案保留已驗，新分頁已成功登入。舊頁面狀態的確切來源未定，不將 Service Worker 推測寫成結論，也不清除舊站聊天資料。

## 來源與證據

- 本機參考來源為 `C:\Users\win10\Desktop\Github\filebrowser`，Git origin 為 `filebrowser/filebrowser`，基準 commit 為 `833d908884d5c801f30f5c098d7977177eb3a36b`。
- 來源是 Go 後端與 Vue 3／Pinia 前端，不能將其套件設定當作 FileHub 的現況。
- 參考來源保持不變；執行分析使用 `git archive` 的隔離副本。REA 用於實際瀏覽器觀察，完整原始碼分析使用一般檔案工具。
- 靜態來源、實測觀察及新設計建議必須分開標示；單一測試帳號或小量測試資料不能證明效能或所有權限組合。
- 指定來源已完成隔離前端型別檢查、Vite build 及 Go build；本次使用自行建置的程式，不是官方 release binary。
- 核心實測：資料夾 POST 200；23-byte TUS 上傳 POST 201／PATCH 204；重新命名 PATCH 200 且內容相同；刪除 DELETE 204 且檔案消失。完整證據在報告 06。
- 原研究視覺證據為 16 張 REA PNG、24 筆原始 records；2026-10-30 同版本補拍 49 張依全畫面審查。新舊圖的 SHA256 與 viewport 均已核對。
- 實測側欄自身有水平溢位；整頁 scrollWidth 沒超出 viewport 不能代表所有容器沒有溢位。
- 研究用容器、image tag 與獨立 Chrome 已在取證後移除／關閉；報告中的 localhost URL 不代表目前仍有服務。

## 文件與實作規則

- 專案入口是根目錄 `README.md`；後續實作依根目錄 `IMPLEMENTATION_PLAN.md` 的工作編號與狀態接續。架構與開發流程分別在 `ARCHITECTURE.md`、`CONTRIBUTING.md`，File Browser 專題研究位於 `docs/filebrowser-study/`。
- 2026-10-27：使用者要求建立可直接依循的 P0–P6 主計畫，包含每份工作內容、預計修改位置、參考文件／原碼及驗收。建立時共 33 份初始工作，皆未開始，起點 P0.1；後續進度以主計畫為準。決策與驗證摘要於實作時分別放 `docs/decisions/`、`docs/validation/`，不要寫入歷史研究證據目錄。
- 清空前 FileHub 的原碼與測試可從 `77b606bb9bd552a00c5e13c3dc16571623548565` 用 `git show` 讀取，作需求與回歸參考；不代表目前程式存在或舊測試已通過，也不直接恢復整個舊版工作目錄。
- 根 package.json 為版本來源，P0.1–P0.7 分別為 `0.1.0` 至 `0.7.0`，三個私有 workspace 同版；發行時同步 Docker label、Compose／env image tag，Compose fixture 從根版本讀取。DB schema revision 目前為 13，僅文件變動不增加應用程式版本。
- 新實作必須重新處理工作階段撤銷、檔案操作權限、路徑邊界及刪除政策；不能只搬用參考程式外觀。

## 已確認的新版本需求

- 2026-10-27：使用者確認同時需要「由 FileHub 上傳與管理的儲存區」及「外部既有資料夾／NAS／NFS，其他程式也可能修改」兩種用途。
- 2026-10-27：使用者確認後端為 Node.js＋TypeScript＋Fastify，單元／整合測試用 Vitest，HTTP／瀏覽器 E2E 用 Playwright；Go／FastAPI 不再是新版後端候選。
- 2026-10-27：使用者確認第一版正式部署為單台 Linux 主機、Docker Compose。P0.5 固定 Debian Bookworm／linux/amd64 image，實測為 Docker Desktop WSL2／ext4；Windows 原生正式部署、裸機與真實 NAS 故障不在已驗證範圍。
- 2026-10-27：使用者確認 SQLite（WAL），API 與 worker 同一 image、各一實例。P0.5 已以相同 image ID 驗證兩服務、本機 state 與 Linux bind 身份／唯讀／可寫／EACCES，細節見部署決策及驗證摘要。
- 2026-10-27：使用者確認 Node 24.22.1 LTS、better-sqlite3 13.0.3、Drizzle ORM 0.45.4／Kit 0.31.11、pnpm 12.16.0。P0.1 已在 Windows x64 用隔離工具完成乾淨 frozen install；原生 SQLite 實測 3.53.4、WAL、Drizzle rollback／重開讀取通過。這不是正式 DB adapter 或多程序驗證。
- P0.1 選定 TypeScript 6.0.3、Fastify 5.12.7、TypeBox 1.4.3／provider 6.3.0、Vitest 5.0.5、Playwright 1.64.1 及其餘精確依賴，詳見 `docs/decisions/P0-tooling.md`。typescript-eslint 8.72.0 的 TS peer 小於 6.1，因此未採 TS 7；固定 image digest 與 Linux 驗證見 P0.5。
- pnpm 12 不接受舊的 packageManagerStrict／packageManagerStrictVersion／managePackageManagerVersions；工程設定放 workspace YAML。minimumReleaseAgeStrict 防止靜默新增發布等待例外；build scripts 明確 allowlist。工具／store 在忽略的 .tools，未修改全域 Node／pnpm。
- P0.1 的 typecheck、lint、2 個工具鏈測試、build 與清理依賴後重裝均通過，lockfile 前後 hash 相同；TS2322 與瀏覽器 Node import 的反向檢查有效。完整命令與未驗證範圍見 `docs/validation/P0.1.md`。
- P0.3 已使用 Kit 產生 SQL／metadata，以 ORM runtime migrator 的編譯入口執行一次性 migration，不使用 schema push；同步交易不包含 async callback／檔案 I/O。P0.4／P0.5 已驗真正 API／worker 與 Docker gate；P0.7 補共用驗收及 CI 設定，hosted jobs 未執行。
- 架構規劃採 workspace 邊界與模組化單體；Fastify 工廠、API 及 worker 啟動入口分離，前端只引用公開 contracts。兩服務共用短交易、持久工作領取及資源協調，不假設 lease 失效就能安全重跑在途檔案操作。
- migration 為同 image 的一次性步驟，成功後才啟 API／worker；SQLite 備份與原檔備份分開定義，兩服務停止或採備份 API 取得一致 DB 副本，並做還原驗證。
- 開發流程採行為契約與必要測試先行、小切片實作、隔離 FS／DB 驗證、適用的型別／build／UI 檢查，再更新版本文件與 scoped commit。僅文件變更不增加應用程式版號。

## P0.2 API 與生命週期經驗

- `buildApp({ config, dependencies })` 只組裝 Fastify；`parseConfig` 明確呼叫才讀設定，`server.ts` 由 `import.meta.main` 區分匯入與直接執行。`main` 才註冊 signal handlers、listen；`closeApp` 共用同一關閉 Promise，啟動失敗亦清理 app。
- readiness probe 是借用的函式，呼叫端保有依賴資源；檢查逾時、拋錯或關閉都回未就緒並通知 AbortSignal。P0.2 曾用最小 API 預設 probe；P0.3 起缺 probe 預設 503，正式 API 改驗 adapter／schema 狀態。
- Fastify 5.12.7 的頂層 `disableRequestLogging` 會產生 FSTDEP023；改用 `LogController`。一般錯誤只記錄固定事件與 requestId，避免原始 URL、驗證輸入與 exception 內容流入預設日誌／回應。
- P0.2 在 Windows 10 x64 通過 typecheck、lint、build 與 40 項測試（工具鏈 2、設定 16、application／生命週期 16、真實 HTTP／產物 6）；frozen install 不改 lockfile。子程序 `process.emit('SIGTERM')` 只證明已註冊 callback 能關閉，Linux／Docker 真正 signal 與 worker 待後續驗證。詳見 `docs/validation/P0.2.md`。

## P0.3 SQLite 與 migration 經驗

- 正式 DB adapter 只開既有 `filehub.db`，migration 才建立本機 state／啟用 WAL；API main 擁有並清理 DB，factory 只借用 probe。未知 schema 在 migration 前拒絕，不改其 journal mode；schema 或 history 被改動時，下一次 readiness 即回 503。
- Drizzle ORM 0.45.4 migrator 只比對最後時間戳，未自行驗已套用 SQL hash。本專案先核對完整已知前綴，再核對 `schema_state` revision；拒絕較新、缺漏或修改過的 history。失敗 SQL 回滾，但 Drizzle 可能留下空 journal table；修正未套用的 SQL 後可重試。SQL 的 LF 由 `.gitattributes` 固定。
- 連線核對 SQLite 3.53.4、WAL、外鍵 ON、FULL、autocheckpoint 1000；busy 預設 100ms、上限 1000ms，無外加重試。Windows 雙程序實測設定 100ms 時一次等待約 173ms，queued HTTP 約 177ms；這是單一 fixture，證明同步阻塞，不能視為 100ms wall-clock 保證或效能基準。
- 備份使用 driver backup API，驗 integrity／foreign keys／history 後還原到全新目錄。已實測未 checkpoint 的已提交 WAL 資料、還原後重開讀寫，以及拒絕損毀／不相容檔案與既有目錄；不手動刪 WAL／SHM。
- 空 DB 判斷需涵蓋 table／view 等非內部 schema objects，不能只查 tables；SQL LIKE 的底線是萬用字元，排除 SQLite 內部名稱時用 GLOB 的字面底線，避免略過 `sqliteLegacy` 這類合法自訂表。兩種案例均先重現錯誤，修正後保留既有 schema／資料與 journal mode。
- P0.3 的 typecheck、lint、build 與 75 項測試通過（2 toolchain、25 unit、36 integration、12 HTTP／產物），Kit 再生成無差異、metadata check 通過，既有第三方版本及 lockfile 不變。完整結果及 Linux／worker／完整備份的限制見 `docs/validation/P0.3.md`。

## P0.4 worker 與程序生命週期

- Worker main 只開既有 DB，初始未就緒即失敗並關閉連線；執行中的 schema 不符轉 unavailable，恢復後回 idle。poll 預設 1000ms，沒有業務 tables、工作領取或重播。P0.4 的狀態僅在記憶體；P0.5 補上可選 tmpfs heartbeat，沒有新增 DB tables。
- API／worker 共用設定驗證、`createShutdown` 與 signal helper；重複 close 共用 Promise，關閉後移除自身 handlers。worker 的 close／done 在 loop 停止後清理 DB；`worker.stop()` 只管理借用 controller，owner 仍須等待服務 done。期限不會中斷同步或核心 I/O。
- 本機 Vitest fake timers 未推進 `node:timers/promises` 的實際等待，曾造成 2 個 idle 單元 assertion 失敗。改為以真實 onCheck 通知等待狀態，並由正常停止的服務子程序自然退出證明 timer 清理；不使用假時鐘計數宣稱原生 timer 已清除。
- 系統 fixture 只終止自己建立的子程序，清理前等待退出、關閉連線並核對 realpath。兩個正式入口使用不同 cwd、同一絕對 state；實測 SQLite 均 3.53.4／WAL，分開停止與重啟後另一服務仍可運作，原始 DB 可重開，fixture 可移除。
- Windows 正常停止以測試 wrapper 的 `process.emit('SIGINT'/'SIGTERM')` 驗 callback；正式入口沒有 IPC 控制介面。無 IPC 的 worker CLI 另外驗多輪檢查與強制終止後 DB 重開；這不是 Linux OS signal 或工作恢復驗證。
- P0.4 typecheck、lint、乾淨 build 與 107 項測試通過（2 toolchain、46 unit、40 integration、12 HTTP、7 system）；第三方版本、lockfile、schema／migration 不變，詳見 `docs/validation/P0.4.md`。

## P0.5 Linux Compose 與維護經驗

- 基底固定 Node 24.22.1 Bookworm slim 的 amd64 manifest digest；Builder 以 pnpm 12.16.0 frozen install／build，legacy production deploy 保留 server 的 dist／drizzle 與 contracts，不跨平台複製 node_modules。實際 Linux SQLite 仍為 3.53.4；Kit／TS／Vitest 不在 runtime 安裝。
- Compose 的三角色同 image，migration 成功才放行兩服務；UID/GID 1000、read-only rootfs、本機 local state／files／cache、有限資源與私有 tmpfs。啟動不自動修復使用者目錄 owner；外部 bind 範例預設唯讀且不自動建立來源。
- Worker main 改 async，呼叫端須 await。heartbeat 原子合併發布 state／checks／時間與 PID／Linux starttime；healthcheck 驗 freshness、同一存活程序與 DB。真實 SIGSTOP 後 unhealthy、SIGCONT 後恢復，證明不能以另一條 DB 連線代替 loop 進度；此機制不是 job lease。
- DB 維護 CLI 不替操作者停機。還原核心拒絕既有目錄，Docker mount 根目錄已存在，故新 volume 使用 `/data/state/restored` 子目錄並讓三角色配置一致；已驗停機備份、新 volume 還原與再次啟動，不覆寫原 state。完整原檔／金鑰／工作一致性留 P6.3。
- Compose 測試獨立於不需要 Docker 的 pnpm check；缺少 Docker／image 直接失敗。唯一 project／token、動態 loopback 埠、ownership／realpath 核對後清理，root helper 只準備本次 fixture volume。Windows 的 CLI -e 程式若在 template literal 中直接寫換行跳脫會失效，mountinfo 測試改用字元碼，保留檔案系統斷言。
- P0.5 型別／lint／乾淨 build、121 原生與 4 Compose tests 通過，lockfile／既有 migration 未變。Linux 實測是 Docker Desktop WSL2／amd64／ext4，非真實 NFS／SMB 故障或完整產品回復；操作及結果見 `docs/operations/deployment.md`、`docs/validation/P0.5.md`。

## P0.6 SPA、API client 與瀏覽器經驗

- 既有 React／AntD／Vite 版本不變，新增 static 10.1.7，web 明確引用既有 typebox 1.4.3；單一 lockfile 更新。TypeScript dist 與 Vite build 分開，產物須同時排除 Git／Docker／ESLint，避免第二次 lint 掃到 bundle。
- 正式 API 以模組相對的 apps/web/build 提供首頁與已建 assets，factory webRoot 為 opt-in；未知 API／檔案保持 JSON 404，不建全域 fallback。plugin setHeaders 也套用 sendFile(index)，只設定 cacheControl:false 不足，須明確讓 HTML no-store、hash assets immutable。
- API client 逐次驗公開 schema 與 HTTP 語意，503 not_ready 為正常狀態；只回固定錯誤文字與合法 requestId，不反射任意 message／HTML／exception。取消／卸載會 abort，舊結果不覆蓋新畫面。
- Playwright registry 在載入時決定 browser 路徑，須由 wrapper 先設定本機 .tools，再動態載入 CLI。NO_COLOR／FORCE_COLOR 衝突曾讓 18 個案例在 strict stderr 收尾失敗；trace 確認後正規化 fixture 環境，保留警告與清理斷言，整批重跑通過。
- 每測試使用專屬 file-backed DB、編譯 API、動態 loopback 埠與 browser context，測試 IPC 不加入正式入口。關 app／DB 並自然退出後才以 realpath guard 刪自有目錄；不重用一般服務。
- P0.6 142 原生、18 Chromium、4 Compose tests 與乾淨 build／型別／lint 通過。Windows Chromium 156.0.8078.4 的 1440／800／390 視窗已檢視，主要容器無水平溢位；Linux image 的 HTML／CSS／JS 與 Windows build SHA256 相同。截圖是畫面證據，非跨平台 pixel golden；P0.7 延伸 Linux Chromium／CI 設定，其他瀏覽器與真實手機／NAS 故障仍未驗。

## P0.7 共用驗收與 CI 經驗

- runner-independent 的目錄 helper 保存 realpath／device／inode；清理前拒絕 symlink／junction 與同一路徑的替換目錄，拒絕後保留現場。建立者先關閉 DB／子程序／Docker 資源；dispose 共用 Promise，重複清理不再操作 FS。
- Node 子程序 helper 共用 IPC／輸出有界等待，僅終止自己的 child；Playwright 與 system 共用測試 service wrapper。環境 helper 過濾繼承 FILEHUB／Node 選項／色彩設定，不修改父程序；正式入口沒有測試 IPC。
- 乾淨 Linux 暴露 API 整合測試需要完整 web build；check 改為 metadata／typecheck／lint、一次 build、各層原生 tests，獨立 test:integration 也先 build。不能以工作目錄殘留產物證明乾淨 checkout 可用。
- Docker ps 不支援此處的否定 label filter；以 inspect 結果排除有 filehub.test-run ownership label 的其他驗收容器，再比對原有服務 ID／StartedAt。否則其他驗收正常退出會被誤判為服務受影響；自有資源清理仍須逐一核對 token。
- verify:core 加 Chromium，verify:p0 再建根版本正式 image／跑 Compose；check:project 檢查四套件／工具鏈／image 版本，Compose fixture 不再硬編碼 tag。P0.7 為 0.7.0，第三方版本、lockfile 與 schema／初始 migration 不變。
- CI 設定 Windows Server 2022／Ubuntu 24.04 core 及 Ubuntu Compose，Actions 固定 SHA，明確 frozen install；本機 Windows／隔離 Debian 的核心與 Chromium 已驗，workflow 經 actionlint。只 commit 未 push，GitHub hosted jobs 仍未執行；Linux CI image 無主機掛載／socket，測試資源限制不作容量保證。細節見 docs/validation/P0.7.md 與 docs/operations/p0-checklist.md。

## P1.1 Identity 與 session

- IdentityService 借用正式 DB；API main 擁有連線，CLI 每次建立／關閉自己連線。schema 2 新增 users／sessions／login_throttle；revision 1 升級保留既有資料，舊 SQL bytes 不變。readiness 回復測試引用現行 SCHEMA_REVISION，不能永久硬編碼 1。
- session raw token 只存在 HttpOnly Cookie，DB 保存 SHA256，逐次查目前帳號狀態；CSRF 由 session domain-separated HMAC 派生，只回 JSON／記憶體使用。logout 刪本 session，CLI 改密碼／停用同短交易撤銷全部，拒絕最後 admin 停用。
- scrypt 為非同步固定 N=131072／r=8／p=1、每程序 KDF admission 1，持久 15 分鐘 account 5／IP 30 節流；不在 KDF 等待時持有 DB transaction，之後重驗帳號／密碼 hash。正式 512 MiB Linux API 登入／logout／重播已驗。
- CLI 密碼不進 argv／env；TTY 以不回顯的 readline output 實測完成。stdin JSON 使用 UTF-8 decoder，避免多位元組跨 chunk 被破壞；真實 CLI／API 程序驗改密碼後舊 session 401。Origin 使用可信設定／實際 socket port，不採任意 Host／proxy header；HTTPS origin 發 Secure Cookie。

## P1.2 入口與路徑

- schema 3 加入 entries／grants，stable UUID 與私有 root identity 分開；member 只見有 grant 的入口，scope／download 逐請求重查。根為空字串、父子 grant 聯集，未知 capability 預設拒絕，任何 P1 入口均不提供寫入。
- 註冊只接受既有實體目錄，不建立或 chown。拒絕相同／父子／identity 與 state 重疊，包含停用入口；raw host path 不進公開 DTO。最多 100 entries／每帳號 100 grants，metadata 不預先索引原檔。
- Linux 使用 /proc/self/fd、O_DIRECTORY／O_NOFOLLOW 與最後 O_NONBLOCK，caller 擁有最終 handle；實測開啟目錄改名並換成外部 link 後仍讀原內容。Windows Node 可開 directory FileHandle，普通替換後 verify 拒絕；不當作惡意本機 race 或 Windows 正式保證。
- URL path canonical、只解碼一次；Unicode／字面百分號不正規化。Windows 裝置名、ADS、尾端 dot／space 另拒絕。外部 root 離線或 identity 改變拒絕接管；NAS／inode 重用／核心 I/O 不作永久內容 ID 或強制取消保證。

## P1.3 有界讀取

- FileService 不建全量 FS index：每目錄上限 5000、每頁 100、每批 8 lstat 且等待 allSettled、每程序 4 FS 操作／下載。版本基於 stat／grant 快照，外部改名替換刪除重新掃描；不是 content hash 或原子快照。
- Node 24.22.1 opendir 支援 buffer 名稱，但固定 @types/node 24.19.2 漏列，採單行有理由 ts-expect-error；raw UTF-8 不能往返者明確 omitted，合法 Unicode／百分號仍可用，Windows／Linux 均有實測。
- 下載使用 handle／64 KiB backpressure／捕捉 end，偵測提前 EOF，送出前重驗 session／grant；HEAD 明確註冊、不建立 reader，避免 Fastify 自動 HEAD wrapper 改寫 Content-Length。Range 僅 single，未知單位／multi／If-Range 保守完整回應，ETag 為 weak。
- 真實 TCP 128 MiB fixture 已測中斷後 active=0、HEAD 長度及 2 秒 app 關閉。global fetch pool 可能留下測試空閒連線，生命週期測試改自有 http.Agent，不以增加 timeout 掩蓋。HTTP plugin 只關自己下載，所有錯誤先遮蔽 host path；schema 3／依賴／舊 SQL 不變。

## P1.4 工作空間與 Linux 瀏覽器

- 首頁登入／唯讀 workspace 用 query／History 保存 entry／path／sort／版本分頁；`/?view=status` 為公開概覽。user／CSRF 只在 React 記憶體；原生 attachment 下載再驗權限，不以整份 Blob 或假進度處理大型檔案。
- 入口與 scope 麵包屑分開，只讀當前層，不遞迴掃目錄樹。URL／列表版本綁選取，useResource 以 key／代次加 abort 防舊結果；三視窗已驗深連結／刷新／分頁／切入口、真實 bytes、scope、鍵盤與無水平溢位。
- Ant Design button.autoInsertSpace=false 讓中文標籤一致；定位手機原生選單應使用 combobox role，單用 label 可能同時匹配隱藏 nav。Table 全選 checkbox 另給中文名稱。
- Debian CI image 未設 locale 時 Chromium 中文下載名變 download；同 image 只設 LANG／LC_ALL=C.UTF-8 的對照通過，已固定 ENV 並重跑全部 Linux 核心／30 browser。正式 server 標頭不變。workspace／概覽分塊載入後無大型 chunk 警告；原有依賴不變。

## P1.5 完整唯讀驗收

- Workspace fixture 使用正式編譯 CLI／stdin 初始化帳號、兩類入口及 grant，再由獨立 API／Chromium 操作；CLI 只用本次 state、8 秒期限／64 KiB 輸出上限，owner abort 並等 close／preparation settled 後才清理目錄。
- 拒絕測試比對七個管理 tables 的 logical rows 及兩入口的名稱／identity／mode／mtime-ctime／bytes digest；不將 OS atime 或 DB-WAL-SHM 檔案 bytes 當不變性。登入節流／授權 CLI 的正常寫入另計；撤權、登出重播與離線失敗均有前後比對。
- 故障注入只 rename 自有固定 sibling，驗 parent、dev-inode、非 symlink 及不存在的目的地；恢復同 root 後 UI 可重試。schema 2 升至 3 保留帳號 hash／session／節流且可登入與註冊新入口，初始及已套用 SQL 不改。
- AntD loading 圖示可能改變可存取名稱；登入／登出／選取下載使用穩定 aria-label，另設 aria-busy。失敗登出後仍能重試，不能以擴大 selector 隱藏產品的名稱問題。
- 最終 Windows／Debian 各 209 原生與 45 Chromium、4 正式 Compose 全通過，無 retry／skip。45 cases 的 suite cap 450 秒依數量等比調整，單 case 30 秒不變；實際 browser 約 6.3／5.6 分鐘。限制與證據依 P1.5 receipt，不宣稱 hosted CI 或真實掛載故障已驗證。

## P2.1 寫入意圖

- schema 4 追加 write_intents；schema 3 升級保留帳號／入口／grant，舊 SQL／snapshot bytes 不改。活動子樹 reservation 以正式 WAL 短交易跨程序協調；owner／generation 更新有條件，needs_review 不釋放資源。
- 真實雙程序殺掉原 owner 後，新 instance 仍被 prepared 阻擋；不能以程序內鎖或時間逾期當恢復證明。本份未執行公開檔案寫入，P2.2 才接原子 FS adapter。Windows／Linux 各 233 原生、選定 3 Chromium、4 Compose 通過，細節依 P2.1 receipt。

## P2.2 同步寫入

- schema 5 加入入口 writable／control identity 與 grant canWrite，預設 false；`.filehub` exclusive 初始化，不採用既有內容。私有 namespace 對公開路徑不可見。
- Linux helper 在繼承 fd 上以 renameat2 NOREPLACE 發布，對 source stat 再檢查；OFD flock 由 Node 與在途 helper 共享，不以容器 PID 推測 liveness。Node guard 待操作結束後才關。
- 同名、舊版本、來源消失、Unicode／大小寫、根／scope、session／Origin／CSRF 與權限拒絕已有隔離案例。Windows 明確 unsupported，實際 Linux 寫入與 UI 依 P2.2 receipt，不將兩平台結果混用。

## P2.3 垃圾桶

- schema 6 新增 trash_items；準備／完成與寫入意圖共用短交易。每入口私有 trash 使用同 FS NOREPLACE rename，不提供永久刪除、自動到期或跨 FS 複製 fallback。
- member 僅見目前 scope 內自己的紀錄；admin 可見入口內項目，還原仍重驗入口開關／來源與目的地權限。payload 缺失／替換顯示 needs_review 並 disabled，GET 不直接修復 DB。
- 每入口最多 1000 歷史紀錄、列表 50／頁，無 unbounded 掃描；已驗 bytes／inode、目錄子內容、同名保留／換名還原、撤權與三視窗真實下載。結果及平台界線依 P2.3 receipt。

## P2.4 恢復與故障

- recoverWrites 先以另一個 OFD 取得舊 guard 的 flock，再持本次 guard 及條件 owner／generation fencing；不依 PID、TTL 或 exists 就偷取。缺檔／無法證明為 owner_unknown，busy 不改 row，未知兩邊物件保留 needs_review reservation。
- 受控恢復只觀察／fsync，不執行 rename／unlink／copy。準備階段失敗、來源匹配且目的不存在失敗、來源不存在且目的 witness 匹配才確認完成；trash 管理紀錄一起提交。CLI 逐項結果，全部可判讀 exit 0，未解決 exit 2，平台／設定錯誤 exit 1。
- Linux 真子程序 kill、雙程序競爭、繼承 fd 在 owner 結束後繼續持鎖、EACCES／tmpfs EXDEV 與 ENOSPC／EIO 注入已有案例；不是硬體斷電或真實 NAS 故障保證。正式 wrapper 無 IPC／故障環境選項。
- UI 對 POST 回應遺失查相同 UUID，只有一次 POST，確認成功後再刷新；查詢 401 清除受保護狀態。還原位置 metadata 有等待文字。guard 初始化失敗無存活 handle，close 不重拋已回報的初始化錯誤，API 最後仍關 DB。

- Compose 的動態 published port 在 stop／up 後可改變，重啟驗收必須重新 inspect，不沿用舊 URL。最終打包需核對實際 image 內含最後 evidence／guard 修正，避免把不同建置時點混成同一次驗收。

- P2 最終 Windows／Linux 各 257 原生與 54 Chromium、正式 image 的 4 Compose 通過；另以最終原碼補驗 13 恢復／故障及 6 API client。正式跨容器 owner proof、寫入／垃圾桶／還原 bytes 已驗，結果與邊界依 P2.4 receipt；P3 未開始。

## P3.1 Session 協定

- upload catalog 借用正式 DB／EntryService，建立與配額在短交易中，目錄驗證在交易外；UUID 只重用相同 owner 與完整輸入，查詢不洩漏 private identity。
- 到期時間固定，不因重開或 idempotent create 延長。取消已知沒有 payload 的 open session 才可立即釋放；在途 owner 或既有 payload 保留紀錄及容量，清理另走 ownership 證據。
- TypeBox literal union 使用明確 tuple，對動態 map 的 string literals 會推成 never；與 P2 相同，避免這種 schema 寫法。
- P3.1 Windows／Linux 各 263 原生、選定各 3 Chromium、正式 Compose 4 cases 通過；schema 6 升級保留 P2 資料與外鍵。範圍依 P3.1 receipt，接 P3.2。

## P3.2 接收與發布

- 大型 Buffer 的 Vitest 深比較會產生巨大 assertion 結構，Linux 2 GiB focused run 曾耗盡 worker heap。完整 bytes 證據改用 Buffer.equals，並保留 hash／長度核對；不靠擴大 heap 或跳過 cases。
- 私有 payload exclusive 初始化後才保存 dev／inode；未知既有檔、hardlink、staging identity 改變均不採用。已 fsync 但 DB offset 未提交時只能回復未提交尾端；DB 無法更新則保留 owner。
- upload 接收 guard 與 MutationService 發布 guard 不同；恢復須取得兩者釋放證據，並驗 publication row／source／target／hash／size／witness。一個 owner 關閉不能作為整個發布操作已結束的保證。
- P3.2 最終 Windows／Linux 各 274 原生與選定各 3 Chromium、正式 Compose 4 cases 通過。接收／發布、真實 TCP abort 及雙 owner 的 hash 恢復依 P3.2 receipt；到期清理與接收中程序中斷接 P3.4。

## P3.3 上傳介面

- 在 Workspace 持有 controller，目錄或列表刷新只替換 FilePanel；StrictMode 的 effect setup／cleanup／setup 用代次處理，真正卸載才取消自己的請求。非同步回應及進度不能復活卸載後狀態。
- E2E runner 沒有 Vitest 的 contracts alias；根 package 未宣告的 transitive import 會收集失敗。上傳測試固定公開 v1 的 4 MiB 外部邊界，不為測試新增第三方或根依賴。
- 未清理 session 必須優先於近期完成歷史，否則刷新時 50 筆列表可能找不到較舊的可續傳項目。FileList 不含空目錄，不能將推測出的空資料夾當成已上傳。
- P3.3 各平台 291 原生通過；Linux 66 browser 單批通過，Windows 62 通過後 global cap 結束，剩餘 4 個另外補跑全過；不能混稱單批 66 通過。各 12 上傳 focused 與正式 Compose 4 cases 亦過；依 P3.3 receipt。suite cap 改 990s 供隔離 CLI／KDF provisioning，case 30s／零 retry 不變。

## P3.4 清理與重啟

- 真正子程序在 claimed／received／verified 被終止後，先取得舊 OFD guard，再驗已提交 hashes 並只回復尾端；不自動發布。維護每批四筆並輪轉，cleanup 的 witness／inode／nlink／控制目錄都須對應。
- unlink 已成功但 DB 未提交時保留 cancelled／expired 及 owner；證明舊 owner 結束、私有檔缺失並完成 parent fsync 才釋放容量。未知物件不採用，不遞迴刪除或移除 guard。
- 正式 image ENTRYPOINT 已是 node，Docker run 的 Node -e probe 不能再加一個 node。專屬 8 MiB tmpfs 真實 ENOSPC 已驗 prefix／原檔不變、清理釋放及重新發布；它不是硬體／NAS 故障保證。
- 新 CLI 以正式 image／私有 tmpfs 驗真正 exit 0／busy exit 2；單次最多四筆，exit 0 不能解讀成全域已掃完。worker 對自己已結束的前批可持同一 guard 再觀察，別的 owner 仍需 OS proof。
- P3.4 兩平台完整 310 原生＋72 browser 通過。其後重現並修正背景完成重建 FilePanel 會關閉 Modal；最後再驗各 310 原生＋全部 18 上傳 cases、最新 image 的 5 Compose 與 CLI probe；完整 72 與最後 18 的建置範圍分開，依 P3.4 receipt。
- P3.1–P3.4 已依序完成並本機 commit、不 push，版本 0.20.0／schema 7。停止於 P4 前，下一份 P4.1；不要把 UI 刷新改回 key remount，應只 reload listing 保留輸入／UUID。
