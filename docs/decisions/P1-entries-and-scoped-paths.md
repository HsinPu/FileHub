# P1.2 入口、grant 與路徑邊界

> 驗證報告與原始擷取保留本機，未隨原始碼發佈；文中「本機」路徑僅作歷史定位，不能視為新 checkout 已有的證據。

版本 `0.9.0`／schema 3。在 P1.1 的可撤銷 session 上加入入口及共用存取服務，檔案列表／下載於 P1.3 建立，P1 仍不開放檔案寫入。

## 入口與授權

- 每個入口具有 UUID、顯示名稱、managed／external、啟用狀態及私有 canonical root／device／inode／祖先 identity。管理員先準備實體目錄，註冊不 mkdir／chown；兩類入口走同一個 storage 邊界。
- 拒絕相同、父子、root identity／祖先 identity 重疊的入口；包含停用入口。另拒絕 root 與 state 的相同或父子關係，避免直接暴露 DB。host mount／檔案來源由操作者管理；此規則不將 FileHub 變成 OS sandbox。
- admin 可讀所有已啟用入口；member 只能看到有 grant 的入口。grant 指定相對子目錄或空字串根、browse 與可選 download；沒有 write 能力。不可見入口回 404，已可見但 scope／download 不符回 403。
- scope 是 canonical 相對路徑：空字串根；拒絕 absolute／drive／UNC、`.`／`..`、重複 separator、backslash、NUL／控制字元、過深／過長路徑。Unicode 名稱不作正規化，百分號是字面名稱、不再次 URL decode。Windows 另拒絕 ADS、保留裝置名及尾端 dot／space。
- 父子 grant 採聯集；每次授權重新查帳號、entry、grant。撤權、停用與缺少 scope 不因舊 session／DTO 放寬；根 grant 不代表可開其他入口。
- 每 instance 最多 100 個入口，每帳號最多 100 個 grant；回應有界，不包含主機 path、inode 或 DB entity。入口離線仍可列於已授權目錄，實際 I/O 回固定不可用錯誤。

`GET /api/entries` 只回 id／label／kind／readOnly=true／scopes；根 scope／download 能力由後端回報，前端不能以按鈕代替授權。CLI `entry-add`／`entry-list`／`entry-grant`／`entry-revoke`／`entry-disable` 為最小管理入口，HTTP 不開管理寫入。

## Storage 與競態界線

- Linux 正式路徑：先 open root 並核對註冊 identity，再使用 `/proc/self/fd/<fd>/<segment>` 逐層開啟。中間層加 O_DIRECTORY／O_NOFOLLOW，最後加 O_NOFOLLOW／O_NONBLOCK，拒絕非一般檔案／目錄；讀取使用已開啟 handle。所有 symlink 先拒絕，包含指向 scope 內的連結。
- Windows 開發路徑：lstat／realpath／device＋inode 前後檢查每層，最後使用 file handle；普通 junction／symlink 與目錄替換均拒絕。這不是對有本機寫入權惡意程序的競態隔離保證；正式基線為 Linux 容器，未支援其他 OS。
- root 被新目錄替換不自動接管。Linux 已開啟的目錄被改名後仍引用原授權物件，後來放入的外部 symlink 不會改變該 fd。物件內容本身仍可能由外部程式修改，fd 不是不可變 snapshot。
- OS／NAS 內核 I/O 可能阻塞；Promise timeout 不代表取消核心呼叫。FS 檢查不持 DB transaction，grant 寫入前重查帳號／entry；不宣稱 DB 能原子保護 FS。

實作依據：[Node fs FileHandle／flags](https://nodejs.org/docs/latest-v24.x/api/fs.html)、[Linux open／fd 語意](https://man7.org/linux/man-pages/man2/open.2.html)、[OWASP 授權逐請求與 deny by default](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)。指定 File Browser `files/scoped.go` 與舊 FileHub `services/access.py` 作邊界／撤權回歸參考，未搬入來源實作。

實際命令、測試平台與限制見 P1.2 驗證（本機 `../validation/P1.2.md`）。NAS 掛載屬 Linux 下的外部目錄；真實 NFS／SMB 故障、Windows UNC／原生正式部署與跨實體磁碟仍未驗。
