# P4.2 預覽內容與資源政策

`GET /api/entries/:entryId/preview` 回傳公開 resource 與 kind／reason，`/preview/content` 提供內容；兩者均透過 FileService.openDownload，要求目前下載權限，不接受只可 browse 的帳號。原檔下載仍為既有 attachment endpoint。所有回應 no-store、nosniff，內容端點另有 `default-src 'none'; sandbox`、frame DENY／同源資源及 no-referrer。Range／HEAD／If-Range 沿用既有單範圍語意。

| 格式 | 上限與呈現 |
| --- | --- |
| PNG／JPEG／WebP | 16 MiB、16,000,000 pixels、4 channels、單頁／非動畫；驗 magic 及 decoder 格式，轉成最多 1600×1600 JPEG、輸出 4 MiB |
| UTF-8 文字 | 256 KiB；固定 extension allowlist、fatal UTF-8 與控制字元驗證；React pre 純文字呈現 HTML／SVG／Markdown／程式碼，不建立內容 DOM 或連結 |
| PDF | 16 MiB、header `%PDF-`；本機 PDF.js worker 解析，只畫第一頁 canvas，最多 4,000,000 pixels／長邊 1600，5 秒取消；不建立 annotation、表單、連結、XFA 或 JavaScript viewer |
| 其他／超限／損壞 | 固定訊息、重試及下載原檔；不將未知內容 inline HTML |

PDF 使用整份有界 bytes，不讓文件決定網路 URL。關閉會 abort fetch、取消 render、銷毀 worker 與 blob URL。停用 worker 外部資源 fetch、Wasm、動態 font face 及系統 fallback 字體；需要未打包字體／CMap 的檔案可能降級，這不是完整 PDF viewer。瀏覽器 canvas／JS 限制不是 OS 記憶體沙箱。

圖片採獨立 Node 子程序，stdin 只接 pinned handle 的有界 bytes，沒有使用者 host path／URL／shell；並行最多 2，sharp concurrency=1、cache=false，V8 heap 64 MiB、decoder timeout 2 秒、父程序 3 秒 kill，stdout 最多 4 MiB。子程序關閉及輸入 reader 完成後才歸還原檔 handle；解碼後再驗 stat fingerprint、目前路徑 identity／權限。這不是對 native decoder 的完整 OS sandbox；正式 Compose 另有既有 512 MiB／1 CPU 程序群限制。中斷不影響原檔，沒有持久轉檔佇列。

實測修正 FileHandle.createReadStream().destroy() 提前關閉借用 handle：改為有界 read 的 Readable，等待結束再由原建立者關閉。圖片不是原 bytes pass-through，移除 metadata 並固定 JPEG MIME。

新增精確依賴 sharp `0.35.5`、pdfjs-dist `6.4.299`，Windows 與 Linux prebuilt optional dependencies 保留於單一 lockfile；既有定案依賴不變。選型依據：[sharp constructor](https://sharp.pixelplumbing.com/api-constructor/)、[sharp install](https://sharp.pixelplumbing.com/install/)、[PDF.js API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html)、[PDF.js 6.4.299](https://github.com/mozilla/pdf.js/releases/tag/v6.4.299)。renderer 與容量／快取持續於 P4.3 驗收。

來源行為參考固定 commit `833d908884d5c801f30f5c098d7977177eb3a36b` 的 `http/preview.go:37–158`、[研究安全 §7](../filebrowser-study/05-security-and-rewrite-boundaries.md#7-預覽html-與內容回應)及[流程 §11](../filebrowser-study/04-user-flows-and-state.md#11-預覽編輯與離開保護)。本實作沒有複製其 viewer 或無界原檔 fallback。
