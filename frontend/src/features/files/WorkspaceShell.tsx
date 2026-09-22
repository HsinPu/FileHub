import type { WorkspaceState } from "./FileWorkspace";
import { ResizableDrawer } from "../../app/ResizableDrawer";
import { ProfileSettings, SecuritySettings } from "../auth/PersonalSettings";
import { useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  App,
  Avatar,
  Button,
  Drawer,
  Dropdown,
  Grid,
  Layout,
  Space,
  Tabs,
  Result,
} from "antd";
import {
  ArrowLeftOutlined,
  SettingOutlined,
  UpOutlined,
  ShareAltOutlined,
  DeleteOutlined,
  CloudUploadOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  KeyOutlined,
  LogoutOutlined,
  MenuOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { errorMessage } from "../../lib/api";
import { useAuth } from "../auth/AuthProvider";
import { DirectoryTree } from "./DirectoryTree";
import { lazy, Suspense, type ReactNode, type ComponentProps } from "react";
import { Spin } from "antd";

const AccountsPage = lazy(() => import("../auth/AccountsPage"));
const DirectoriesPage = lazy(() => import("../auth/DirectoriesPage"));

type ContentEvents = Pick<
  ComponentProps<typeof Layout.Content>,
  "onDragOver" | "onDragLeave" | "onDrop"
>;
export function WorkspaceShell({
  workspace,
  navigate,
  dragging,
  contentEvents,
  children,
  overlays,
}: {
  workspace: WorkspaceState;
  navigate: (path: string) => void;
  dragging: boolean;
  contentEvents: ContentEvents;
  children: ReactNode;
  overlays: ReactNode;
}) {
  const {
    path,
    lastPath,
    revision,
    taskOpen,
    setTaskOpen,
    taskTab,
    setTaskTab,
    sidebarOpen,
    setSidebarOpen,
    settingsForm,
    setSettingsForm,
    uploads,
    folders,
    operations,
  } = workspace;
  const location = useLocation();
  const routeNavigate = useNavigate();
  const isFiles = location.pathname === "/files";
  const isSettings = location.pathname.startsWith("/settings/");
  const accountsOpen = location.pathname === "/settings/accounts";
  const sharesOpen = location.pathname === "/shares";
  const trashOpen = location.pathname === "/trash";
  const { user, logout } = useAuth();
  const { message, modal } = App.useApp();
  const screens = Grid.useBreakpoint();
  const rootLabel = user?.scope_mode === "multiple" ? "所有目錄" : "所有檔案";
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
          {...contentEvents}
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
          <Suspense fallback={<Spin />}>
            {accountsOpen && user?.role === "admin" && (
              <AccountsPage onFormState={setSettingsForm} />
            )}
            {location.pathname === "/settings/directories" &&
              (user?.role === "admin" ? (
                <DirectoriesPage onFormState={setSettingsForm} />
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
          </Suspense>
          {children}
        </Layout.Content>
      </Layout>
      {overlays}
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
    </Layout>
  );
}
