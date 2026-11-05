# P8.8 右下浮動工作面板

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

日期：2026-10-30；版本 0.40.5／schema 13。構圖依固定 File Browser 833d9088 的 upload-files.css、UploadFiles.vue 及[來源原圖 47–49](../reviews/filebrowser-visual-reference.md)。取用與修改依[第三方聲明](../../THIRD_PARTY_NOTICES.md)。

工作改為右下 400px 可收合白卡，64px 摘要列、青色真實進度、展開後內部捲動；手機有工作或展開時全寬，沒有工作時保留小型歷史入口。高度受視窗與安全邊界限制，內容留足底部捲動空間，手機選取列與面板保留間隔。沒有遮罩，語意為 aria-modal=false 的非模態 dialog，Tab 可以離開；只在使用者明確開啟時聚焦面板，Escape 在面板內收合並返回觸發鈕。

上傳與背景工作仍由 Workspace controller 擁有；呈現的收合、頁面切換、搜尋與手機導覽不 dispose、不重送。新增或恢復的上傳項目可自動展開，進度及完成不重新打開，也不奪其他 Modal 的焦點。搜尋／手機導覽暫時隱藏浮卡，保留邏輯展開狀態及底部空間，返回不自動搶焦點。

摘要分進行中、待確認與已結束，上傳量只加總後端 committed offset／size。送出 bytes、驗證／發布、取消中、部分完成、未知結果、needs_review 與原錯誤照實呈現；尚未確認發布不顯示完成。不放假速度、ETA 或沒有契約的全部取消。工作 UUID、SHA 及限制說明按需展開；逐項取消、回查、重試、重新選檔與下載保留原能力。

「更新工作」移到共同摘要列，嵌入的 OperationPanel 不重複放更新鈕；獨立使用仍有原控制。收合按鈕只關閉呈現，不停止傳輸。兩個 controller、公開 API、session／CSRF、storage 與後端協調不變。型別名稱 TaskDrawer 暫時保留以降低無關變動，產品已使用浮動面板。

空白狀態、全頁視覺細節及兩平台完整 core 在 P8.9 再驗；正式 image、schema 12 升級回復與 8088 保留資料交付依 P8.10。驗證結果見 P8.8（本機 `../validation/P8.8.md`）。
