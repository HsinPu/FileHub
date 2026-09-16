# 專案架構

```text
filehub/
├─ frontend/
│  ├─ src/app/                   # 路由、登入狀態入口
│  ├─ src/features/auth/         # 登入、密碼設定、AuthProvider
│  ├─ src/features/files/        # 檔案列表、目錄樹與預覽
│  ├─ src/lib/api.ts             # 同源 API client、Zod 回應驗證
│  ├─ src/styles.css             # 共用版面與響應式樣式
│  └─ tests/                     # Playwright 真實瀏覽器驗收
├─ backend/
│  ├─ app/main.py                # application factory、lifespan、錯誤及靜態資源
│  ├─ app/api/routes/            # auth / files 路由
│  ├─ app/api/dependencies.py    # DB session 與目前使用者
│  ├─ app/schemas/               # 請求／回應模型
│  ├─ app/services/files.py      # 根目錄安全、列表、建目錄、預覽
│  ├─ app/services/transfers.py  # 串流上傳、命名驗證、原子不覆寫重新命名
│  ├─ app/services/operations.py # 單一背景批次工作者、逐項紀錄與取消
│  ├─ app/services/trash.py      # 垃圾桶搬移／還原與重啟核對
│  ├─ app/services/folder_uploads.py # 上傳階層驗證、批次映射與重送保護
│  ├─ app/services/archives.py   # ZIP 串流打包、容量與到期清理
│  ├─ app/db/migrations.py       # 資料庫遷移，含版本 8 目錄登錄
│  ├─ app/core/                  # 設定、密碼／JWT、登入節流、領域錯誤
│  ├─ app/models/                # 相容舊 users 表及新增 sessions 表
│  ├─ app/db/                    # SQLAlchemy engine 與 session factory
│  ├─ app/cli.py                 # 本機首次帳號設定
│  └─ tests/                     # API／資料相容／檔案邊界測試
├─ database/                     # 既有帳號資料，不納入 Git
├─ config/                       # 本機隨機金鑰，不納入 Git
├─ srv/                          # 預設管理檔案目錄，不納入 Git
├─ Dockerfile                    # 建置前端與後端映像
└─ compose.yaml                  # Docker 部署及持久化資料卷
```

## 資料流

React 元件 → API client → FastAPI router → 檔案服務／帳號資料庫。
路由負責 HTTP 契約，檔案服務負責路徑與檔案操作，Pydantic 與 Zod 分別驗證後端及前端邊界。
阻塞式檔案與資料庫操作使用同步路由，由 FastAPI 的執行緒池執行。
切換目錄與預覽時取消舊請求，避免舊結果覆蓋新畫面。

## API v1

| 方法 | 路徑 | 請求／結果 |
| --- | --- | --- |
| POST | `/api/v1/auth/login` | `{username,password}` → `{username,full_name}`，設定 Cookie |
| GET | `/api/v1/auth/me` | 目前帳號 |
| POST | `/api/v1/auth/logout` | 撤銷目前登入 |
| PUT | `/api/v1/auth/password` | `{current_password,new_password}`，撤銷所有登入 |
| GET | `/api/v1/files?path=` | `{path,entries}`，一層目錄內容 |
| GET | `/api/v1/files/tree?path=` | `{path,entries}`，一層子資料夾 |
| POST | `/api/v1/files/directory` | `{path,name}` → 新建 FileEntry，201 |
| GET | `/api/v1/files/content?path=` | `{name,path,type,size,content,mime_type}` |
| GET／HEAD | `/api/v1/files/image?path=` | 驗證登入及副檔名後串流圖片，10 MB 上限 |
| GET／HEAD | `/api/v1/files/pdf?path=` | PDF 簽章／大小驗證，支援 Range；50 MB 上限 |
| POST | `/api/v1/files/upload-batch` | `{request_id,destination,conflict,entries:[{path,size?}]}` → source/target/status 映射；size 省略表示目錄 |
| POST | `/api/v1/files/upload?path=&name=` | 原始二進位 body，上限 512 MB → FileEntry，201 |
| PATCH | `/api/v1/files/rename` | `{path,name}` → FileEntry，不覆寫，衝突 409 |
| GET／HEAD | `/api/v1/files/download?path=` | 單檔 attachment，支援串流下載 |
| POST | `/api/v1/files/operations` | `{request_id,kind,paths,destination,conflict}` → 任務，202 |
| GET | `/api/v1/files/operations?offset=0` | 目前帳號任務，每頁 50 筆 |
| GET | `/api/v1/files/operations/{id}` | 逐項狀態與結果；僅擁有者可讀 |
| POST | `/api/v1/files/operations/{id}/cancel` | 要求取消剩餘操作 |
| GET／HEAD | `/api/v1/files/operations/{id}/archive` | 擁有者下載已完成 ZIP；過期回應 410 |
| GET | `/api/v1/trash?offset=0` | 共用垃圾桶，每頁 50 筆 |
| POST | `/api/v1/trash/restore` | `{request_id,ids,destination?,conflict}` → 還原任務，202；null 目的地為原位置 |
| GET | `/api/health` | `{status:"ok"}` |

所有檔案 API 都需要登入；每個寫入要求包含 `X-Requested-With: Files-App`。
批次任務的 request_id 使用 UUID，重送相同內容取得原任務，不同內容回報 409。kind 為 copy／move／trash／restore／archive，conflict 為 skip／keep_both。任務背景執行並保存於 SQLite；API 202 代表已接受，不代表檔案已完成操作。
FileEntry 為 `{name,path,type,size,modified}`；type 是 `directory` 或 `file`，size 是位元組或 null，modified 是含時區的 ISO 時間，離線共享入口可為 null。
API path 為根目錄內的相對路徑，使用 `/`，根目錄為空字串。一般檔案 API 不回傳伺服器絕對路徑；管理員目錄狀態另外顯示容器根位置。
文字 content 是文字，圖片 content 是 Base64；前端只透過文字節點或 img 顯示，沒有 HTML 注入。
錯誤格式為 `{error:{code,message}}`；包含 400、401、403、404、409、413、415、422、429。

## 維護

第四階段新增 `services/access.py` 統一根目錄與權限檢查，`models/access.py` 帳號政策／管理紀錄、`models/share.py` 分享紀錄；`routes/accounts.py` 管理 API、`routes/shares.py` 分享與公開下載入口。資料庫版本 5 遷移既有帳號為管理員，版本 6 建立分享表。

| 方法 | 路徑 | 用途 |
| --- | --- | --- |
| GET／POST | `/api/v1/admin/accounts` | 管理員列表／建立帳號，列表 offset、每頁 100 筆 |
| PUT | `/api/v1/admin/accounts/{id}` | 帳號設定、角色、範圍、權限；撤銷登入 |
| POST | `/api/v1/admin/accounts/{id}/password` | 重設密碼並要求首次修改 |
| POST | `/api/v1/admin/accounts/{id}/revoke-sessions` | 撤銷登入 |
| GET | `/api/v1/admin/audit` | 管理紀錄，offset、每頁 100 筆 |
| GET／POST | `/api/v1/shares` | 列表／建立分享；token 只在建立時回傳 |
| POST | `/api/v1/shares/{id}/revoke` | 擁有者或管理員撤銷 |
| POST | `/api/v1/public-shares/open` | token、選填 password；回傳公開資訊及短期下載 Cookie |
| GET／HEAD | `/api/v1/public-shares/download/{id}` | 需短期 Cookie，逐次重新驗證分享 |

`/auth/login` 與 `/auth/me` 額外回傳 role、permissions、must_change_password。單目錄帳號的檔案 API path 相對於登入者根目錄；多目錄帳號使用系統檔案根目錄的相對路徑。詳細規則見 PHASE4.md。

前端依賴由 package-lock.json 鎖定；後端 requirements.in 宣告直接依賴，requirements.txt 鎖定正式依賴，requirements-dev.txt 加入測試工具。
更新後端鎖定檔可使用 `uv pip compile backend/requirements.in --universal -o backend/requirements.txt`，再對開發檔加上正式鎖定檔 constraint。

實作參考：[Ant Design + Vite](https://ant.design/docs/react/use-with-vite/)、[FastAPI lifespan](https://fastapi.tiangolo.com/advanced/events/)。


## 後台目錄登錄（資料庫版本 8）

- `backend/app/models/directory.py`：持久化目錄、版本及一次性匯入狀態。
- `backend/app/services/directories.py`：登錄、路徑衝突、狀態檢查、停用撤權及影響清單。
- `backend/app/api/routes/directories.py`：管理員登錄／選擇器 API 與帳號入口 API。
- `backend/app/services/access.py`：動態授權、虛擬根、深層授權目錄與導覽邊界。
- `frontend/src/features/auth/DirectoriesPage.tsx`、`DirectoryBrowser.tsx`：管理頁與單層選擇器。
- `frontend/src/features/auth/DirectoryGrantEditor.tsx`：每個目錄授權與失效狀態。
- `frontend/src/features/files/FilesPage.tsx`、`DirectoryTree.tsx`、`OperationPanel.tsx`：入口別名、受限導覽及操作目的地。

多目錄帳號的 path 相對於系統檔案根目錄；單目錄帳號維持相對於帳號根目錄。檔案列表與 capabilities 回傳 scope_path、scope_name、directory_id、parent_path、breadcrumbs；客戶端不自行拼出未授權的祖先路徑。

虛擬根 FileEntry 增加 directory_id、directory_root、status，離線入口 modified 可為 null。管理員目錄狀態包含容器根位置；一般帳號入口只回傳相對路徑。完整 API 表與操作規則見 [目錄管理](DIRECTORY_MANAGEMENT.md)。
