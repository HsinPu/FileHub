# P8 視覺系統

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

## P8.1 決策與已實作範圍

P8.1 將共用色票、字體與工具圖示改為固定版本 File Browser 的視覺基礎，版本 `0.39.2`；schema 仍為 12。參考[全畫面審查](../reviews/filebrowser-visual-reference.md)與 [DESIGN](../../DESIGN.md)，不在本份提前改動殼層、三種檢視、選取、預覽或工作控制器。

`apps/web/src/theme/index.ts` 是 palette／字體／控制項 token 的來源；ConfigProvider 與自有 CSS 變數使用相同值，既有 Modal 的 root style 也沿用它們。主色 `#2196f3`、hover `#1e88e5`、背景 `#fafafa`、白表面、內文 `#333`／次要 `#6f6f6f`、邊框 `rgba(0,0,0,.1)`、divider `rgba(0,0,0,.05)`，圖示角色另外有 action `#546e7a`、folder `#1d99f3`、search surface `#e6e6e6`。

16px 基準字、36px 常用 AntD 控制項、2px 元件圓角；手機既有至少 44px 規則保留。舊 CSS 的特定標籤／輔助字級與頁面圓角按後續切片更新，不假稱本份已還原所有頁面。`--fh-selected` 暫用淺色 accent surface，避免將既有藍字導覽變成藍底藍字；實色選取的 `--fh-selection`／`--fh-inverse` 已備妥，P8.4 才套用選取呈現。

## 字體與圖示

- 使用上游固定 commit 的 Roboto Latin 400／500／700 WOFF2，bytes 不修改。移除 `local()`，避免用到使用者主機另一版本；`font-display:swap`，中文字有 Noto Sans TC／Microsoft JhengHei／PingFang TC／system fallback，沒有遠端字型請求。
- 工具圖示使用固定 `material-icons@1.13.14` 的 filled WOFF2，延續同一 Material glyph。`.tool-icon` 是 24px 的自有 class，圖示 `aria-hidden`；按鈕原有可存取名稱保持。檔案類型圖示與更完整動作配置由 P8.2／P8.3／P8.4 依範圍接續。
- 沒有增加產品套件依賴。npm tarball 由官方 registry 的 SHA-512 integrity 核對；字型原檔、來源 metadata 與授權的 SHA-256 保存於 P8.1 assets（本機 `../validation/P8.1/assets.json`）。
- 用隔離 fontTools 讀實際 name table：Regular／Medium 有 Apache-2.0 license URL，Bold 子集未保留；Material Icons 有 Copyright 2018 Google, Inc. 與版本 1.017。這些是檔案 metadata 觀察，完整授權依實際來源與隨附原文。

## 來源與發行歸屬

| 資產 | 固定來源與修改 |
| --- | --- |
| Roboto 三份 Latin 子集 | File Browser `833d908884d5c801f30f5c098d7977177eb3a36b` 的 `frontend/src/assets/fonts/roboto/`；字型不改，僅檔名與 CSS 載入方式調整 |
| Roboto 授權副本 | 官方 `googlefonts/roboto-2` commit `38062f4b4a0be4346d07a928408da21602545e9e` 的 LICENSE；原文 bytes 保留 |
| Material Icons | `material-icons@1.13.14`／`edd1aa41c0c645a9bd4c6ab1470500225e8d23ec`，`iconfont/material-icons.woff2` 與 `filled.css`；字型不改，CSS 改成本機 WOFF2／scoped class |
| File Browser CSS 參考 | 固定 commit 的 fonts.css／_variables.css；轉為 React 主題與自有 CSS，不複製全域 outline 移除或其他產品流程 |

詳細聲明在[根 THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md)。三份授權原文置於 `apps/web/public/assets/licenses/`，由 Vite 原樣複製；本文件的根聲明在 build 時輸出為 `assets/licenses/NOTICE-<版本>.txt`，版本化路徑與靜態 cache 契約相容。正式 Dockerfile 與 CI context 都須包含 public 及根聲明；已實際建置正式 image 並核對其八份資產 hash。API 的 assets allowlist 仍只提供真實建置產物，不增加 SPA fallback。

## 驗證方式與後續

`visual-system.spec.ts` 在正式 SPA／隔離 DB 上驗四份字型實際 200 載入、所有 FontFace loaded、無外站請求、Modal 及頁面字體／palette 一致，並實際 GET 正式產物的聲明與三份授權；不是只驗 CSS 宣告存在。登入、66 項工作區、個人設定與 Modal 保存三視窗合成圖，與同版 P7.9 基線原圖對照。功能與版面回歸結果見 P8.1（本機 `../validation/P8.1.md`）。

P8.2 接續全寬頂列／側欄與導覽；三模式與偏好 migration 仍留 P8.3，實色選取留 P8.4。本份不更新使用者 8088、帳號或持久 volumes。
