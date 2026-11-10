# P11 遠端 FileHub 瀏覽

2026-11-10，依使用者確認的 B → A → C 瀏覽需求實作。進度以[主計畫](../../IMPLEMENTATION_PLAN.md#p11-透過-a-瀏覽-a-與-c-的檔案)為準。

## 使用方式與授權

B 登入 A，在原有工作空間切換 A 的本機入口及 C 的遠端入口。C 建立無密碼的資料夾分享，A 管理員將該授權連結加入伺服器私有設定。遠端入口提供目錄瀏覽、檔案清單、排序、分頁及目前目錄名稱篩選。

沿用 C 的分享授權，包含來源識別、目前 owner grant、到期及撤銷。連結最長 30 天，到期時由管理員更新設定。A 的 admin 可查看設定的來源，member 僅能查看設定中列出的帳號。A 每次及網路等待後重新核對自己的使用者與 session，C 每次讀取重新核對分享。C 的授權或連線故障回傳來源錯誤，B 在 A 的登入仍可操作 A 的檔案。

## 設定與資料邊界

`FILEHUB_REMOTE_SOURCES_FILE` 指向伺服器私有 JSON 檔，啟動時驗證、載入，修改後重啟 API。格式為 `version: 1` 與 `sources` 陣列，每筆包含固定 UUID、顯示名稱、C 資料夾分享 URL、固定目標 IP、允許的 A 帳號清單。HTTP 來源須逐筆明確啟用 `allowHttp`。最多 16 個來源，設定檔最多 64 KiB。Linux 要求 UID 相符、一般檔案及 0600 權限。

來源 UUID 不得與 A 的本機入口衝突。遠端來源保持伺服器設定，公開 entry 增加 `remote` 類型，僅回傳 opaque ID、標籤及瀏覽範圍。C 位址、分享秘密及 C session Cookie 都留在 A 後端，B 的請求不接受目標 URL。A 與 C 分別使用自己的本機 SQLite，schema 13 沿用。完整備份時將來源設定放入既有 deployment config 目錄一併保存，恢復後重新核對 IP、分享及帳號。

## 傳輸與失敗

僅呼叫分享 API 的固定路由。目標 IP 固定於可信設定，使用 Node HTTP／HTTPS 的 lookup 連接指定 IP，HTTPS 仍核對 C 的憑證與 hostname。拒絕 redirects，避免來源要求 A 改連其他位置。設定與公開 API 都驗證格式，路徑使用既有正規化，遠端 JSON 以公開 share schemas 驗證，回應另核對請求的 path、分頁及項目路徑。

每份瀏覽最多 5 秒，單份 JSON 最多 1 MiB，A 同時最多四份遠端操作。取消及服務關閉會中止自有 socket。C session 僅保留記憶體，每來源單一登入 Promise 合併並行存取，失效後由後續操作重新建立。未知或錯誤回應回固定 `REMOTE_UNAVAILABLE`，不轉送上游錯誤、Cookie、URL 或主機路徑。

Node 的 timeout 事件需要程式實際關閉請求，實作使用 AbortSignal；固定來源與拒絕重新導向的設計參考 Node 官方 HTTP 文件及 OWASP SSRF 指引。[Node HTTP](https://nodejs.org/docs/latest-v24.x/api/http.html)、[OWASP SSRF](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)

## 工作空間與驗證

沿用入口導覽、PathNavigation、FileListing、列表／圖磚／圖庫、排序及分頁。來源標示「遠端 FileHub」，檔案能力以瀏覽清單呈現。下載、預覽、寫入、分享、垃圾桶與跨機同步保留為後續需求，遠端來源不顯示可執行的這些控制。搜尋提供目前資料夾名稱篩選。

驗收使用 A、C 各自獨立 DB／儲存與真實 HTTP，檢查巢狀資料夾、分頁／排序／篩選、A 帳號授權、C 撤銷／到期、斷線及恢復、路徑拒絕、秘密隔離與原有本機功能。瀏覽器三視窗確認 B 只向 A 發送請求。正式 image 與隔離 Compose 另驗選配的私有設定掛載。
