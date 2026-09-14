import { useState } from "react";
import { Alert, Button, Form, Input, Typography } from "antd";
import {
  FolderOpenOutlined,
  LockOutlined,
  ArrowRightOutlined,
} from "@ant-design/icons";
import { useAuth } from "./AuthProvider";
import { errorMessage } from "../../lib/api";

export function LoginPage() {
  const { login } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(values: { username: string; password: string }) {
    setBusy(true);
    setError(null);
    try {
      await login(values.username, values.password);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="brand">
          <span className="brand-icon">
            <FolderOpenOutlined />
          </span>
          <strong>Files</strong>
          <span className="brand-caption">你的檔案工作空間</span>
        </div>
        <div className="login-intro">
          <span className="eyebrow">簡單整理，專注工作</span>
          <h1>
            讓每一份檔案，
            <br />
            都有清楚的位置。
          </h1>
          <p>
            瀏覽資料夾、快速查看內容，
            <br />
            讓日常檔案管理回到簡單。
          </p>
          <div className="folder-art" aria-hidden="true">
            <FolderOpenOutlined />
            <span>整理好，再出發。</span>
          </div>
        </div>
        <span className="login-footnote">一個空間，收好你的每一天。</span>
      </section>
      <section className="login-form-panel">
        <div className="login-form-inner">
          <span className="section-kicker">
            <LockOutlined /> 安全登入
          </span>
          <Typography.Title level={2}>歡迎回來</Typography.Title>
          <Typography.Paragraph type="secondary">
            登入帳號，繼續管理你的檔案。
          </Typography.Paragraph>
          {error && (
            <Alert type="error" showIcon title={error} className="form-alert" />
          )}
          <Form
            layout="vertical"
            onFinish={submit}
            requiredMark={false}
            size="large"
          >
            <Form.Item
              label="帳號"
              name="username"
              rules={[{ required: true, message: "請輸入帳號" }]}
            >
              <Input
                autoComplete="username"
                autoFocus
                maxLength={100}
                placeholder="輸入你的帳號"
              />
            </Form.Item>
            <Form.Item
              label="密碼"
              name="password"
              rules={[{ required: true, message: "請輸入密碼" }]}
            >
              <Input.Password
                autoComplete="current-password"
                maxLength={1024}
                placeholder="輸入密碼"
              />
            </Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={busy}
              block
              icon={<ArrowRightOutlined />}
              iconPlacement="end"
            >
              登入工作空間
            </Button>
          </Form>
          <p className="login-note">
            帳號由管理員建立。如需存取權限，請聯絡管理員。
          </p>
        </div>
      </section>
    </main>
  );
}
