# 入口與 grant 最小管理

P1.2 提供入口註冊與授權。先 migration／bootstrap，再由具 state 存取權的管理者執行；不提供 HTTP 管理寫入。原檔不搬入 SQLite，目錄先由操作者建立／掛載。

## 原生 CLI

```shell
pnpm admin entry-add managed "內建資料" /absolute/files
pnpm admin entry-add external "共用資料" /absolute/external
pnpm admin entry-list
pnpm admin entry-grant reader ENTRY_ID . download
pnpm admin entry-grant reader ENTRY_ID team browse
pnpm admin entry-revoke reader ENTRY_ID team
pnpm admin entry-disable ENTRY_ID
```

Windows 開發改用本機絕對路徑，例如 `C:\FileHub\files`；不要用範例路徑覆蓋既有資料。`entry-add` 回 JSON id／label／kind，後續使用該 UUID 取代 ENTRY_ID；`entry-list` 不列出主機 root。CLI 中 `.` 表示入口根，其他 scope 使用 `/` 相對分隔符。

`download` 包含 browse；`browse` 只有列表／metadata 能力。P1 所有入口均唯讀，managed 不代表可寫。每次 API 重新查 grant，撤銷下一個請求即生效；父子 scope 以聯集授權，不用範例的根 grant 當作隔離子 scope 的方式。

## Compose

內建 files volume 已在 `/data/files`；外部目錄先依[部署掛載](deployment.md#外部目錄)配置。可執行：

```shell
docker compose exec api node apps/server/dist/cli.js entry-add managed "內建資料" /data/files
docker compose exec api node apps/server/dist/cli.js entry-add external "外部資料" /mounts/example
docker compose exec api node apps/server/dist/cli.js entry-list
docker compose exec api node apps/server/dist/cli.js entry-grant reader ENTRY_ID . download
```

外部 root 必須是容器內實際掛載位置；範例掛載的實際 destination 以 compose 檔為準。註冊不建立來源、不修復 owner、不搬移檔案。最多 100 個入口、每帳號 100 個 grant。

## 邊界與恢復

- 拒絕父子／相同 root 與 state 的重疊，包含停用入口；不要把 DB／秘密／備份當成原檔入口。停用不釋放 root 註冊，也不自動重新綁定替換目錄。
- root identity 改變或掛載離線時，I/O 失敗，不接管新內容；恢復原掛載及 identity 後再試。重新綁定／刪除入口管理留後續階段，不直接修改正式 DB 迴避邊界。
- symlink／junction 全部拒絕，含指向 scope 內部的連結。Windows 開發另拒絕裝置名、ADS、尾端 dot／space；Linux 是正式部署基線。
- root grant 以空字串保存，子 scope 為實際相對目錄；不可用 `..` 或祖先 listing 取得子 scope 外內容。網站會顯示目前可見入口及 scope；HTTP 自動化可用 `GET /api/entries` 的 session Cookie 契約核對。
- 未宣稱處理真實 NFS／SMB 斷線、惡意本機寫入者或 Windows 正式環境；具體平台與 race 語意見[決策](../decisions/P1-entries-and-scoped-paths.md)。
