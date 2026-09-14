import { useState } from "react";
import { Alert, Form, Input, Modal, App } from "antd";
import { api, errorMessage, messageSchema } from "../../lib/api";
import { useAuth } from "./AuthProvider";

export function PasswordModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { clear } = useAuth();
  const { message } = App.useApp();
  async function submit(values: {
    current_password: string;
    new_password: string;
  }) {
    setBusy(true);
    setError(null);
    try {
      const result = await api("/auth/password", messageSchema, {
        method: "PUT",
        body: JSON.stringify(values),
      });
      message.success(result.message);
      form.resetFields();
      onClose();
      clear();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="修改密碼"
      open={open}
      onCancel={() => {
        if (!busy) {
          setError(null);
          form.resetFields();
          onClose();
        }
      }}
      onOk={() => form.submit()}
      confirmLoading={busy}
      okText="更新密碼"
      cancelText="取消"
      closable={!busy}
      maskClosable={!busy}
      cancelButtonProps={{ disabled: busy }}
    >
      <p className="muted">更新後，所有已登入的裝置都需要重新登入。</p>
      {error && <Alert type="error" title={error} showIcon />}
      <Form
        form={form}
        layout="vertical"
        onFinish={submit}
        requiredMark={false}
      >
        <Form.Item
          label="目前密碼"
          name="current_password"
          rules={[{ required: true, message: "請輸入目前密碼" }]}
        >
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <Form.Item
          label="新密碼"
          name="new_password"
          rules={[
            { required: true },
            { min: 8, max: 128, message: "請輸入 8 至 128 個字元" },
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          label="確認新密碼"
          name="confirm"
          dependencies={["new_password"]}
          rules={[
            { required: true, message: "請再次輸入新密碼" },
            ({ getFieldValue }) => ({
              validator(_, value) {
                return value === getFieldValue("new_password")
                  ? Promise.resolve()
                  : Promise.reject(new Error("兩次密碼不一致"));
              },
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
