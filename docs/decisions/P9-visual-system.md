# P9 共用視覺系統

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

## 授權與範圍

使用者已核准 [P9 設計](../reviews/p9-design-review.md)及獨立預覽，授權依主計畫 P9.1–P9.9 逐份實作／驗證／本機 commit，不 push。此文件記錄正式 React／Ant Design 的共用決策；原型不是另一套正式元件。

P9.1 的產品版本為 `0.40.7`，schema 13 與所有公開契約不變。先落地共用 palette、文字層級、輸入邊界／圓角與焦點；殼層位置、三檢視密度、搜尋／浮層、管理／公開頁及工作呈現依後續切片處理。

## 單一來源

`apps/web/src/theme/index.ts` 仍是唯一 palette／字體／控制 token 來源，同時產生 ConfigProvider theme 與自有 CSS variables。Providers、Modal root 與既有 portal 沿用同一組變數，無新依賴、遠端字體或新圖示包。

| 用途 | 值／規則 |
| --- | --- |
| 主操作／hover | `#245ea8`／`#1c4b87` |
| 主字／次字 | `#202832`／`#596673` |
| 背景／表面／側欄 | `#f5f6f8`／白／`#f0f2f5`；側欄幾何與套用由 P9.2 處理 |
| 淡底／目前導覽 | `#eaf1fb`／`#e0e8f3`；P9.1 選取仍用原實色結構加較深藍，白字對比已改善，P9.3 才改淡底深字 |
| 邊界／分隔／輸入邊界 | `#dce1e7`／`#edf0f3`／`#8190a2`；AntD colorBorder 為輸入邊界，普通卡片用自有 border。原型的 `#8d99a8` 對白底只有 2.895:1，正式版微調為 3.259:1 |
| 工具／資料夾／進度 | `#596673`／`#527eb1`／主藍；圖示大小依後續 owning component |
| 錯誤／警告／成功 | `#b42318`／`#845300`／`#267044`，仍帶文字與圖示 |
| 共用字體／控制 | 原 Roboto 400／500／700 與中文 fallback；14px／1.5、40px、6px，浮層 8px；手機仍保持 16px input／44px 主要觸控範圍 |
| 基礎標題 | h1 22px／700、h2 18px／500、h3 15px／500；已有頁面特定樣式在其切片收斂，不假稱已全站替換 |

焦點由具產品／portal 範圍的 `:focus-visible` 共用規則負責，以一個 class owner 的 specificity 涵蓋 AntD input 的 `:focus`，不使用 `!important`；各浮層必要的 inset outline 仍由 owner 保留。原生 select 的顏色／高度／邊界／圓角合併至一處，移除設定的重複舊宣告。

## CSS 盤點與後續 ownership

| 區域 | 現況與負責切片 |
| --- | --- |
| 基礎與原生 select／焦點 | P9.1 收斂於既有基礎段；不追加全站 override |
| `.files-shell`／header／sidebar | 存在 P7 與 P8 宣告；P9.2 整理布局時移除確定失效的同 owner 規則 |
| listing／thumbnail／selected | 多次宣告列高、圖示與選取色；P9.3 將適用宣告整理成同一組，而非增加最後一段強制覆寫 |
| 短 Modal／search／preview | P9.4；保留安全 renderer、真實錯誤與 keyboard／focus |
| settings／management／public | P9.5／P9.6；不先移除原有功能或角色分類 |
| task／empty／disabled | P9.7；呈現不改 Workspace controller ownership |

不進行無關 CSS 重排、全站刪除或框架更換。ESLint 另排除使用者本機 `.agents/`／`.codex/` 設定，保持產品 lint 範圍；這兩個目錄的內容不提交、不修改。

## 驗證契約

`visual-system.spec.ts` 在隔離正式 SPA／真實 DB fixture 上保留四份本機字型 HTTP 200、各字重 loaded、同源／授權產物、偏好保存及 Modal theme 檢查；新增登入輸入焦點、文字 4.5:1 與輸入邊界 3:1 的實際 DOM 對比。量測先等待元素及祖先的真實 Animation.finished，避免拿表格背景過場中途當最終色；沒有固定 sleep 或降低門檻。計算合成祖先純色背景及 RGBA，只適用該案非漸層／opacity=1 的正常控制，明確拒絕其他情況，不宣稱完整 WCAG 通過。

基線使用 0.40.6 的 P8.9 合成原圖與目前 66 項 fixture；各份保存改後原圖、命令與證據界線。實際結果依 P9.1 驗證（本機 `../validation/P9.1.md`），完整兩平台與正式交付仍由 P9.8／P9.9 負責。
