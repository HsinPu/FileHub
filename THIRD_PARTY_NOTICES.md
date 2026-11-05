# 第三方資產與聲明

本文件列出 FileHub 實際取用的介面資產與樣式來源，不變更 FileHub 其他程式或文件的授權。產品使用 FileHub 品牌。

## File Browser 樣式參考

- 專案：File Browser contributors，固定 commit `833d908884d5c801f30f5c098d7977177eb3a36b`。
- 來源：[fonts.css](https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/css/fonts.css)、[_variables.css](https://github.com/filebrowser/filebrowser/blob/833d908884d5c801f30f5c098d7977177eb3a36b/frontend/src/css/_variables.css)、`frontend/src/assets/fonts/roboto/`。
- 授權：[Apache License 2.0](apps/web/public/assets/licenses/filebrowser-Apache-2.0.txt)。
- FileHub 修改：取用 Latin 400／500／700 font-face 的字型與 unicode range；改為本機 Vite 資產路徑、加入 font-display: swap、移除 local() 避免不同主機字型版本，並設定中文 fallback。色票改寫為集中 token，未搬入 Vue、上游後端或全域 outline 規則。
- P8.2 另依同 commit 的 `frontend/src/css/header.css`／`mobile.css` 及 `components/Sidebar.vue`，改寫 64px 頂列、256／160px 側欄、736px 斷點、400px 搜尋與 Material 導覽圖示配置。呈現實作為 React portal／Ant Design Drawer／自有 scoped CSS，保留 FileHub 品牌、授權入口與焦點／垂直捲動修正，不複製上游狀態或安全行為。
- P8.3 依同 commit 的 `frontend/src/css/listing.css`／`listing-icons.css` 與 `views/files/FileListing.vue` 改寫列表、橫向圖磚、圖庫及檔案類型 glyph 配置；保留安全縮圖、單擊資料夾開啟、長名稱斷行與 FileHub 偏好契約，沒有移植上游 Vue 或影音／內容 renderer。
- P8.4 依同 commit 的 `frontend/src/css/header.css`／`mobile.css`／`listing.css`、`Search.vue` 與 `ContextMenu.vue` 改寫搜尋展開、頂列圖示動作、藍白選取及情境選單。使用 React／Ant Design 與原 FileHub 能力／版本檢查，不移植上游操作實作或格式捷徑。
- P8.5 依同 commit 的 prompts/BaseModal、Copy／Move／Share、Preview 與 editor 相關畫面改寫 400px 置中短表單、實際目的地瀏覽與 64px 頂列的全畫面預覽；不移植上游 renderer／編輯器，僅使用 FileHub 既有安全 binary／PDF 第一頁內容。

- P8.6 依同 commit 的 `frontend/src/css/login.css`／`_share.css` 與公開密碼／下載／錯誤畫面改寫 256px 登入、共用公開殼層、metadata 卡及 160px 分享圖示；保留 FileHub 名稱、獨立分享身份與原有健康狀態，不加入來源的 QR／編輯／資料夾打包功能。

- P8.7 依同 commit 的 `frontend/src/css/dashboard.css`、`views/Settings.vue` 與 `views/settings/Profile.vue`／`Shares.vue`／`User.vue` 改寫管理橫向分類、雙欄白卡、平面動作及表格；保留 FileHub query 導覽、既有 dirty／busy／權限驗證與垃圾桶延伸，沒有移植上游全域設定／註冊／shell 或分享秘密顯示。

- P8.8 依同 commit 的 `frontend/src/css/upload-files.css` 與 `components/prompts/UploadFiles.vue` 改寫右下 400px／手機全寬工作面板、64px 摘要與青色一般進度。以 React 非模態 portal 呈現，保留 FileHub 的已確認 bytes、持久工作／取消／未知／重試與 owner 生命週期，不加入推測的速度／ETA 或未接 API 的全部中止控制。
- P8.9 依同 commit 的 `frontend/src/css/listing.css`、`_buttons.css` 與 `views/files/FileListing.vue`／`views/settings/Shares.vue`，以共用 React `EmptyState` 呈現 Material 空狀態及置中訊息；保留原功能文案與錯誤。窄視窗文字與工作卡圖示依可用空間調整，並收斂 placeholder、平面停用／確認按鈕與操作色彩。

## Roboto

- 字型：Roboto Regular／Medium／Bold Latin，直接來自上述 File Browser 固定 commit，字型 bytes 未修改。
- 官方專案：[googlefonts/roboto-2](https://github.com/googlefonts/roboto-2/tree/38062f4b4a0be4346d07a928408da21602545e9e)，授權原文固定於同 commit 的 [LICENSE](https://github.com/googlefonts/roboto-2/blob/38062f4b4a0be4346d07a928408da21602545e9e/LICENSE)。
- 授權：[Apache License 2.0 原文副本](apps/web/public/assets/licenses/roboto-Apache-2.0.txt)。Regular／Medium 內嵌 license URL 亦指向 Apache-2.0；Bold 子集未保留該 metadata，不冒稱三檔都有完整內嵌聲明。
- FileHub 檔案：`apps/web/src/assets/fonts/roboto-normal-latin.woff2`、`roboto-medium-latin.woff2`、`roboto-bold-latin.woff2`。只改檔名及載入 CSS，不修改字形或內部字型名稱。中文不由這些 Latin 子集提供，使用明確的本機 fallback。

## Material Icons filled

- 套件：[material-icons@1.13.14](https://www.npmjs.com/package/material-icons/v/1.13.14)，來源 commit `edd1aa41c0c645a9bd4c6ab1470500225e8d23ec`：[marella/material-icons](https://github.com/marella/material-icons/tree/edd1aa41c0c645a9bd4c6ab1470500225e8d23ec)。
- 原路徑：`package/iconfont/material-icons.woff2`、`package/iconfont/filled.css`、`package/LICENSE`。
- 字型內嵌聲明：Copyright 2018 Google, Inc. All Rights Reserved.
- 授權：[套件附帶的 Apache License 2.0](apps/web/public/assets/licenses/material-icons-Apache-2.0.txt)。
- FileHub 檔案：`apps/web/src/assets/fonts/material-icons-filled.woff2`，bytes 未修改。font-face 僅保留 WOFF2；原 `.material-icons` 的呈現規則改寫為自有 `.tool-icon`，圖示為輔助、`aria-hidden`，語意仍由控制項的完整名稱提供。
- npm tarball 的官方 SHA-512 integrity 已核對：`sha512-kZOfc7xCC0rAT8Q3DQixYAeT+tBqZnxkseQtp2bxBxz7q5pMAC+wmit7vJn1g/l7wRU+HEPq23gER4iPjGs5Cg==`。

## 發行方式

三份授權原文隨 `apps/web/public/assets/licenses/` 原樣複製到正式 `build/assets/licenses/`，本文件亦輸出為該版的 `NOTICE-<版本>.txt`。API 以同源靜態資產提供，不依賴外部 CDN。實際檔案的 SHA-256、來源與本次修改依 [P8.1 決策](docs/decisions/P8-visual-system.md)及驗證證據；後續新增資產時同步更新本文件與對應聲明。
