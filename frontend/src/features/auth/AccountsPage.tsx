import { ResizableDrawer } from "../../app/ResizableDrawer";
import { useEffect, useRef, useState } from "react";
import { useUnsavedChanges } from "./useUnsavedChanges";
import { DirectoryTree } from "../files/DirectoryTree";
import {
  Alert,
  App,
  Button,
  Checkbox,
  Form,
  Input,
  Modal,
  Avatar,
  Badge,
  Tag,
  Tooltip,
  Pagination,
  Empty,
  Dropdown,
  Select,
  Space,
  Switch,
  Table,
  Typography,
  Grid,
} from "antd";
import { MoreOutlined, PlusOutlined, FilterOutlined } from "@ant-design/icons";
import { useAuth } from "./AuthProvider";
import { z } from "zod";
import { api, errorMessage, messageSchema } from "../../lib/api";

const accountSchema = z.object({
  id: z.number(),
  username: z.string(),
  full_name: z.string().nullable(),
  role: z.enum(["admin", "user"]),
  enabled: z.boolean(),
  root: z.string().nullable(),
  permissions: z.array(z.string()),
  must_change_password: z.boolean(),
});
type Account = z.infer<typeof accountSchema>;
const options = [
  { label: "瀏覽", value: "browse" },
  { label: "讀取內容／下載", value: "read" },
  { label: "上傳／建目錄", value: "upload" },
  { label: "修改／搬移", value: "modify" },
  { label: "移至垃圾桶", value: "delete" },
  { label: "分享", value: "share" },
];

export default function AccountsPage({
  onFormState,
}: {
  onFormState: (state: { dirty: boolean; busy: boolean }) => void;
}) {
  const [items, setItems] = useState<Account[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [roleFilter, setRoleFilter] = useState<string>();
  const [statusFilter, setStatusFilter] = useState<string>();
  const [searchInput, setSearchInput] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { user } = useAuth();
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  const [reset, setReset] = useState<Account | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [dirty, setDirty] = useState(false);
  const initialValues = useRef("");
  const screens = Grid.useBreakpoint();
  const hasChanges = dirty || (!!reset && !!password);
  const guard = useUnsavedChanges(hasChanges, busy);
  useEffect(() => {
    onFormState({ dirty: hasChanges, busy });
    return () => onFormState({ dirty: false, busy: false });
  }, [hasChanges, busy, onFormState]);
  const [form] = Form.useForm();
  const { message, modal } = App.useApp();
  const currentRole = Form.useWatch("role", form);
  const accountEnabled = Form.useWatch("enabled", form);
  const clearFilters = () => {
    setSearch("");
    setSearchInput("");
    setRoleFilter(undefined);
    setStatusFilter(undefined);
    setOffset(0);
  };
  const filtered = !!(search || roleFilter || statusFilter);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    api(
      `/admin/accounts?paged=true&offset=${offset}&q=${encodeURIComponent(search)}${roleFilter ? `&role=${roleFilter}` : ""}${statusFilter ? `&enabled=${statusFilter}` : ""}`,
      z.object({ items: z.array(accountSchema), total: z.number() }),
      {
        signal: controller.signal,
      },
    )
      .then((value) => {
        if (!controller.signal.aborted) {
          setItems(value.items);
          setTotal(value.total);
          if (offset && offset >= value.total)
            setOffset(Math.max(0, Math.floor((value.total - 1) / 25) * 25));
          setError("");
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [offset, revision, search, roleFilter, statusFilter]);
  function closeEditor() {
    if (busy) return;
    const close = () => {
      setEditing(null);
      setDirty(false);
      form.resetFields();
    };
    if (dirty)
      modal.confirm({
        title: "放棄尚未儲存的變更？",
        content: "離開後，這次輸入的內容不會保留。",
        okText: "放棄變更",
        cancelText: "繼續編輯",
        okButtonProps: { danger: true },
        onOk: close,
      });
    else close();
  }
  function edit(account: Account | "new") {
    setError("");
    setEditing(account);
    form.resetFields();
    form.setFieldsValue(
      account === "new"
        ? { role: "user", enabled: false, permissions: [] }
        : account,
    );
    initialValues.current = JSON.stringify(form.getFieldsValue(true));
    setDirty(false);
  }
  async function save(values: Record<string, unknown>) {
    values = { ...form.getFieldsValue(true), ...values };
    setBusy(true);
    try {
      await api(
        editing === "new"
          ? "/admin/accounts"
          : `/admin/accounts/${(editing as Account).id}`,
        accountSchema,
        {
          method: editing === "new" ? "POST" : "PUT",
          body: JSON.stringify({ ...values, root: values.root ?? null }),
        },
      );
      setEditing(null);
      setDirty(false);
      form.resetFields();
      setRevision((v) => v + 1);
      message.success("帳號設定已儲存，既有登入已撤銷。");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="management-page accounts-page" aria-label="帳號管理">
      <header className="management-heading">
        <div>
          <Typography.Title level={1}>帳號管理</Typography.Title>
          <p className="muted">管理使用者的存取範圍與操作權限</p>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined aria-hidden />}
          aria-label="新增帳號"
          onClick={() => edit("new")}
        >
          新增帳號
        </Button>
      </header>
      {error && (
        <Alert
          type="error"
          title={error}
          action={
            <Button onClick={() => setRevision((v) => v + 1)}>重試</Button>
          }
        />
      )}
      <div className="accounts-toolbar">
        <Input.Search
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          aria-label="搜尋帳號"
          placeholder="搜尋帳號或顯示名稱"
          allowClear
          maxLength={100}
          className="account-search"
          onSearch={(value) => {
            setSearch(value.trim());
            setOffset(0);
          }}
        />
        {!screens.md && (
          <Button
            icon={<FilterOutlined />}
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            篩選
          </Button>
        )}
        {(screens.md || filtersOpen) && (
          <div className="account-filters">
            <Select
              aria-label="篩選角色"
              placeholder="全部角色"
              allowClear
              value={roleFilter}
              onChange={(value) => {
                setRoleFilter(value);
                setOffset(0);
              }}
              options={[
                { value: "admin", label: "管理員" },
                { value: "user", label: "一般使用者" },
              ]}
            />
            <Select
              aria-label="篩選狀態"
              placeholder="全部狀態"
              allowClear
              value={statusFilter}
              onChange={(value) => {
                setStatusFilter(value);
                setOffset(0);
              }}
              options={[
                { value: "true", label: "啟用" },
                { value: "false", label: "停用" },
              ]}
            />
          </div>
        )}
        {filtered && (
          <Button type="text" onClick={clearFilters}>
            清除篩選
          </Button>
        )}
      </div>
      <div className="accounts-table">
        <Table
          rowKey="id"
          size="middle"
          tableLayout="fixed"
          loading={loading}
          dataSource={items}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={filtered ? "找不到符合條件的帳號" : "尚無帳號"}
              >
                {filtered && <Button onClick={clearFilters}>清除篩選</Button>}
              </Empty>
            ),
          }}
          pagination={false}
          columns={[
            {
              title: "使用者",
              key: "user",
              render: (_, account: Account) => (
                <div className="account-identity">
                  <Avatar size={36}>
                    {(account.full_name || account.username)
                      .slice(0, 1)
                      .toUpperCase()}
                  </Avatar>
                  <div className="account-identity-copy">
                    <Button
                      type="text"
                      className="account-display-name"
                      title={account.full_name || account.username}
                      aria-label={`查看 ${account.username}`}
                      onClick={() => edit(account)}
                    >
                      {account.full_name || account.username}
                    </Button>
                    <span title={account.username}>
                      {account.username}
                      {account.username === user?.username ? " · 目前登入" : ""}
                    </span>
                    {!screens.md && (
                      <small>
                        {account.role === "admin" ? "管理員" : "一般使用者"}
                      </small>
                    )}
                  </div>
                </div>
              ),
            },
            {
              title: "角色",
              width: 120,
              responsive: ["md"],
              render: (_, a: Account) => (
                <Tag bordered={false}>
                  {a.role === "admin" ? "管理員" : "一般使用者"}
                </Tag>
              ),
            },
            {
              title: "狀態",

              width: 88,
              render: (_, a: Account) => (
                <Badge
                  status={a.enabled ? "success" : "default"}
                  text={a.enabled ? "啟用" : "停用"}
                />
              ),
            },
            {
              title: "存取範圍",
              responsive: ["lg"],
              ellipsis: true,
              render: (_, a: Account) =>
                a.role === "admin" || a.root === "" ? (
                  "所有檔案"
                ) : (
                  <Tooltip title={a.root}>
                    <span>{a.root ?? "尚未指定"}</span>
                  </Tooltip>
                ),
            },
            {
              title: "操作",
              width: screens.md ? 144 : 120,
              align: "right",
              render: (_, a: Account) => (
                <Space size={0}>
                  <Button
                    type="text"
                    size="small"
                    aria-label={`編輯 ${a.username}`}
                    onClick={() => edit(a)}
                  >
                    編輯
                  </Button>
                  <Dropdown
                    trigger={["click"]}
                    menu={{
                      items: [
                        { key: "password", label: "重設密碼" },
                        { key: "sessions", label: "撤銷登入" },
                      ],
                      onClick: ({ key }) => {
                        if (key === "password") {
                          setReset(a);
                          setPassword("");
                        } else
                          modal.confirm({
                            title: `撤銷 ${a.username} 所有登入？`,
                            onOk: async () => {
                              await api(
                                `/admin/accounts/${a.id}/revoke-sessions`,
                                messageSchema,
                                { method: "POST" },
                              );
                              message.success("已撤銷登入");
                            },
                          });
                      },
                    }}
                  >
                    <Button
                      type="text"
                      size="small"
                      aria-label={`更多帳號操作 ${a.username}`}
                    >
                      <MoreOutlined />
                    </Button>
                  </Dropdown>
                </Space>
              ),
            },
          ]}
        />
        <div className="accounts-pagination">
          <span>{loading ? "載入中…" : `共 ${total} 個帳號`}</span>
          {total > 25 && (
            <Pagination
              current={offset / 25 + 1}
              pageSize={25}
              total={total}
              showSizeChanger={false}
              disabled={loading}
              onChange={(page) => setOffset((page - 1) * 25)}
            />
          )}
        </div>
      </div>
      <ResizableDrawer
        title={editing === "new" ? "新增帳號" : "編輯帳號"}
        open={!!editing}
        onClose={closeEditor}

        closable={!busy}
        maskClosable={!busy}
        keyboard={!busy}
        footer={
          <div className="account-editor-footer">
            <span className="muted">
              {dirty ? "有尚未儲存的變更" : "尚未變更"}
            </span>
            <Space>
              <Button onClick={closeEditor} disabled={busy}>
                取消
              </Button>
              <Button
                type="primary"
                onClick={() => form.submit()}
                loading={busy}
                disabled={!dirty}
              >
                儲存設定
              </Button>
            </Space>
          </div>
        }
        destroyOnHidden
      >
        {error && <Alert type="error" title={error} />}
        <div className="account-editor">
          {editing && editing !== "new" && (
            <div className="account-editor-identity">
              <Avatar size={40}>
                {(editing.full_name || editing.username).slice(0, 1)}
              </Avatar>
              <div>
                <strong>{editing.full_name || editing.username}</strong>
                <p className="muted">
                  {editing.username}
                  {editing.username === user?.username ? " · 目前登入" : ""}
                </p>
              </div>
            </div>
          )}
          <Form
            form={form}
            layout="vertical"
            onFinish={save}
            disabled={busy}
            onValuesChange={() =>
              setDirty(
                JSON.stringify(form.getFieldsValue(true)) !==
                  initialValues.current,
              )
            }
          >
            <h3 className="account-section-title">基本資料</h3>
            <div className="account-form-grid">
              {editing === "new" && (
                <>
                  <Form.Item
                    name="username"
                    label="帳號"
                    rules={[{ required: true }]}
                  >
                    <Input maxLength={100} />
                  </Form.Item>
                  <Form.Item
                    name="password"
                    label="初始密碼"
                    rules={[{ required: true, min: 8, max: 128 }]}
                  >
                    <Input.Password autoComplete="new-password" />
                  </Form.Item>
                </>
              )}
              <Form.Item name="full_name" label="顯示名稱">
                <Input maxLength={100} />
              </Form.Item>
              <Form.Item name="role" label="角色">
                <Select
                  options={[
                    { value: "user", label: "一般使用者" },
                    { value: "admin", label: "管理員" },
                  ]}
                />
              </Form.Item>
            </div>
            <h3 className="account-section-title">帳號狀態</h3>
            <p className="muted">停用後將無法登入。</p>
            <Form.Item name="enabled" label="啟用帳號" valuePropName="checked">
              <Switch />
            </Form.Item>
            {currentRole === "admin" ? (
              <Alert
                type="info"
                showIcon
                title="管理員可管理所有檔案與帳號"
                description="管理員不受一般使用者的根目錄與操作權限限制。"
              />
            ) : (
              <>
                <h3 className="account-section-title">存取範圍</h3>
                <Form.Item
                  name="root"
                  label="指定根目錄"
                  dependencies={["enabled", "role"]}
                  rules={[
                    {
                      validator: (_, value) =>
                        currentRole === "user" &&
                        accountEnabled &&
                        value == null
                          ? Promise.reject(new Error("啟用前請先指定根目錄"))
                          : Promise.resolve(),
                    },
                  ]}
                >
                  <RootPicker disabled={busy} />
                </Form.Item>
                <h3 className="account-section-title">操作權限</h3>
                <Form.Item
                  name="permissions"
                  label="一般使用者權限"
                  dependencies={["enabled", "role"]}
                  rules={[
                    {
                      validator: (_, value: string[] = []) =>
                        accountEnabled && !value.includes("browse")
                          ? Promise.reject(new Error("啟用前請勾選瀏覽權限"))
                          : value.includes("share") && !value.includes("read")
                            ? Promise.reject(new Error("分享需要讀取內容權限"))
                            : Promise.resolve(),
                    },
                  ]}
                >
                  <Checkbox.Group
                    className="account-permissions"
                    options={options}
                  />
                </Form.Item>
                <p className="muted">
                  讀取包含預覽與下載；複製需要讀取及上傳；還原需要上傳；分享需要讀取及分享權限。
                </p>
              </>
            )}
          </Form>
        </div>
      </ResizableDrawer>
      <Modal
        title={`重設密碼：${reset?.username || ""}`}
        open={!!reset}
        confirmLoading={busy}
        closable={!busy}
        maskClosable={!busy}
        cancelButtonProps={{ disabled: busy }}
        onCancel={() => {
          if (busy) return;
          const close = () => {
            setReset(null);
            setPassword("");
          };
          if (password)
            modal.confirm({
              title: "放棄尚未儲存的變更？",
              okText: "放棄變更",
              cancelText: "繼續編輯",
              onOk: close,
            });
          else close();
        }}
        onOk={async () => {
          if (!reset) return;
          setBusy(true);
          try {
            await api(`/admin/accounts/${reset.id}/password`, messageSchema, {
              method: "POST",
              body: JSON.stringify({ password }),
            });
            setReset(null);
            setPassword("");
            message.success("已重設，下次登入須修改密碼");
          } catch (e) {
            message.error(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>密碼需 8–128 字元，所有既有登入將失效。</p>
        <Input.Password
          aria-label="重設後密碼"
          value={password}
          disabled={busy}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
      </Modal>
      {guard}
    </section>
  );
}

function RootPicker({
  value,
  onChange,
  disabled,
}: {
  value?: string | null;
  onChange?: (path: string) => void;
  disabled?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="root-picker" inert={disabled}>
      <Input
        aria-label="指定根目錄"
        readOnly
        value={value === "" ? "所有檔案" : value || ""}
        placeholder="尚未指定資料夾"
      />
      <Button
        disabled={disabled}
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        選擇資料夾
      </Button>
      {expanded && (
        <div className="destination-tree">
          <DirectoryTree
            path={value ?? undefined}
            onSelect={(path) => {
              onChange?.(path);
              setExpanded(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
