import { PanelSurface } from "../../app/PanelSurface";
import { formatDate } from "../../lib/date";
import { useEffect, useState } from "react";
import { Alert, Button, Form, Input, Modal, Select, Space, Table } from "antd";
import { z } from "zod";
import {
  api,
  errorMessage,
  messageSchema,
  type FileEntry,
} from "../../lib/api";

const shareSchema = z.object({
  id: z.string(),
  owner_id: z.number(),
  path: z.string(),
  protected: z.boolean(),
  created_at: z.number(),
  expires_at: z.number(),
  revoked: z.boolean(),
});
type Share = z.infer<typeof shareSchema>;

export function SharePanel({
  entry,
  onClose,
  open,
  onCloseList,
  mode = "drawer",
}: {
  entry: FileEntry | null;
  onClose: () => void;
  open: boolean;
  onCloseList: () => void;
  mode?: "drawer" | "page";
}) {
  const [items, setItems] = useState<Share[]>([]);
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  useEffect(() => {
    setUrl("");
    setError("");
    form.resetFields();
  }, [entry, form]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api(`/shares?offset=${offset}`, z.array(shareSchema), {
      signal: controller.signal,
    })
      .then((value) => {
        if (!controller.signal.aborted) setItems(value);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open, offset, revision]);
  return (
    <>
      <Modal
        title={`分享 ${entry?.name || ""}`}
        open={!!entry}
        onCancel={() => !busy && onClose()}
        footer={
          url ? (
            <Button aria-label="完成" onClick={onClose}>
              完成
            </Button>
          ) : undefined
        }
        onOk={() => form.submit()}
        confirmLoading={busy}
        destroyOnHidden
      >
        {error && <Alert type="error" title={error} />}
        {url ? (
          <>
            <p>連結只顯示這一次，請複製保存。檔案變更或權限調整後可能失效。</p>
            <Input.TextArea aria-label="分享連結" readOnly value={url} />
            <Button
              onClick={() =>
                navigator.clipboard
                  .writeText(url)
                  .catch(() => setError("請選取上方連結並手動複製。"))
              }
            >
              複製連結
            </Button>
            {location.hostname === "127.0.0.1" && (
              <p>目前網址只供本機使用，其他電腦無法開啟。</p>
            )}
          </>
        ) : (
          <Form
            form={form}
            layout="vertical"
            initialValues={{ hours: 24 }}
            onFinish={async (values) => {
              if (!entry) return;
              setBusy(true);
              setError("");
              try {
                const result = await api(
                  "/shares",
                  shareSchema.extend({ token: z.string() }),
                  {
                    method: "POST",
                    body: JSON.stringify({
                      path: entry.path,
                      hours: values.hours,
                      password: values.password || null,
                    }),
                  },
                );
                setUrl(`${location.origin}/share#${result.token}`);
                setRevision((v) => v + 1);
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Form.Item name="hours" label="有效期限">
              <Select
                options={[
                  { value: 1, label: "1 小時" },
                  { value: 24, label: "1 天" },
                  { value: 168, label: "7 天" },
                ]}
              />
            </Form.Item>
            <Form.Item
              name="password"
              label="分享密碼（選填）"
              rules={[{ min: 8, max: 128 }]}
            >
              <Input.Password autoComplete="new-password" />
            </Form.Item>
            <p>
              收件者可下載這份檔案；重新命名、搬移、替換或刪除後需重新建立分享。
            </p>
          </Form>
        )}
      </Modal>
      <PanelSurface
        title="分享管理"
        open={open}
        onClose={onCloseList}
        mode={mode}
      >
        <p>顯示自己的分享；管理員可查看全部分享。撤銷後不能發起新的下載。</p>
        {error && (
          <Alert
            type="error"
            title={error}
            action={
              <Button onClick={() => setRevision((v) => v + 1)}>重試</Button>
            }
          />
        )}
        <Table
          rowKey="id"
          size="middle"
          loading={loading}
          pagination={false}
          dataSource={items}
          columns={[
            { title: "檔案", dataIndex: "path" },
            {
              title: "期限",
              render: (_, s: Share) => formatDate(s.expires_at),
            },
            {
              title: "狀態",
              render: (_, s: Share) =>
                s.revoked
                  ? "已撤銷"
                  : s.expires_at * 1000 < Date.now()
                    ? "已到期"
                    : s.protected
                      ? "需密碼"
                      : "可使用",
            },
            {
              title: "操作",
              render: (_, s: Share) => (
                <Button
                  danger
                  disabled={s.revoked}
                  onClick={async () => {
                    try {
                      await api(`/shares/${s.id}/revoke`, messageSchema, {
                        method: "POST",
                      });
                      setRevision((v) => v + 1);
                    } catch (e) {
                      setError(errorMessage(e));
                    }
                  }}
                >
                  撤銷分享
                </Button>
              ),
            },
          ]}
          scroll={{ x: 600 }}
        />
        <Space>
          <Button
            disabled={!offset}
            onClick={() => setOffset((v) => Math.max(0, v - 100))}
          >
            上一頁
          </Button>
          <Button
            disabled={items.length < 100}
            onClick={() => setOffset((v) => v + 100)}
          >
            下一頁
          </Button>
        </Space>
      </PanelSurface>
    </>
  );
}
