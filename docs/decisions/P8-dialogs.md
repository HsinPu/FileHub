# P8.5 短對話框與安全全畫面預覽

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

日期：2026-10-30；版本 0.40.2／schema 13。[主計畫](../../IMPLEMENTATION_PLAN.md)與[全畫面參考](../reviews/filebrowser-visual-reference.md)為依據。

## 短表單與目的地

新建、重新命名、回收／還原、分享及 copy／move 目的地使用 400px 置中 Modal、16px padding、24px 標題與平面 footer；長內容只捲動 body，footer／關閉可達，手機主要控制至少 44px。保留 pending 關閉限制、原 UUID、不覆寫、草稿與 afterClose 返回焦點。

目的地的 `DestinationBrowser` 只使用既有公開 listing，依目前可寫入 scope 導覽根與子目錄；不使用主機路徑。50 項 snapshot／版本分頁與檔案列表契約相同，只呈現可瀏覽的資料夾；該頁無子目錄時明示。來源明細與手輸路徑／衝突政策放 disclosure；手輸路徑不自動引發每鍵查詢，可明確顯示該路徑。真正提交仍由原 metadata／OperationController／後端重新驗版本與授權，畫面選擇不提供寫入權。

分享建立／同 ID 查詢移至 footer，固定 aria-label／aria-busy，pending 時停用；secret／密碼、一次建立與回應遺失只查同 ID 的協定未改。分享連結的截圖在擷取時遮蔽，沒有保存其 fragment。

## 預覽

安全 binary／純文字／PDF.js 仍由原模組取得及取消。全畫面為 64px 黑色頂列、左關閉、重試／原檔下載／資訊；圖片黑底等比、文字白底唯讀 pre、PDF 深灰底且只顯示第一頁 canvas。沒有移植上游 HTML／SVG DOM、內容 editor、影音、EPUB 或 native PDF 工具列。

相對路徑與完整限制放「預覽資訊」，長路徑可鍵盤聚焦／捲動。Escape／關閉返回原觸發元素；載入、重試、格式／大小限制、損壞、browse-only 與下載原檔政策保留。進場動畫完成後才量 Modal 幾何，不能把縮放中的框當完成位置。

來源為固定 File Browser 833d9088 的 prompts／Preview／editor 相關畫面與 25–29／50／56–61；取用／改寫聲明依[第三方紀錄](../../THIRD_PARTY_NOTICES.md)。FileHub 的 scope、多入口、衝突政策、無覆寫、安全 renderer 與第一頁限制是必要差異。結果見 P8.5 驗證（本機 `../validation/P8.5.md`）。
