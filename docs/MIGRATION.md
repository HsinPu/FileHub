# React / FastAPI 改版進度

## 範圍
React + TypeScript + Vite + Ant Design；FastAPI 提供同源 JSON API。
保留登入、登出、修改密碼、共用檔案根目錄、目錄樹、目前目錄搜尋、文字/圖片預覽與建立資料夾。
公開註冊關閉；上傳、下載、刪除、重新命名與個人空間不在本版範圍。

## 階段
- [x] 確認功能與既有資料：原 Git HEAD `6b2dcdf`；database 目前只有 .gitkeep。
- [x] FastAPI 分層、相對路徑 API、登入安全與測試。
- [x] React 介面與前後端整合。
- [x] 瀏覽器驗證、Windows 啟動與文件。
- [x] 驗收完成後移除舊版 app 模板與程式。

## 契約決策
- `/api/v1/auth/login` 使用 JSON；JWT 放 HttpOnly、SameSite=Strict cookie，不交給 JS 儲存。
- 所有 POST/PUT/DELETE 要求 `X-Requested-With: Files-App`，並驗證 Origin（有提供時）；不開 CORS。
- 登出撤銷目前 session；修改密碼驗證舊密碼並撤銷所有 session。
- `/api/v1/files?path=` 回傳一層子項；`/tree?path=` 僅回傳一層子目錄，前端展開時載入。
- API 路徑只能相對根目錄、以 `/` 分隔；不揭露實體路徑。
- API 錯誤統一為 `{error: {code, message}}`。
- SQLite 既有 users 表保持相容；新增 sessions 表，不重建帳號。
- 本機預設只監聽 127.0.0.1，管理根目錄為專案 srv；禁止暴露應用程式及資料庫目錄。

## 檢查點
各階段以文件及測試結果記錄，不自動 commit/push。舊版保留到新版驗收完成。

## 驗收紀錄（2026-09-09）

- 後端 API／安全／資料相容測試 28 項通過，包括原 users 表與 bcrypt hash 保留、JWT 撤銷、同源寫入、路徑越界、Windows junction、檔名規則及 10 MB 預覽限制。
- 啟動測試 3 項通過：CLI 重複執行不覆寫帳號、不輸出密碼；連接埠占用明確失敗；真實 BAT 啟動新版 HTML/API。
- Playwright 4 條流程通過：桌面完整操作、390px 手機空目錄、密碼修改、延遲目錄請求不能覆蓋新畫面。
- TypeScript／Vite 建置及 Ruff 檢查通過。
- 實際檢視桌面與手機截圖，手機無水平溢出；瀏覽器測試無未捕捉例外。
- 所有測試使用暫存資料庫與檔案；專案 database 仍只有 .gitkeep，尚未替使用者建立真實帳號。

## 已知限制

- Vite 仍提示主共用 bundle 大於 500 kB；檔案工作區已延遲載入，可於後續依實際效能需求再拆分。
- 測試依賴 Starlette/httpx 與 anyio 出現棄用提示，目前不影響測試結果。
- 手機驗證為 Chromium 390px viewport，未宣稱已測 iOS Safari 或 Android 實機。
- 超大型單層目錄仍一次列出；不含上傳、下載、刪除、重新命名、個人空間及帳號管理介面。
- 新架構未經正式環境部署；正式網路部署需設定 HTTPS 與 Secure Cookie。
