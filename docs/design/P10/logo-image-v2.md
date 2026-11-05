# FileHub 圖像 Logo 第二稿

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

2026-10-31，依使用者「換一個 logo，用 img 設計」的要求，使用內建 Image Gen 產生新圖案，並進行一次邊緣與色面修整。這是 P10 的另一份品牌候選；正式產品與原 SVG 比較預覽尚未套用此稿。

2026-11-01 使用者已核准此稿，P10.1 完成正式 React 的三個品牌 host 與 favicon，實作及新證據見 P10.1（本機 `../../validation/P10.1.md`）。以下保留原圖生成當時的紀錄；8088 正式 image 仍為 0.40.14。

## 圖案與資產

以兩張交疊文件組成 H，墨藍作主體、暖金作連接與折角。保留中央留白，FileHub 字標仍可在實作時用 HTML 文字搭配。

<img src="assets/filehub-logo-image-v2.png" width="320" height="320" alt="墨藍文件與暖金折角組成的 FileHub H 圖像標誌">

[下載透明 PNG](assets/filehub-logo-image-v2.png)；[上一稿 SVG 與配色比較](README.md)。

| 檢查 | 結果 |
| --- | --- |
| 原始格式／尺寸 | PNG，1254 × 1254 px，32-bit ARGB |
| 檔案大小 | 537,257 bytes |
| 透明抽樣 | 四角與中央開口 alpha 0；藍色主體、金色橫帶抽樣 alpha 254 |
| 來源保存 | 從 Image Gen 輸出直接複製，未裁切、縮放或轉碼 |
| SHA-256 | `7b001872e0eff2d781233739f354c9d47b26baace7d55288eec7190565189f65`；原始輸出與專案檔一致 |
| 人工檢視 | 已開啟專案內原圖，核對 H、文件折角、配色與透明留白 |

此稿是點陣設計，不是可編輯 SVG；提示詞的色碼是生成方向，不能視為每個像素的精確色票。原尺寸仍可見細微色面與邊緣差異，若選用於產品，需在 P10.1 驗證實際小尺寸與背景，必要時再整理成向量。不沿用前一份 SVG 的 16–128px 或 30 張原型驗收結果。

本次僅新增設計資產及文件，產品版本維持 0.40.14。未變更 React、API、資料庫、Docker 或 8088 的品牌。檔案解碼、尺寸與透明抽樣使用 Windows System.Drawing；未執行產品功能回歸。

## 生成方式與提示詞

使用內建 `image_gen`，兩次均要求 `transparent_background: true`；沒有使用 CLI／外部 API runner。第一輪為新圖生成，第二輪以第一張輸出作編輯目標，專案保存第二輪原始 PNG。

### 初次生成

```text
Use case: logo-brand.
Asset type: a fresh FileHub application logo symbol, supplied as a transparent PNG concept.
Primary request: Design a distinctly new professional logo for FileHub, a calm, practical self-hosted file manager. The concept is organized documents coming together into a hub. Use two interlocking folded-page forms to create a subtle, easily legible H silhouette and clever open negative space. It must feel designed as a coherent symbol, with a strong compact silhouette, generous internal gaps, balanced mass, and consistent gently rounded corners.
Style: refined flat geometric identity design, bold simple shapes, front-facing 2D, clean edges, understated and memorable. Suitable for a 32px app header and a larger login mark.
Color palette: predominantly muted ink blue near #315f98 with one restrained warm gold accent near #9c7738 on a folded corner or connecting element. Two flat colors only.
Composition: exactly one centered logo symbol on a square transparent canvas; the mark fills about 75 percent of the canvas with comfortable even clear space. The transparent negative spaces inside the symbol must stay transparent.
Text: no words, no letters printed as text, no tagline; the H is implied by the geometry itself. The FileHub wordmark will be added as HTML in the application.
Avoid: the previous folder outline containing a cutout F, circular badges, enclosing app tiles, cloud icons, network-node dots, gradients, 3D extrusion, bevels, shadows, textures, tiny details, extra variants, presentation sheets, watermarks.
Background: genuine alpha transparency, no white rectangle and no painted checkerboard.
```

### 一次修整

```text
Use case: precise-object-edit, logo-brand cleanup.
Edit this FileHub logo only to refine its finish. Preserve the existing recognizable H silhouette, folded document concept, proportions, positioning, open center, and ink-blue / muted warm-gold color relationship.
Remove all tiny stray red/blue pixels, edge debris, halos, surface texture, and shading. Make the blue and gold areas clean uniform flat fills, near #315f98 and #9c7738, with smooth precise antialiased contours. Reduce the gold to a clear simple connecting band and the two already present page folds; do not add shapes.
Keep it a single centered compact logo on genuine alpha transparency, with transparent open areas. No text, no board, no background rectangle, no checkerboard, no shadows, no gradients, no 3D effects. This is a crisp minimal software identity mark.
```
