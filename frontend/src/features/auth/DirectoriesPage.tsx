import { useEffect, useRef, useState } from "react";
import {
  Alert,
  App,
  Button,
  Form,
  Input,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { z } from "zod";
import { api, errorMessage } from "../../lib/api";
import { formatDate } from "../../lib/date";
import {
  directoryRecordSchema,
  directoryStatusLabels,
  directoryStatusSchema,
  inventorySchema,
  type RegisteredDirectory,
} from "../../lib/directories";
import { ResizableDrawer } from "../../app/ResizableDrawer";
import { useUnsavedChanges } from "./useUnsavedChanges";
import DirectoryBrowser from "./DirectoryBrowser";

const impactSchema = z.object({
  revision: z.number(),
  accounts: z.array(z.object({ username: z.string(), enabled: z.boolean() })),
  legacy_accounts: z.array(
    z.object({ username: z.string(), enabled: z.boolean() }),
  ),
  active_jobs: z.number(),
  active_shares: z.number(),
});

type FormValues = { name: string; path: string };
export default function DirectoriesPage({
  onFormState,
}: {
  onFormState: (state: { dirty: boolean; busy: boolean }) => void;
}) {
  const [data, setData] = useState<z.infer<typeof inventorySchema>>();
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [editing, setEditing] = useState<RegisteredDirectory | "new" | null>(
    null,
  );
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<z.infer<typeof directoryStatusSchema>>();
  const [confirmation, setConfirmation] = useState<{
    row: RegisteredDirectory;
    impact: z.infer<typeof impactSchema>;
  }>();
  const [form] = Form.useForm<FormValues>();
  const initial = useRef("");
  const path = Form.useWatch("path", form);
  const checkRequest = useRef<AbortController | null>(null);
  const checkTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const [checkMessage, setCheckMessage] = useState("");
  const { message, modal } = App.useApp();
  const guard = useUnsavedChanges(dirty, busy);
  useEffect(() => {
    onFormState({ dirty, busy });
    return () => onFormState({ dirty: false, busy: false });
  }, [dirty, busy, onFormState]);
  useEffect(() => {
    checkRequest.current?.abort();
    clearTimeout(checkTimeout.current);
    setChecking(false);
    setCheck(undefined);
    setCheckMessage("");
    return () => {
      checkRequest.current?.abort();
      clearTimeout(checkTimeout.current);
    };
  }, [path, editing]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const timeout = setTimeout(() => {
      controller.abort();
      setLoading(false);
      setError("尚未取得結果；這不代表目錄離線。請稍後重新檢查。");
    }, 10000);
    api("/admin/directories", inventorySchema, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(errorMessage(reason));
      })
      .finally(() => {
        clearTimeout(timeout);
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [revision]);
  function edit(row: RegisteredDirectory | "new") {
    setEditing(row);
    setFormError("");
    setBrowsing(false);
    setCheck(undefined);
    form.resetFields();
    form.setFieldsValue(
      row === "new"
        ? { name: "", path: "" }
        : { name: row.name, path: row.path },
    );
    initial.current = JSON.stringify(form.getFieldsValue(true));
    setDirty(false);
  }
  function close() {
    if (busy) return;
    const discard = () => {
      setEditing(null);
      setDirty(false);
    };
    if (dirty)
      modal.confirm({
        title: "放棄尚未儲存的變更？",
        okText: "放棄變更",
        cancelText: "繼續編輯",
        onOk: discard,
      });
    else discard();
  }
  async function checkPath() {
    checkRequest.current?.abort();
    clearTimeout(checkTimeout.current);
    const controller = new AbortController();
    checkRequest.current = controller;
    setChecking(true);
    setFormError("");
    setCheck(undefined);
    setCheckMessage("");
    checkTimeout.current = setTimeout(() => {
      controller.abort();
      setChecking(false);
      setCheckMessage("尚未取得結果；這不代表目錄離線。請稍後重新檢查。");
    }, 10000);
    try {
      const result = await api(
        `/admin/directory-status?path=${encodeURIComponent(path || "")}`,
        directoryStatusSchema,
        { signal: controller.signal },
      );
      if (!controller.signal.aborted) setCheck(result);
    } catch (reason) {
      if (!controller.signal.aborted) setCheckMessage(errorMessage(reason));
    } finally {
      if (checkRequest.current === controller) {
        clearTimeout(checkTimeout.current);
        if (!controller.signal.aborted) setChecking(false);
      }
    }
  }
  async function save(values: FormValues) {
    if (!editing || busy) return;
    setBusy(true);
    setFormError("");
    try {
      await api(
        editing === "new"
          ? "/admin/directories"
          : `/admin/directories/${editing.id}`,
        directoryRecordSchema,
        {
          method: editing === "new" ? "POST" : "PATCH",
          body: JSON.stringify(
            editing === "new"
              ? values
              : { name: values.name, revision: editing.revision },
          ),
        },
      );
      message.success(
        editing === "new"
          ? "目錄已登錄，請至帳號管理設定授權。"
          : "目錄名稱已更新。",
      );
      setEditing(null);
      setDirty(false);
      setRevision((n) => n + 1);
    } catch (reason) {
      setFormError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  async function prepareToggle(row: RegisteredDirectory) {
    setBusy(true);
    setError("");
    try {
      const impact = await api(
        `/admin/directories/${row.id}/impact`,
        impactSchema,
      );
      if (impact.revision !== row.revision)
        throw new Error("目錄設定已變更，請重新檢查後再操作。");
      setConfirmation({ row, impact });
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  async function toggle() {
    if (!confirmation || busy) return;
    setBusy(true);
    setError("");
    const { row } = confirmation;
    try {
      await api(`/admin/directories/${row.id}`, directoryRecordSchema, {
        method: "PATCH",
        body: JSON.stringify({ revision: row.revision, enabled: !row.enabled }),
      });
      message.success(
        row.enabled
          ? "共享入口已停用，相關登入與舊任務／分享已失效。"
          : "共享入口已啟用，保留的帳號授權已恢復。",
      );
      setConfirmation(undefined);
      setRevision((n) => n + 1);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="management-page" aria-label="目錄管理">
      <header className="management-heading">
        <div>
          <Typography.Title level={1}>目錄管理</Typography.Title>
          <p className="muted">
            登錄共享資料夾，再至帳號管理設定各自的存取權限。
          </p>
        </div>
        <Space wrap>
          <Button
            icon={<ReloadOutlined aria-hidden />}
            loading={loading}
            disabled={busy}
            onClick={() => setRevision((n) => n + 1)}
          >
            {loading ? "檢查中…" : "重新檢查"}
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined aria-hidden />}
            disabled={busy}
            onClick={() => edit("new")}
          >
            新增目錄
          </Button>
        </Space>
      </header>
      {error && (
        <Alert
          type="warning"
          showIcon
          title={error}
          action={
            <Button
              onClick={() => setRevision((n) => n + 1)}
              disabled={loading || busy}
            >
              重試檢查
            </Button>
          }
        />
      )}
      {data && (loading || error) && (
        <p role="status">以下為上次檢查結果，尚未更新。</p>
      )}
      {data && (
        <p className="muted" style={{ overflowWrap: "anywhere" }}>
          檔案根目錄：{data.root}（
          {directoryStatusLabels[data.root_status.status]}） · 檢查時間：
          {formatDate(data.checked_at)}
        </p>
      )}
      <Table<RegisteredDirectory>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={data?.items ?? []}
        pagination={false}
        scroll={{ x: 1100 }}
        locale={{
          emptyText: loading
            ? "檢查中…"
            : error
              ? "尚未取得目錄清單，請重新檢查。"
              : "尚未登錄目錄，請新增要提供給帳號的資料夾。",
        }}
        columns={[
          { title: "名稱", dataIndex: "name", width: 140, ellipsis: true },
          { title: "相對目錄", dataIndex: "path", width: 180, ellipsis: true },
          {
            title: "啟用狀態",
            width: 100,
            render: (_, row) => <Tag>{row.enabled ? "已啟用" : "已停用"}</Tag>,
          },
          {
            title: "讀取狀態",
            dataIndex: "status",
            width: 120,
            render: (status: keyof typeof directoryStatusLabels) => (
              <Tag color={status === "readable" ? "default" : "error"}>
                {directoryStatusLabels[status]}
              </Tag>
            ),
          },
          {
            title: "寫入權限檢查",
            width: 140,
            render: (_, row) =>
              row.status !== "readable"
                ? "無法判斷"
                : row.writable
                  ? "允許（未實測）"
                  : "未允許",
          },
          {
            title: "垃圾桶",
            width: 180,
            render: (_, row) =>
              row.cross_device === null
                ? "無法判斷"
                : row.cross_device
                  ? "跨檔案系統，不支援"
                  : "同檔案系統，仍需驗證",
          },
          {
            title: "授權帳號",
            dataIndex: "account_count",
            width: 90,
            align: "right",
          },
          {
            title: "操作",
            width: 150,
            render: (_, row) => (
              <Space>
                <Button
                  size="small"
                  disabled={busy}
                  aria-label={`編輯 ${row.name}`}
                  onClick={() => edit(row)}
                >
                  編輯
                </Button>
                <Button
                  size="small"
                  disabled={busy}
                  aria-label={`${row.enabled ? "停用" : "啟用"} ${row.name}`}
                  onClick={() => void prepareToggle(row)}
                >
                  {row.enabled ? "停用" : "啟用"}
                </Button>
              </Space>
            ),
          },
        ]}
      />
      <p className="muted">
        登錄與停用不會建立或刪除實體檔案。寫入檢查未建立測試檔，實際操作仍受
        Linux 權限、唯讀掛載與空間限制。
      </p>
      <p className="muted">
        同一掛載內的新資料夾可直接登錄；新增其他主機來源仍需部署者設定 Docker
        掛載。
      </p>
      <ResizableDrawer
        title={editing === "new" ? "新增目錄" : "編輯目錄"}
        open={editing !== null}
        onClose={close}
        destroyOnHidden
        maskClosable={!busy}
        keyboard={!busy}
        extra={
          <Space>
            <Button disabled={busy} onClick={close}>
              取消
            </Button>
            <Button
              type="primary"
              loading={busy}
              disabled={!dirty}
              onClick={() => form.submit()}
            >
              儲存目錄
            </Button>
          </Space>
        }
      >
        {formError && <Alert type="error" showIcon title={formError} />}
        <Form
          form={form}
          layout="vertical"
          disabled={busy}
          onFinish={save}
          onValuesChange={() =>
            setDirty(
              JSON.stringify(form.getFieldsValue(true)) !== initial.current,
            )
          }
        >
          <Form.Item
            name="name"
            label="顯示名稱"
            rules={[{ required: true, whitespace: true, max: 100 }]}
          >
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item
            name="path"
            label="相對目錄"
            rules={[{ required: true, whitespace: true, max: 4096 }]}
            extra={
              editing === "new"
                ? "例如 nfs/reports；只能登錄現有資料夾，不能與其他入口重疊。"
                : "位置固定；更換位置須新增另一筆目錄並重新授權。"
            }
          >
            <Input readOnly={editing !== "new"} maxLength={4096} />
          </Form.Item>
          <Space wrap>
            {editing === "new" && (
              <Button onClick={() => setBrowsing((v) => !v)}>選擇資料夾</Button>
            )}
            <Button
              loading={checking}
              disabled={!path}
              onClick={() => void checkPath()}
            >
              {checking ? "檢查中…" : checkMessage ? "重新檢查" : "檢查目錄"}
            </Button>
          </Space>
          {checkMessage && (
            <Alert type="warning" showIcon title={checkMessage} />
          )}
          {check && <p role="status">{directoryStatusLabels[check.status]}</p>}
          {browsing && !busy && (
            <DirectoryBrowser
              onSelect={(selected) => {
                form.setFieldValue("path", selected);
                setDirty(true);
                setBrowsing(false);
              }}
            />
          )}
          <p className="muted">
            授權會涵蓋此資料夾下所有子資料夾；新增入口不會自動授權給任何帳號。
          </p>
        </Form>
      </ResizableDrawer>
      <Modal
        title={
          confirmation?.row.enabled ? "停用共享入口？" : "重新啟用共享入口？"
        }
        open={!!confirmation}
        confirmLoading={busy}
        okText={confirmation?.row.enabled ? "確認停用" : "確認啟用"}
        cancelText="取消"
        onOk={() => void toggle()}
        onCancel={() => {
          if (!busy) setConfirmation(undefined);
        }}
        cancelButtonProps={{ disabled: busy }}
        closable={!busy}
        maskClosable={!busy}
      >
        {confirmation && (
          <>
            {error && <Alert type="error" title={error} />}
            <p>
              {confirmation.row.name}（{confirmation.row.path}）
            </p>
            <p>
              {confirmation.row.enabled
                ? "下列帳號透過此入口的存取將停止。"
                : "下列帳號保留的目錄授權將恢復；舊分享與任務不會復活。"}
            </p>
            <p>
              直接授權：
              {confirmation.impact.accounts
                .map((a) => a.username + (a.enabled ? "" : "（帳號已停用）"))
                .join("、") || "無"}
            </p>
            <p>
              這些帳號的 {confirmation.impact.active_jobs} 個執行中／排隊任務及{" "}
              {confirmation.impact.active_shares}{" "}
              個有效分享將失效，包含其他目錄的工作。
            </p>
            <Alert
              type="info"
              title="其他存取範圍仍保留"
              description={`管理員仍可存取。範圍重疊的舊式單目錄帳號：${confirmation.impact.legacy_accounts.map((a) => a.username + (a.enabled ? "" : "（帳號已停用）")).join("、") || "無"}。`}
            />
          </>
        )}
      </Modal>
      {guard}
    </section>
  );
}
