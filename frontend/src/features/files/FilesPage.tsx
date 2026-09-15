import { ResizableDrawer } from "../../app/ResizableDrawer";
import AccountsPage from "../auth/AccountsPage";
import DirectoriesPage from "../auth/DirectoriesPage";
import { ProfileSettings, SecuritySettings } from "../auth/PersonalSettings";
import { formatDate } from "../../lib/date";
import { useEffect, useRef, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import {
  Alert,
  App,
  Avatar,
  Breadcrumb,
  Button,
  Drawer,
  Dropdown,
  Empty,
  Checkbox,
  Pagination,
  Segmented,
  Form,
  Grid,
  Input,
  Layout,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
  Tabs,
  Select,
  Descriptions,
  Result,
} from "antd";
import {
  ArrowUpOutlined,
  ArrowLeftOutlined,
  SettingOutlined,
  UpOutlined,
  ShareAltOutlined,
  DeleteOutlined,
  CloudUploadOutlined,
  DownOutlined,
  FileImageOutlined,
  FileOutlined,
  FolderAddOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  HomeOutlined,
  KeyOutlined,
  LogoutOutlined,
  MenuOutlined,
  ReloadOutlined,
  SearchOutlined,
  UserOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import {
  api,
  entrySchema,
  errorMessage,
  formatSize,
  listingSchema,
  type FileEntry,
} from "../../lib/api";
import { useAuth } from "../auth/AuthProvider";
import { DirectoryTree } from "./DirectoryTree";
import { PreviewModal, isImage } from "./PreviewModal";
import { RenameModal } from "./RenameModal";
import { useUploads } from "./UploadPanel";
import { downloadFile } from "./download";
import { useOperations } from "./OperationPanel";
import { TrashPanel } from "./TrashPanel";
import { useFolderUpload } from "./FolderUpload";
import { useFileClipboard, useFileShortcuts } from "./useFileClipboard";
import { SharePanel } from "./SharePanel";

const dateFormat = { format: (value: Date) => formatDate(value.toISOString()) };

export function FilesPage() {
  const [params] = useSearchParams();
  const location = useLocation();
  const routeNavigate = useNavigate();
  const isFiles = location.pathname === "/files";
  const isSettings = location.pathname.startsWith("/settings/");
  const accountsOpen = location.pathname === "/settings/accounts";
  const workspaceLocation = useRef("/files");
  const mainRef = useRef<HTMLDivElement>(null);
  const scrollPositions = useRef<Record<string, number>>({});
  const scrollKey = location.pathname + location.search;
  useEffect(() => {
    if (!isSettings) workspaceLocation.current = scrollKey;
    const frame = requestAnimationFrame(() => {
      if (mainRef.current)
        mainRef.current.scrollTop = scrollPositions.current[scrollKey] || 0;
    });
    return () => cancelAnimationFrame(frame);
  }, [scrollKey, isSettings]);
  const lastPath = useRef("");
  const path = isFiles ? params.get("path") || "" : lastPath.current;
  useEffect(() => {
    if (isFiles) lastPath.current = path;
  }, [isFiles, path]);
  const [taskOpen, setTaskOpen] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    dirty: false,
    busy: false,
  });
  const [taskTab, setTaskTab] = useState("uploads");
  const [mobileSelect, setMobileSelect] = useState(false);
  const [sort, setSort] = useState("name");
  const anchor = useRef<string | null>(null);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [directoryPermissions, setDirectoryPermissions] = useState<string[]>(
    [],
  );
  const [loadedPath, setLoadedPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<string>("清單");
  const [gridPage, setGridPage] = useState(1);
  useEffect(() => {
    setGridPage(1);
    setSelected([]);
    anchor.current = null;
  }, [path, search, sort, view]);
  useEffect(() => {
    setSelected([]);
    anchor.current = null;
  }, [gridPage]);
  const [revision, setRevision] = useState(0);
  const [preview, setPreview] = useState<FileEntry | null>(null);
  const [details, setDetails] = useState<FileEntry | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [form] = Form.useForm();
  const [selected, setSelected] = useState<React.Key[]>([]);
  const [renaming, setRenaming] = useState<FileEntry | null>(null);
  const trashOpen = location.pathname === "/trash";
  const [sharing, setSharing] = useState<FileEntry | null>(null);
  const sharesOpen = location.pathname === "/shares";
  const [dragging, setDragging] = useState(false);
  const uploadInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const uploads = useUploads(() => setRevision((v) => v + 1), true);
  const folders = useFolderUpload(uploads.addPrepared);
  const clipboard = useFileClipboard();
  const operations = useOperations((jobs) => {
    clipboard.reconcile(jobs);
    setRevision((v) => v + 1);
  }, true);
  const { user, logout } = useAuth();
  const rootLabel = user?.scope_mode === "multiple" ? "所有目錄" : "所有檔案";
  const can = (permission: string) =>
    user?.role === "admin" ||
    (loadedPath === path && directoryPermissions.includes(permission));
  const { message, modal } = App.useApp();
  const screens = Grid.useBreakpoint();
  useEffect(() => {
    if (operations.dialogOpen) setTaskOpen(false);
  }, [operations.dialogOpen]);
  useEffect(() => {
    if (uploads.open) {
      setTaskTab("uploads");
      setTaskOpen(true);
      uploads.setOpen(false);
    }
    if (operations.open) {
      setTaskTab("operations");
      setTaskOpen(true);
      operations.setOpen(false);
    }
  }, [uploads.open, operations.open]);
  useEffect(() => {
    setSelected([]);
    setMobileSelect(false);
    setPreview(null);
    setRenaming(null);
    setSidebarOpen(false);
    setDragging(false);
    setDetails(null);
  }, [location.pathname]);
  useEffect(() => {
    if (
      !isFiles ||
      taskOpen ||
      preview ||
      createOpen ||
      renaming ||
      sharing ||
      details ||
      sidebarOpen ||
      operations.dialogOpen
    )
      return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelected([]);
        setMobileSelect(false);
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [
    isFiles,
    taskOpen,
    preview,
    createOpen,
    renaming,
    sharing,
    details,
    sidebarOpen,
    operations.dialogOpen,
  ]);

  useEffect(() => {
    setSearch("");
    setPreview(null);
    setDetails(null);
    setSelected([]);
    setRenaming(null);
  }, [path]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api(`/files?path=${encodeURIComponent(path)}`, listingSchema, {
      signal: controller.signal,
    })
      .then((result) => {
        if (controller.signal.aborted) return;
        setEntries(result.entries);
        setDirectoryPermissions(result.permissions);
        setLoadedPath(result.path);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(errorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, revision]);

  function navigate(next: string) {
    routeNavigate(next ? `/files?path=${encodeURIComponent(next)}` : "/files");
    setSidebarOpen(false);
  }
  function openEntry(entry: FileEntry) {
    if (entry.type === "directory") navigate(entry.path);
    else if (can("read")) setPreview(entry);
  }
  async function createFolder(values: { name: string }) {
    setCreating(true);
    setCreateError(null);
    try {
      await api("/files/directory", entrySchema, {
        method: "POST",
        body: JSON.stringify({ path, name: values.name }),
      });
      setCreateOpen(false);
      form.resetFields();
      setRevision((v) => v + 1);
      message.success("資料夾已建立");
    } catch (error) {
      setCreateError(errorMessage(error));
    } finally {
      setCreating(false);
    }
  }
  const visibleEntries = loadedPath === path ? entries : [];
  const filtered = visibleEntries
    .filter((entry) =>
      entry.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
    )
    .sort((a, b) =>
      sort === "modified"
        ? b.modified.localeCompare(a.modified)
        : sort === "size"
          ? (b.size ?? -1) - (a.size ?? -1)
          : a.name.localeCompare(b.name, "zh-TW"),
    );
  const currentPage = Math.min(
    gridPage,
    Math.max(1, Math.ceil(filtered.length / 20)),
  );
  const pageEntries = filtered.slice((currentPage - 1) * 20, currentPage * 20);
  function selectEntry(entry: FileEntry, event: React.MouseEvent) {
    if (!screens.md && !mobileSelect && !selected.length) {
      openEntry(entry);
      return;
    }
    if (event.shiftKey && anchor.current) {
      const start = pageEntries.findIndex(
        (item) => item.path === anchor.current,
      );
      const end = pageEntries.findIndex((item) => item.path === entry.path);
      if (start >= 0 && end >= 0) {
        setSelected(
          pageEntries
            .slice(Math.min(start, end), Math.max(start, end) + 1)
            .map((item) => item.path),
        );
        return;
      }
    }
    anchor.current = entry.path;
    setSelected((keys) =>
      event.ctrlKey || event.metaKey || !screens.md
        ? keys.includes(entry.path)
          ? keys.filter((key) => key !== entry.path)
          : [...keys, entry.path]
        : [entry.path],
    );
  }
  const directories = visibleEntries.filter(
    (entry) => entry.type === "directory",
  ).length;
  const selectedEntries = pageEntries.filter((entry) =>
    selected.includes(entry.path),
  );
  function paste() {
    if (
      clipboard.clipboard?.mode === "move"
        ? !(can("modify") && (user?.scope_mode !== "multiple" || can("upload")))
        : !can("upload")
    )
      return;
    if (clipboard.clipboard && !loading && !error)
      operations.begin(
        clipboard.clipboard.mode,
        clipboard.clipboard.entries,
        path,
      );
  }
  useFileShortcuts({
    enabled:
      isFiles &&
      !taskOpen &&
      !sharing &&
      !sidebarOpen &&
      !details &&
      !loading &&
      !error &&
      !preview &&
      !createOpen &&
      !renaming &&
      !trashOpen &&
      !operations.dialogOpen,
    selected: selectedEntries,
    capture: (mode, entries) => {
      if (can(mode === "copy" ? "read" : "modify"))
        clipboard.capture(mode, entries);
    },
    paste,
    trash: () => {
      if (can("delete")) operations.begin("trash", selectedEntries, path);
    },
  });
  function fileMenu(entry: FileEntry) {
    const multiple =
      selected.includes(entry.path) && selectedEntries.length > 1;
    return {
      items: [
        {
          key: "open",
          label: entry.type === "directory" ? "開啟" : "預覽",
          disabled: multiple || (entry.type !== "directory" && !can("read")),
        },
        {
          key: "share",
          label: "分享",
          disabled:
            multiple ||
            entry.type === "directory" ||
            !can("read") ||
            !can("share"),
        },
        {
          key: "download",
          label: "下載",
          disabled: multiple || entry.type === "directory" || !can("read"),
        },
        {
          key: "rename",
          label: "重新命名",
          disabled: multiple || !can("modify"),
        },
        { key: "details", label: "詳細資訊", disabled: multiple },
        { key: "archive", label: "打包下載 ZIP", disabled: !can("read") },
        { key: "clipboard-copy", label: "複製", disabled: !can("read") },
        { key: "clipboard-cut", label: "剪下", disabled: !can("modify") },
        {
          key: "copy",
          label: "複製到…",
          disabled: !can("read"),
        },
        { key: "move", label: "移動到…", disabled: !can("modify") },
        {
          key: "trash",
          label: "移至垃圾桶",
          danger: true,
          disabled: !can("delete"),
        },
      ],
      onClick: ({
        key,
        domEvent,
      }: {
        key: string;
        domEvent:
          React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>;
      }) => {
        domEvent.stopPropagation();
        if (key === "details") setDetails(entry);
        else if (key === "share") setSharing(entry);
        else if (key === "rename") setRenaming(entry);
        else if (key === "archive")
          operations.begin(
            "archive",
            selected.includes(entry.path) ? selectedEntries : [entry],
            "",
          );
        else if (key === "clipboard-copy" || key === "clipboard-cut")
          clipboard.capture(
            key === "clipboard-copy" ? "copy" : "move",
            selected.includes(entry.path) ? selectedEntries : [entry],
          );
        else if (key === "trash")
          operations.begin(
            "trash",
            selected.includes(entry.path) ? selectedEntries : [entry],
            path,
          );
        else if (key === "copy" || key === "move")
          operations.begin(
            key,
            selected.includes(entry.path) ? selectedEntries : [entry],
            path,
          );
        else if (key === "download")
          downloadFile(entry.path).catch((error) =>
            message.error(errorMessage(error)),
          );
        else openEntry(entry);
      },
    };
  }
  const columns: ColumnsType<FileEntry> = [
    {
      title: "名稱",
      dataIndex: "name",
      key: "name",
      render: (_, entry) => (
        <Dropdown menu={fileMenu(entry)} trigger={["contextMenu"]}>
          <button
            className="file-name"
            aria-label={`選取 ${entry.name}`}
            onClick={(event) => {
              event.stopPropagation();
              selectEntry(entry, event);
            }}
            onDoubleClick={() => openEntry(entry)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                openEntry(entry);
              }
            }}
          >
            <span className={`file-icon ${entry.type}`}>
              {entry.type === "directory" ? (
                <FolderOutlined />
              ) : /\.(png|jpe?g|gif|webp|svg)$/i.test(entry.name) ? (
                <FileImageOutlined />
              ) : (
                <FileOutlined />
              )}
            </span>
            <span className="file-name-text" title={entry.name}>
              {entry.name}
              {!screens.md && (
                <small className="mobile-file-meta">
                  {formatSize(entry.size)} ·{" "}
                  {dateFormat.format(new Date(entry.modified))}
                </small>
              )}
            </span>
          </button>
        </Dropdown>
      ),
    },
    {
      title: "建立時間",
      dataIndex: "created",
      key: "created",
      width: 175,
      responsive: ["lg"],
      render: (value) => (
        <span className="cell-muted">
          {value ? formatDate(value) : "未提供"}
        </span>
      ),
    },
    {
      title: "修改時間",
      dataIndex: "modified",
      key: "modified",
      width: 175,
      responsive: ["lg"],
      render: (value) => (
        <span className="cell-muted">{dateFormat.format(new Date(value))}</span>
      ),
    },
    {
      title: "大小",
      dataIndex: "size",
      key: "size",
      width: 110,
      align: "right",
      responsive: ["sm"],
      render: (value) => (
        <span className="cell-muted">{formatSize(value)}</span>
      ),
    },
    {
      title: "類型",
      dataIndex: "type",
      key: "type",
      width: 110,
      responsive: ["md"],
      render: (type) => (
        <Tag bordered={false} color={type === "directory" ? "gold" : "default"}>
          {type === "directory" ? "資料夾" : "檔案"}
        </Tag>
      ),
    },
    {
      title: "操作",
      key: "action",
      width: screens.md ? 120 : 100,
      render: (_, entry) => (
        <Space size={0}>
          <Button
            type="text"
            size="small"
            onClick={(event) => {
              event.stopPropagation();
              openEntry(entry);
            }}
            aria-label={`${entry.type === "directory" ? "開啟" : "預覽"} ${entry.name}`}
          >
            {entry.type === "directory" ? "開啟" : "預覽"}
          </Button>
          <Dropdown menu={fileMenu(entry)} trigger={["click"]}>
            <Button
              type="text"
              aria-label={`更多操作 ${entry.name}`}
              onClick={(event) => event.stopPropagation()}
            >
              •••
            </Button>
          </Dropdown>
        </Space>
      ),
    },
  ];
  const crumbs = [
    {
      title: (
        <button className="crumb-button" onClick={() => navigate("")}>
          <HomeOutlined /> {rootLabel}
        </button>
      ),
    },
    ...path
      .split("/")
      .filter(Boolean)
      .map((part, index, parts) => ({
        title: (
          <button
            className="crumb-button"
            onClick={() => navigate(parts.slice(0, index + 1).join("/"))}
          >
            {part}
          </button>
        ),
      })),
  ];
  const settingsItems = [
    {
      path: "/settings/profile",
      label: "帳號資料",
      icon: <UserOutlined aria-hidden />,
    },
    {
      path: "/settings/security",
      label: "密碼與登入",
      icon: <KeyOutlined aria-hidden />,
    },
    ...(user?.role === "admin"
      ? [
          {
            path: "/settings/accounts",
            label: "帳號管理",
            icon: <SettingOutlined aria-hidden />,
          },
          {
            path: "/settings/directories",
            label: "目錄管理",
            icon: <FolderOutlined aria-hidden />,
          },
        ]
      : []),
  ];
  const sidebar = (
    <nav
      className="sidebar-content"
      aria-label={isSettings ? "設定導覽" : "主要導覽"}
    >
      <div className="sidebar-navigation">
        {isSettings ? (
          <>
            <Link
              className="nav-item settings-back"
              to={workspaceLocation.current}
            >
              <ArrowLeftOutlined aria-hidden />
              返回工作台
            </Link>
            <div className="settings-label">設定</div>
            <div className="workspace-label">個人設定</div>
            {settingsItems.map((item) => (
              <div key={item.path}>
                {item.path === "/settings/accounts" && (
                  <div className="workspace-label settings-group">
                    管理員設定
                  </div>
                )}
                <Link
                  aria-label={item.label}
                  className={`nav-item ${location.pathname === item.path ? "active" : ""}`}
                  aria-current={
                    location.pathname === item.path ? "page" : undefined
                  }
                  to={item.path}
                >
                  {item.icon}
                  {item.label}
                </Link>
              </div>
            ))}
          </>
        ) : (
          <>
            <div className="workspace-label">工作空間</div>
            <Link
              aria-label={rootLabel}
              className={`nav-item ${isFiles ? "active" : ""}`}
              aria-current={isFiles ? "page" : undefined}
              to={
                lastPath.current
                  ? `/files?path=${encodeURIComponent(lastPath.current)}`
                  : "/files"
              }
            >
              <FolderOpenOutlined aria-hidden />
              {rootLabel}
            </Link>
            <Link
              aria-label="分享管理"
              className={`nav-item ${sharesOpen ? "active" : ""}`}
              aria-current={sharesOpen ? "page" : undefined}
              to="/shares"
            >
              <ShareAltOutlined aria-hidden />
              分享管理
            </Link>
            <Link
              aria-label="資源回收筒"
              className={`nav-item ${trashOpen ? "active" : ""}`}
              aria-current={trashOpen ? "page" : undefined}
              to="/trash"
            >
              <DeleteOutlined aria-hidden />
              資源回收筒
            </Link>
            {isFiles && (
              <>
                <div className="sidebar-divider" />
                <div className="workspace-label">資料夾</div>
                <DirectoryTree key={revision} path={path} onSelect={navigate} />
              </>
            )}
          </>
        )}
      </div>
      <div className="sidebar-account">
        <Dropdown
          placement="topLeft"
          trigger={["click"]}
          menu={{
            items: [
              {
                key: "settings",
                icon: <SettingOutlined />,
                label: "設定與管理",
              },
              { type: "divider" },
              { key: "logout", icon: <LogoutOutlined />, label: "登出" },
            ],
            onClick: ({ key }) => {
              if (key === "settings") {
                if (!isSettings)
                  routeNavigate(
                    user?.role === "admin"
                      ? "/settings/accounts"
                      : "/settings/profile",
                  );
                else setSidebarOpen(false);
              } else if (settingsForm.busy)
                message.info("請等待儲存完成後再登出。");
              else if (settingsForm.dirty)
                modal.confirm({
                  title: "放棄變更並登出？",
                  content: "尚未儲存的內容將不會保留。",
                  okText: "放棄變更並登出",
                  cancelText: "繼續編輯",
                  onOk: () =>
                    logout().catch((error) => {
                      message.error(errorMessage(error));
                      throw error;
                    }),
                });
              else
                logout().catch((error) => message.error(errorMessage(error)));
            },
          }}
        >
          <Button
            type="text"
            className="sidebar-account-button"
            aria-label="帳號選單"
          >
            <Avatar size={32}>
              {(user?.full_name || user?.username || "?")
                .slice(0, 1)
                .toUpperCase()}
            </Avatar>
            <span className="sidebar-account-copy">
              <span title={user?.full_name || user?.username}>
                {user?.full_name || user?.username}
              </span>
              <small>{user?.role === "admin" ? "管理員" : "一般使用者"}</small>
            </span>
            <UpOutlined aria-hidden />
          </Button>
        </Dropdown>
      </div>
    </nav>
  );
  return (
    <Layout className="workspace">
      <Layout.Header className="topbar">
        <div className="topbar-left">
          {!screens.md && (
            <Button
              type="text"
              icon={<MenuOutlined />}
              aria-label={isSettings ? "開啟設定選單" : "開啟資料夾選單"}
              onClick={() => setSidebarOpen(true)}
            />
          )}
          <div className="brand">
            <span className="brand-icon">
              <FolderOpenOutlined />
            </span>
            <strong>FileHub</strong>
            <span className="brand-caption">檔案工作空間</span>
          </div>
        </div>
        <Space>
          <Button
            aria-label="工作進度"
            icon={<CloudUploadOutlined aria-hidden />}
            onClick={() => setTaskOpen(true)}
          >
            工作進度
            {uploads.active + operations.active > 0
              ? ` (${uploads.active + operations.active})`
              : ""}
          </Button>
        </Space>
      </Layout.Header>
      <Layout className="workspace-body">
        {screens.md && (
          <Layout.Sider theme="light" width={232} className="sidebar">
            {sidebar}
          </Layout.Sider>
        )}
        <Drawer
          className="sidebar-drawer"
          title={isSettings ? "設定" : "工作空間"}
          placement="left"
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          width={290}
        >
          {sidebar}
        </Drawer>
        <Layout.Content
          ref={mainRef}
          onScroll={(event) => {
            scrollPositions.current[scrollKey] = event.currentTarget.scrollTop;
          }}
          className={`workspace-main ${dragging ? "dragging-files" : ""}`}
          onDragOver={(event) => {
            if (isFiles && event.dataTransfer.types.includes("Files")) {
              event.preventDefault();
              setDragging(true);
            }
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node))
              setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            if (!isFiles || loading || error || !can("upload")) {
              message.warning("目前無法上傳，請確認權限及資料夾載入狀態。");
              return;
            }
            const items = Array.from(event.dataTransfer.items);
            const roots = items
              .map((item) => item.webkitGetAsEntry?.())
              .filter((entry): entry is FileSystemEntry => !!entry);
            if (roots.some((entry) => entry.isDirectory)) {
              void folders.drop(roots, path);
              return;
            }
            uploads.add(Array.from(event.dataTransfer.files), path);
          }}
        >
          {isSettings && !screens.md && (
            <Button
              className="mobile-settings-back"
              icon={<ArrowLeftOutlined />}
              onClick={() => routeNavigate(workspaceLocation.current)}
            >
              返回工作台
            </Button>
          )}
          {accountsOpen && user?.role === "admin" && (
            <AccountsPage onFormState={setSettingsForm} />
          )}
          {location.pathname === "/settings/directories" &&
            (user?.role === "admin" ? (
              <DirectoriesPage />
            ) : (
              <Result
                status="403"
                title="無權限管理目錄"
                subTitle="此功能僅供管理員使用。"
              />
            ))}
          {location.pathname === "/settings/profile" && <ProfileSettings />}
          {location.pathname === "/settings/security" && (
            <SecuritySettings onFormState={setSettingsForm} />
          )}
          {accountsOpen && user?.role !== "admin" && (
            <Result
              status="403"
              title="無權限管理帳號"
              subTitle="此功能僅供管理員使用。"
              extra={
                <Button onClick={() => routeNavigate("/settings/profile")}>
                  前往個人設定
                </Button>
              }
            />
          )}
          <SharePanel
            entry={sharing}
            onClose={() => setSharing(null)}
            open={sharesOpen}
            onCloseList={() => navigate(path)}
            mode="page"
          />
          <TrashPanel
            open={trashOpen}
            onClose={() => navigate(path)}
            revision={revision}
            mode="page"
            canRestore={
              user?.role === "admin" || !!user?.permissions.includes("upload")
            }
            onRestore={(items) =>
              operations.begin(
                "restore",
                items.map((item) => ({
                  path: item.id,
                  type: item.kind,
                  name: item.original_path,
                  originalPath: item.original_path,
                })),
                null,
              )
            }
          />
          {isFiles && (
            <>
              <Breadcrumb items={crumbs} />
              <div className="page-heading">
                <Typography.Title level={1}>
                  {path ? path.split("/").at(-1) : rootLabel}
                </Typography.Title>
              </div>
              <input
                type="file"
                multiple
                hidden
                aria-label="選擇上傳資料夾"
                ref={(element) => {
                  folderInput.current = element;
                  element?.setAttribute("webkitdirectory", "");
                }}
                onChange={(event) => {
                  folders.select(Array.from(event.target.files || []), path);
                  event.target.value = "";
                }}
              />
              <input
                ref={uploadInput}
                type="file"
                multiple
                aria-label="選擇上傳檔案"
                hidden
                onChange={(event) => {
                  uploads.add(Array.from(event.target.files || []), path);
                  event.target.value = "";
                }}
              />
              <section className="files-panel" aria-label="檔案清單">
                <div className="files-toolbar">
                  <Space>
                    <span className="panel-title">
                      {search ? "搜尋結果" : "檔案列表"}
                    </span>
                    <span className="count-badge">{filtered.length}</span>
                  </Space>
                  <div className="toolbar-actions">
                    <Select
                      aria-label="排序方式"
                      value={sort}
                      onChange={setSort}
                      options={[
                        { value: "name", label: "名稱排序" },
                        { value: "modified", label: "最新修改" },
                        { value: "size", label: "大小排序" },
                      ]}
                    />
                    <Segmented
                      aria-label="檢視方式"
                      options={["清單", "縮圖"]}
                      value={view}
                      onChange={setView}
                    />
                    <Input
                      aria-label="搜尋目前資料夾"
                      placeholder="搜尋目前資料夾…"
                      prefix={<SearchOutlined />}
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      allowClear
                      className="search-input"
                    />
                    <Button
                      icon={<ReloadOutlined spin={loading} />}
                      aria-label="重新整理"
                      onClick={() => setRevision((v) => v + 1)}
                      disabled={loading}
                    />
                  </div>
                </div>
                {path && (
                  <div className="parent-row">
                    <Button
                      type="text"
                      size="small"
                      icon={<ArrowUpOutlined />}
                      onClick={() =>
                        navigate(path.split("/").slice(0, -1).join("/"))
                      }
                    >
                      返回上一層
                    </Button>
                  </div>
                )}
                <div
                  className={`selection-toolbar ${selectedEntries.length ? "has-selection" : ""}`}
                >
                  {selectedEntries.length ? (
                    <>
                      <strong role="status">
                        已選取 {selectedEntries.length} 個項目
                      </strong>
                      <div className="selection-actions">
                        <Button
                          disabled={!can("read")}
                          onClick={() =>
                            selectedEntries.length === 1 &&
                            selectedEntries[0].type === "file"
                              ? downloadFile(selectedEntries[0].path).catch(
                                  (err) => message.error(errorMessage(err)),
                                )
                              : operations.begin("archive", selectedEntries, "")
                          }
                        >
                          {selectedEntries.length === 1 &&
                          selectedEntries[0].type === "file"
                            ? "下載"
                            : "打包下載 ZIP"}
                        </Button>
                        <Button
                          disabled={!can("modify")}
                          onClick={() =>
                            operations.begin("move", selectedEntries, path)
                          }
                        >
                          移動到
                        </Button>
                        {screens.md &&
                          selectedEntries.length === 1 &&
                          selectedEntries[0].type === "file" && (
                            <Button
                              disabled={!can("read") || !can("share")}
                              onClick={() => setSharing(selectedEntries[0])}
                            >
                              分享
                            </Button>
                          )}
                        <Dropdown
                          menu={fileMenu(selectedEntries[0])}
                          trigger={["click"]}
                        >
                          <Button aria-label="更多操作">
                            更多操作 <DownOutlined aria-hidden />
                          </Button>
                        </Dropdown>
                        <Button
                          type="text"
                          onClick={() => {
                            setSelected([]);
                            setMobileSelect(false);
                          }}
                        >
                          取消選取
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <Space>
                        <Dropdown
                          menu={{
                            items: [
                              { key: "file", label: "上傳檔案" },
                              { key: "folder", label: "上傳資料夾" },
                            ],
                            onClick: ({ key }) =>
                              key === "folder"
                                ? folderInput.current?.click()
                                : uploadInput.current?.click(),
                          }}
                          trigger={["click"]}
                          disabled={loading || !!error || !can("upload")}
                        >
                          <Button
                            type="primary"
                            aria-label="上傳檔案"
                            disabled={loading || !!error || !can("upload")}
                            icon={<CloudUploadOutlined />}
                          >
                            上傳 <DownOutlined />
                          </Button>
                        </Dropdown>
                        <Button
                          icon={<FolderAddOutlined />}
                          aria-label="新增資料夾"
                          disabled={loading || !!error || !can("upload")}
                          onClick={() => {
                            setCreateError(null);
                            setCreateOpen(true);
                          }}
                        >
                          新增資料夾
                        </Button>
                      </Space>
                      {!screens.md && (
                        <Button onClick={() => setMobileSelect(!mobileSelect)}>
                          {mobileSelect ? "結束選取" : "選取"}
                        </Button>
                      )}
                      {screens.md && (
                        <span className="muted">單擊選取 · 雙擊開啟</span>
                      )}
                    </>
                  )}
                </div>
                {view === "縮圖" && (
                  <div className="grid-selection">
                    <Checkbox
                      aria-label="全選本頁"
                      disabled={!pageEntries.length || loading || !!error}
                      checked={
                        pageEntries.length > 0 &&
                        selectedEntries.length === pageEntries.length
                      }
                      indeterminate={
                        selectedEntries.length > 0 &&
                        selectedEntries.length < pageEntries.length
                      }
                      onChange={(event) =>
                        setSelected(
                          event.target.checked
                            ? pageEntries.map((entry) => entry.path)
                            : [],
                        )
                      }
                    >
                      全選本頁
                    </Checkbox>
                  </div>
                )}
                {error && (
                  <Alert
                    type="error"
                    title="無法載入資料夾"
                    description={error}
                    showIcon
                    action={
                      <Button onClick={() => setRevision((v) => v + 1)}>
                        重試
                      </Button>
                    }
                  />
                )}
                {view === "縮圖" ? (
                  <>
                    <div
                      className="file-grid"
                      aria-label="縮圖清單"
                      aria-busy={loading}
                    >
                      {pageEntries.map((entry) => (
                        <Dropdown
                          key={entry.path}
                          menu={fileMenu(entry)}
                          trigger={["contextMenu"]}
                        >
                          <article
                            className={`file-card ${selected.includes(entry.path) ? "selected" : ""} ${clipboard.clipboard?.mode === "move" && clipboard.clipboard.entries.some((item) => item.path === entry.path) ? "cut-file" : ""}`}
                          >
                            <Checkbox
                              aria-label={`選取 ${entry.name}`}
                              checked={selected.includes(entry.path)}
                              onChange={(event) =>
                                setSelected((keys) =>
                                  event.target.checked
                                    ? [
                                        ...keys.filter(
                                          (key) => key !== entry.path,
                                        ),
                                        entry.path,
                                      ]
                                    : keys.filter((key) => key !== entry.path),
                                )
                              }
                            />
                            <button
                              className="thumbnail-open"
                              aria-label={`${entry.type === "directory" ? "開啟" : "預覽"} ${entry.name}`}
                              onClick={(event) => selectEntry(entry, event)}
                              onDoubleClick={() => openEntry(entry)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  openEntry(entry);
                                }
                              }}
                            >
                              {can("read") &&
                              isImage(entry) &&
                              (entry.size ?? 0) <= 10 * 1024 * 1024 ? (
                                <img
                                  key={`${entry.path}-${entry.modified}`}
                                  loading="lazy"
                                  alt={entry.name}
                                  src={`/api/v1/files/image?path=${encodeURIComponent(entry.path)}`}
                                  onError={(event) => {
                                    event.currentTarget.alt = "無法載入圖片";
                                  }}
                                />
                              ) : entry.type === "directory" ? (
                                <FolderOutlined />
                              ) : (
                                <FileOutlined />
                              )}
                              <span>{entry.name}</span>
                            </button>
                            <div className="thumbnail-footer">
                              <span>{formatSize(entry.size)}</span>
                              <Dropdown
                                menu={fileMenu(entry)}
                                trigger={["click"]}
                              >
                                <Button
                                  type="text"
                                  aria-label={`更多操作 ${entry.name}`}
                                >
                                  •••
                                </Button>
                              </Dropdown>
                            </div>
                          </article>
                        </Dropdown>
                      ))}
                      {!loading && !filtered.length && (
                        <Empty
                          description={
                            search ? "找不到符合的檔案" : "這個資料夾還沒有檔案"
                          }
                        />
                      )}
                    </div>
                  </>
                ) : (
                  <Table<FileEntry>
                    rowClassName={(entry) =>
                      clipboard.clipboard?.mode === "move" &&
                      clipboard.clipboard.entries.some(
                        (item) => item.path === entry.path,
                      )
                        ? "cut-file"
                        : ""
                    }
                    size="middle"
                    tableLayout="fixed"
                    rowKey="path"
                    columns={columns}
                    dataSource={pageEntries}
                    loading={loading}
                    rowSelection={{
                      selectedRowKeys: selected,
                      onChange: (keys) => setSelected(keys),
                    }}
                    onRow={(entry) => ({
                      onClick: (event) => {
                        if (
                          (event.target as HTMLElement).closest(
                            "button,input,a,.ant-checkbox-wrapper",
                          )
                        )
                          return;
                        selectEntry(entry, event);
                      },
                      onDoubleClick: (event) => {
                        if (
                          !(event.target as HTMLElement).closest(
                            "button,input,a",
                          )
                        )
                          openEntry(entry);
                      },
                    })}
                    pagination={false}
                    locale={{
                      emptyText: error ? (
                        "請重試或選擇其他資料夾"
                      ) : (
                        <Empty
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                          description={
                            search ? "找不到符合的檔案" : "這個資料夾還沒有檔案"
                          }
                        />
                      ),
                    }}
                  />
                )}
                <div className="panel-footer">
                  <span>
                    {visibleEntries.length} 個項目 · {directories} 個資料夾 ·{" "}
                    {visibleEntries.length - directories} 個檔案
                  </span>
                  <Pagination
                    current={currentPage}
                    pageSize={20}
                    total={filtered.length}
                    onChange={setGridPage}
                    showSizeChanger={false}
                    hideOnSinglePage
                  />
                </div>
              </section>
              {search && !filtered.length && (
                <Button onClick={() => setSearch("")}>清除搜尋</Button>
              )}
              {!can("upload") && (
                <p className="workspace-note">
                  目前目錄無上傳權限；其他操作依授權設定。
                </p>
              )}
              {clipboard.clipboard && (
                <p className="workspace-note" role="status">
                  已{clipboard.clipboard.mode === "move" ? "剪下" : "複製"}{" "}
                  {clipboard.clipboard.entries.length}{" "}
                  個項目，開啟目的資料夾後貼上。
                  <Button
                    aria-label="貼上"
                    disabled={
                      loading ||
                      !!error ||
                      (clipboard.clipboard.mode === "move"
                        ? !(
                            can("modify") &&
                            (user?.scope_mode !== "multiple" || can("upload"))
                          )
                        : !can("upload"))
                    }
                    onClick={paste}
                  >
                    貼上
                  </Button>
                  <Button onClick={clipboard.clear}>清除剪貼簿</Button>
                </p>
              )}
            </>
          )}
        </Layout.Content>
      </Layout>
      <PreviewModal
        entry={preview}
        images={filtered.filter(isImage)}
        onNavigate={setPreview}
        onClose={() => setPreview(null)}
      />
      <ResizableDrawer
        className="file-details"
        title="詳細資訊"
        open={!!details}
        onClose={() => setDetails(null)}
      >
        {details && (
          <>
            <Descriptions
              column={1}
              layout="vertical"
              items={[
                { key: "name", label: "名稱", children: details.name },
                { key: "path", label: "位置", children: details.path },
                {
                  key: "kind",
                  label: "類型",
                  children: details.type === "directory" ? "資料夾" : "檔案",
                },
                {
                  key: "size",
                  label: "大小",
                  children: formatSize(details.size),
                },
                {
                  key: "created",
                  label: "建立時間",
                  children: details.created
                    ? formatDate(details.created)
                    : "檔案系統未提供",
                },
                {
                  key: "modified",
                  label: "修改時間",
                  children: formatDate(details.modified),
                },
              ]}
            />
            <Button
              disabled={details.type === "file" && !can("read")}
              onClick={() => {
                openEntry(details);
                setDetails(null);
              }}
            >
              開啟項目
            </Button>
          </>
        )}
      </ResizableDrawer>
      {folders.panel}
      {operations.dialog}
      <ResizableDrawer
        title="工作進度"
        open={taskOpen}
        onClose={() => setTaskOpen(false)}
      >
        <Tabs
          activeKey={taskTab}
          onChange={setTaskTab}
          items={[
            {
              key: "uploads",
              label: `上傳${uploads.active ? ` (${uploads.active})` : ""}`,
              children: uploads.panel,
            },
            {
              key: "operations",
              label: "檔案作業",
              children: operations.panel,
            },
          ]}
        />
      </ResizableDrawer>
      <RenameModal
        entry={renaming}
        onClose={() => setRenaming(null)}
        onComplete={() => {
          setSelected([]);
          setRevision((v) => v + 1);
          message.success("名稱已更新");
        }}
      />
      <Modal
        title="新增資料夾"
        open={createOpen}
        onOk={() => form.submit()}
        onCancel={() => {
          if (!creating) {
            setCreateOpen(false);
            form.resetFields();
          }
        }}
        confirmLoading={creating}
        okText="建立資料夾"
        cancelText="取消"
        closable={!creating}
        maskClosable={!creating}
        cancelButtonProps={{ disabled: creating }}
      >
        <p className="muted">建立位置：{path || "所有檔案"}</p>
        {createError && <Alert type="error" title={createError} showIcon />}
        <Form
          form={form}
          layout="vertical"
          onFinish={createFolder}
          requiredMark={false}
        >
          <Form.Item
            label="資料夾名稱"
            name="name"
            rules={[
              { required: true, message: "請輸入資料夾名稱" },
              { max: 255 },
            ]}
          >
            <Input placeholder="例如：專案文件" autoFocus maxLength={255} />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
}
