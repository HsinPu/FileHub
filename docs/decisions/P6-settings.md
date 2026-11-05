# P6.2 管理與個人設定

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

版本 0.31.0，schema 12。需求依 [B §1–2](../filebrowser-study/07-filehub-rewrite-blueprint.md)、[R4 §12](../filebrowser-study/04-user-flows-and-state.md) 及 [DESIGN](../../DESIGN.md)；不移植 File Browser 的 Vue 或主機路徑公開模型。

## 管理權限

- `/api/admin` 回有界 users／entries／grants／candidates snapshot。每次請求由 session 查目前角色；member 的管理請求回 403。修改要求同源及 CSRF，KDF／FS await 後、提交前再次驗 session 與 admin。
- 帳號建立、重設密碼沿用 IdentityService；可建立 admin／member、停用／恢復及變更角色。至少保留一位啟用管理員。停用、角色變更、改密碼均刪除身份 session，恢復帳號不復活舊 Cookie。沒有刪除帳號或更改 immutable username 的端點，以保留既有操作／分享 ownership。
- 每份已存在的 shares／jobs 依目前啟用狀態、角色及正向聯集 grant 判斷；停用、降權或撤 grant 在下個檢查點生效。密碼更新結束身份登入，既有 jobs／shares 仍按 owner 的目前檔案授權運作。恢復帳號／入口後，未撤銷且未到期的既有 share 可再次通過授權；要永久停止分享應撤銷 share。
- 公開 TypeBox object 契約設定 additionalProperties=false；Fastify 明確關閉 removeAdditional，額外欄位回 400，不默默丟掉。錯誤仍不含原始輸入或 exception。

管理按鈕只送出明確修改的欄位；後端在短交易中保留目前其他欄位，避免舊 snapshot 的 role／enabled／label 覆蓋另一個變更。空更新回 400。

## 儲存入口與 grant

管理員先在主機 CLI 使用 `entry-offer <managed|external> <label> <absolute-root>` 登記已存在目錄，再於 UI 以候選 ID 建立入口。`entry_candidates` 保存私有 root／identity，HTTP 只回 opaque ID、名稱、種類與可用狀態。候選不是 mount；不自動 mkdir／mount／chown。建立仍經 EntryService 的 state 重疊、root identity、已註冊入口重疊與數量檢查；來源替換拒絕。

入口可改顯示名稱、停用／恢復與開關寫入；重新啟用前以既存 identity 開 root。Linux 才能 opt-in 寫入，仍拒絕接管外來 `.filehub`。已建立且完成 sync 的 private owner 證據先保存，再做最終管理授權／啟用；若管理者在 FS await 間失效，不啟用寫入。DB 無法寫入或 FS 結果不明仍保留現場，不自動接管或刪除未知內容。

grant 以 user／entry／相對目錄為 key，透過 EntryService 更新或撤回，browse 為基本能力，download／write 可選；不是 deny ACL。grant 要求既有目錄、enabled 帳號及入口；寫入執行還要求 Linux 與入口 opt-in。CLI 的 entry-add／grant／write 仍保留。候選移除只變更管理紀錄。

本版資源門檻為帳號 100、入口 100、候選 100；每帳號 grant 100，snapshot 最多 10,000 grant。超過門檻明確失敗，不截斷後假裝完整。根路徑、password hash、session token 與 DB entities 不進 contracts。

## 個人偏好與密碼

`preferences` 只由目前 session 的 userId 定位，預設 list／50，支援 list／thumbnails 與每頁 25／50／100。GET 不寫入預設；POST 驗 schema，不能替其他帳號設定。Workspace 初始／偏好變更套用 view 及 page size，使用者暫時切換 view 不自動覆寫偏好；新偏好儲存後回第一頁。

自行改密碼先驗目前密碼，再使用同一有界 scrypt admission 建新 hash；沿用身份節流並驗 await 前後的 user／舊 hash。成功結束所有身份 session、清 Cookie 並要求重新登入；管理員重設不需知道舊密碼。新密碼不正規化、不截斷、不進 browser storage。

## 介面狀態

設定 Modal 的個人／帳號／儲存與授權分頁只放已接 API 的控制項。member 只顯示個人分頁。失敗保留草稿；只有設定資料的 useResource 啟用同 URL retainOnReload，錯誤仍顯示，避免重新整理卸載表單。其他列表維持原本取消／不顯示舊路徑結果規則。關閉時有未儲存輸入需明確捨棄；儲存期間停用表單，afterClose 再卸載並恢復焦點。

驗證見 P6.2（本機 `../validation/P6.2.md`），操作見[設定管理](../operations/settings.md)。
