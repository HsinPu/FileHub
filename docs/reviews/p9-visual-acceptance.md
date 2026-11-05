# P9 視覺驗收與必要差異

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

P9.8 已完成；134 張合成原圖、兩平台完整紀錄與最後補驗見 P9.8（本機 `../validation/P9.8.md`）。主依據為使用者核准的[設計 N](p9-design-review.md)、[獨立預覽](../design/P9/README.md)及[主計畫](../../IMPLEMENTATION_PLAN.md#p9-視覺層級與一致性)。正式 image 與 8088 交付見 P9.9（本機 `../validation/P9.9.md`）。

本表採 **reference fidelity**：核對核准的層級、比例、色彩與保存契約。P8 原圖保留作改前比較，不以像素相似率否定已核准改版，也不覆寫歷史 baseline。圖片、DOM 尺寸、computed color、鍵盤、console／network、真實 API 測試各自提供有限證據；功能通過不代替人工逐張檢視。

## 畫面與保存契約

| 家族 | 核對內容 | 證據位置 |
| --- | --- | --- |
| 共用主題 | 沉靜藍、深色名稱、次要資訊、細邊界、本機 Roboto／中文、2px 清楚焦點；AntD portal 一致 | P9.1 及本份最後焦點補驗 |
| 私有殼層 | 64px 頂列、224／192px 側欄；手機檔案頂列 112px、主操作與一般工具層級；1920px、320px／短手機 | P9.2 與最終 list／wide／narrow 原圖 |
| 三檢視 | 列表 52／64px；36px 圖磚圖示、144／112px 圖庫區域；淡藍選取、深字、長名摘要 | P9.3 與 list／mosaic／gallery／selected 原圖 |
| 情境／搜尋 | 右鍵與鍵盤同一 actionsFor；選取後排序／刷新可達；範圍／partial、背景 inert、Escape 返回 | P9.4／P9.6 與 context／search 原圖 |
| 短表單／預覽 | 400px 表單、主要 footer、長 body 捲動；目的地真實 listing；純文字／JPEG／PDF 第一頁安全 renderer | P9.4 與 mkdir／destination／share／preview 原圖 |
| 管理頁 | 1040px 閱讀寬度；個人雙欄、管理 360px 表單＋較寬資料表、窄版單欄；僅分類／表格容器橫捲 | P9.5 與 personal／accounts／storage／trash 原圖 |
| 登入／公開頁 | 380px 明確 label；公開無空側欄、48px 單檔圖示、單一頁尾；密碼前不漏名稱、fragment／獨立身份不變 | P9.6 與 login／public／status 原圖 |
| 工作／空／錯誤 | 文字摘要、380px 非模態浮卡、實測高度留白；小型中性空狀態、淺色語意提示；真實 committed／partial 與逐項動作 | P9.7 與 running／details／partial／unknown／needs_review 原圖 |
| 縮放與輸入 | chrome.tabs 的真實 200%、DPR 1→2／CSS 寬度減半；320px 鍵盤、Tab／Escape、reduced-motion | visual-accessibility 與最後焦點補驗 |

## 已修正的審查發現

1. **焦點權重與複合欄位。** AntD 按鈕原先仍使用淡色 3px 外框，已由 owning selector 改為實測深藍 2px。密碼欄由 wrapper 畫內縮 2px，內層 input 的 outline-style 為 none，手機對話框不再裁切左右焦點線。最初以滑鼠模式程式聚焦的診斷不屬有效 focus-visible 證據，已改以鍵盤重現。
2. **背景更新的焦點。** 工作更新原 native disabled 會失焦；已改 aria-disabled／loading 與 handler admission。真實延遲 GET 期間焦點保留，Enter 不重送、讀取次數為一，完成後仍可 Escape 返回入口。
3. **內嵌空狀態重複邊界。** 搜尋結果與管理卡內的 EmptyState 已移除內層細邊，保留 partial／限制與錯誤說明。
4. **原生縮放擷取。** 修正 CSS clip 導致的捲動偏移；另等帳號選單關閉、有限動畫 finished 與 compositor frames，避免把退場中的選單當作設定頁構圖。這是測試擷取修正。

以上均以實際 computed style、鍵盤、相關補驗及原圖核對關閉；來源及原失敗紀錄保留於 P9.8，未回寫成同一份完整測試。

## 必要差異與驗證界線

- 原型只涵蓋代表場景；正式產品保留完整帳號、candidate／grant、垃圾桶、分享期限與恢復流程。原型合成資料或假控制不搬入正式元件。
- 原型的三段檢視控制在正式版保留既有單一循環鈕，顯示目前模式、提示下一模式，選取後也可切換。三種檢視與偏好 wire value 均保留；局部工具密度與手機觸控尺度以正式版驗收。
- 控制邊界使用實測可達 3:1 的 `#8190a2`，取代原型較淡的值；焦點以深藍 2px 驗收。停用按鈕仍明示停用，不能為圖面整齊刪除能力限制。
- 窄版管理表格保留容器內橫捲。部分操作後原圖停在右側操作欄，檔名可往左捲回；這些圖不能當作全部欄位同時可見的證據，整頁無橫向溢位另以 DOM 量測。
- Windows 為檔案唯讀開發平台，原檔寫入／上傳／ZIP 由隔離 Debian 真實 API／worker 驗證。少見 needs_review 另用受控公開 DTO 回應驗呈現，不能當作新一輪 kernel I/O 故障實測。
- 真正 zoom 擷取使用 viewport 原圖並另捲至表單控制；Playwright 的 fullPage clip 在 native zoom 下曾裁切，該候選保留於忽略工具目錄，不作最終畫面。
- 鍵盤與語意／computed color 檢查不能代替 NVDA、JAWS、VoiceOver 或實體觸控測試；其他瀏覽器、hosted CI、裸機與未配置 NAS 均不在本次新增驗證內。使用者 8088 分頁由 P9.9 保留資料交付。
