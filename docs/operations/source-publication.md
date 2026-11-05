# 原始碼發佈規則

原始碼發佈保留產品程式、測試程式與必要 fixture、lockfile、migration、CI／Docker 設定、設計原稿、研究／決策／操作文件及適用授權。`tests/`、`apps/server/tests/`、`apps/web/tests/` 不是應刪除的測試產物。

## 留在本機的資料

- `.tools/`、`.agents/`、`.codex/` 等本機工具與私人設定。
- `.env`、資料庫及其 WAL／SHM、備份、私鑰與實際使用者檔案；僅提交無秘密的 `.env.example`。
- `node_modules/`、`dist/`、`apps/web/build/`、原生編譯產物及 coverage。
- `test-results/`、`playwright-report/`、log、`docs/validation/` 的階段驗證報告及執行證據。
- `docs/design/*/evidence/`、`docs/reviews/filebrowser-visual-reference/` 與研究目錄的原始擷取包。`docs/filebrowser-study/evidence/filebrowser-LICENSE.txt` 是保留的授權例外。

排除是停止版本追蹤，**不刪除本機檔案**。設計用的原始 Logo、字型、產品所需靜態資產、授權文字與 migration 不使用副檔名一律排除。必要 fixture 可使用圖片或文件格式；不要把它們誤認為測試輸出。

舊文件以「本機」標示的路徑是私人驗證紀錄的定位，沒有附帶到原始碼發佈。歷史執行結果不能代替新 checkout 的測試；研究及設計文件仍保留來源 commit、方法與限制。CI 會執行測試並產生工作日誌，不另外上傳測試附件。

## 發佈分支與歷史

`.gitignore` 不會移除舊 commit 中的檔案。2026-11-05 整理前，本機 `main` 比 `origin/main` 多 91 個 commit，內含驗證產物；該遠端追蹤點為 `26d4bd6` 的空目錄版本。

先以當時的 `origin/main` 為父節點建立 `codex/publish-clean`，只包含整理後的原始碼快照，避免把舊驗證產物帶進新的可達歷史。使用者隨後明確授權最後修正與乾淨內容一併上 `main`；後續開發及發佈以乾淨的 `main` 為主線。

原完整開發歷史及整理提交 `2777ef5` 保留於本機 `codex/development-history-2026-11-05`；不推送此備份分支，也不將它 merge 回 `main`。`codex/publish-clean` 保留乾淨快照的本機分支定位。

2026-11-05 本次發佈前已透過 GitHub 連線及成功的 Git fetch，核對遠端 `main` 為 `26d4bd6`，可正常 fast-forward 推送。只推送使用者核准的 `main`，不推送所有 refs 或 tags，不使用 force push。後續每次推送仍須先刷新遠端與檢查新增可達歷史；未明確授權時只做本機 commit。

## 提交前檢查

檢查 `git status`、本次 diff 與索引；確認沒有 `.env`、使用者資料或新產物。先前已追蹤的產物須從索引移除，不能只新增 ignore 規則。涉及清理時記錄確切路徑與雜湊，確認檔案仍留在本機。

核對公開 Markdown 連結指向發佈中的檔案，驗證必要測試及資產仍在。發佈審查同時檢查待推送 commit 的 tree 與新增可達歷史，不能只看最新檔案列表。README 的安裝命令以實際 scripts／Compose 為準；不把文件檢查當作產品全套測試。
