# P8.3 三種檢視與偏好

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

## 呈現

沿用 [File Browser 來源](../reviews/filebrowser-visual-reference.md)的 list／mosaic／gallery 幾何、`listing-icons.css` 與本機 Material filled：詳細列表正常列 65px／圖示 32px；橫向圖磚正常 80px／64px 圖示；圖庫正常 208px、192px 圖像區／128px 圖示。桌面 auto-fill 最小 240px 卡片，1440px 為四欄 272px，手機單欄；長名可增加高度，完整名稱不裁切。

圖磚／圖庫以資料夾、檔案加標題，順序與分頁仍採同一 API snapshot，不另排序或取得整棵樹。三模式共用 version 綁定選取、開啟、預覽、分頁及能力。卡片下載沿用選取工具列，移除逐張重複下載按鈕；checkbox 放右上，避免擋住圖示開啟，手機 44px。P8.4 再改情境工具列與選取模式。

圖片仍走有界 ThumbnailQueue／JPEG endpoint、blob URL／取消／401 清除；音訊／影片等只有檔案類型圖示，不代表新增播放器或 renderer。圖庫不顯示大小及日期，圖磚另列大小與修改時間。工作 controller 及檔案開啟語意不變。

## 契約與 migration

版本升為 `0.40.0`／schema 13。`PreferencesSchema.defaultView` 新增 `mosaic`；舊 `list`、`thumbnails` 值及預設 list／50 保持，`thumbnails` 顯示名稱為「圖庫」。改變暫時檢視不自動保存，個人設定儲存後才成為下次載入的偏好；根 query 的 view 仍表示私有頁面。

Drizzle Kit 產生[新 migration](../../apps/server/drizzle/0012_parallel_jazinda.sql)及 metadata；SQLite 調整 CHECK 需建新 preferences 表，完整複製三欄，再 drop／rename，最後更新 revision。沒有其他表參考 preferences，因此保持外鍵 ON 即可；移除 Kit 在交易中無效的 foreign_keys OFF／ON，不修改已套用的前十二份 SQL／journal 前綴。合法值只有 list／mosaic／thumbnails，筆數仍 25／50／100；user 外鍵與 cascade 保留。

完整備份的私有 manifest／knownDatabase 明確接受 schema 13，仍只接受已知 migration 前綴與 integrity／外鍵檢查；不接受未知 14，不放寬直接降版。schema 10–12 快照仍可依既有 preserve-schema 規則還原到新目標，原 image 不讀新版 DB。

## 驗證界線

schema 12 fixture 由原前十二份 migration 建立，測 list／thumbnails、筆數與原快照 bytes；schema 13 的 DB 備份／還原使用正式 helper。原 schema 12 回復另以 SQLite backup API 與 knownDatabase 檢查，不冒稱已用舊正式 image 啟動。Debian 另驗目前 schema 13 的完整 FS／DB 快照及隔離還原。舊 image 12→13、原 image 回復與使用者 8088 交付仍留 P8.10。

實際測試、逐張畫面與環境依 P8.3 驗證（本機 `../validation/P8.3.md`）；完整 Windows／Debian Chromium 留 P8.9，正式 Compose／發行留 P8.10。
