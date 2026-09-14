import { useEffect, useRef, useState } from "react";
import type { InputRef } from "antd";
import { Alert, Form, Input, Modal } from "antd";
import { api, entrySchema, errorMessage, type FileEntry } from "../../lib/api";

export function RenameModal({
  entry,
  onClose,
  onComplete,
}: {
  entry: FileEntry | null;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [form] = Form.useForm();
  const input = useRef<InputRef>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (entry) {
      form.setFieldsValue({ name: entry.name });
      setError(null);
    }
  }, [entry, form]);
  async function submit(values: { name: string }) {
    if (!entry) return;
    setBusy(true);
    setError(null);
    try {
      await api("/files/rename", entrySchema, {
        method: "PATCH",
        body: JSON.stringify({ path: entry.path, name: values.name }),
      });
      onComplete();
      onClose();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="重新命名"
      open={!!entry}
      afterOpenChange={(open) => {
        const element = input.current?.input;
        if (!open || !entry || !element || element.value !== entry.name) return;
        element.focus();
        const dot = entry.name.lastIndexOf(".");
        element.setSelectionRange(
          0,
          entry.type === "file" && dot > 0 ? dot : entry.name.length,
        );
      }}
      onCancel={() => {
        if (!busy) onClose();
      }}
      onOk={() => form.submit()}
      confirmLoading={busy}
      cancelButtonProps={{ disabled: busy }}
      okText="儲存名稱"
      cancelText="取消"
      maskClosable={!busy}
      closable={!busy}
    >
      <p className="muted">同名項目不會被取代。</p>
      {error && <Alert type="error" title={error} showIcon />}
      <Form form={form} layout="vertical" onFinish={submit}>
        <Form.Item
          name="name"
          label="新名稱"
          rules={[{ required: true, message: "請輸入新名稱" }, { max: 255 }]}
        >
          <Input ref={input} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
