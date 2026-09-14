import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Alert, App, Button, Avatar, Tag, Form, Input, Typography } from "antd";
import { api, errorMessage, messageSchema } from "../../lib/api";
import { useAuth } from "./AuthProvider";
import { useUnsavedChanges } from "./useUnsavedChanges";

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="personal-setting-section">
      <div className="personal-setting-label">
        <h2>{title}</h2>
        <p className="muted">{description}</p>
      </div>
      <div className="personal-setting-content">{children}</div>
    </section>
  );
}

export function ProfileSettings() {
  const { user } = useAuth();
  return (
    <section
      className="management-page personal-settings"
      aria-label="帳號資料"
    >
      <header className="personal-settings-heading">
        <Typography.Title level={1}>帳號資料</Typography.Title>
        <p className="muted">查看你的個人資料與帳號身分</p>
      </header>
      <div className="personal-settings-surface">
        <div className="personal-profile-summary">
          <Avatar size={48}>
            {(user?.full_name || user?.username || "?").slice(0, 1)}
          </Avatar>
          <div>
            <h2>{user?.full_name || user?.username}</h2>
            <p>{user?.username}</p>
          </div>
          <Tag bordered={false}>
            {user?.role === "admin" ? "管理員" : "一般使用者"}
          </Tag>
        </div>
        <SettingsSection
          title="基本資料"
          description="你的登入識別與顯示名稱。"
        >
          <dl className="personal-profile-fields">
            <div>
              <dt>登入帳號</dt>
              <dd>{user?.username}</dd>
            </div>
            <div>
              <dt>顯示名稱</dt>
              <dd>{user?.full_name || "尚未設定"}</dd>
            </div>
          </dl>
        </SettingsSection>
        <SettingsSection
          title="資料管理"
          description="帳號資料與權限由管理員維護。"
        >
          {user?.role === "admin" ? (
            <>
              <p>如需修改資料，請前往帳號管理。</p>
              <Link className="personal-settings-link" to="/settings/accounts">
                前往帳號管理 →
              </Link>
            </>
          ) : (
            <p>如需修改資料，請聯絡管理員。</p>
          )}
        </SettingsSection>
      </div>
    </section>
  );
}
export function SecuritySettings({
  onFormState,
}: {
  onFormState: (state: { dirty: boolean; busy: boolean }) => void;
}) {
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const fields = Form.useWatch([], form);
  const complete = !!(
    fields?.current_password &&
    fields?.new_password &&
    fields?.confirm
  );
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const { clear } = useAuth();
  const { message } = App.useApp();
  const guard = useUnsavedChanges(dirty, busy);
  useEffect(() => {
    onFormState({ dirty, busy });
    return () => onFormState({ dirty: false, busy: false });
  }, [dirty, busy, onFormState]);
  return (
    <section
      className="management-page personal-settings"
      aria-label="密碼與登入"
    >
      <header className="personal-settings-heading">
        <Typography.Title level={1}>密碼與登入</Typography.Title>
      </header>
      <p className="muted">管理你的登入密碼</p>
      <div className="personal-settings-surface">
        <SettingsSection
          title="更新密碼"
          description="使用目前密碼確認身分，再設定新密碼。"
        >
          {error && <Alert type="error" title={error} showIcon />}
          <Form
            className="personal-password-form"
            form={form}
            layout="vertical"
            requiredMark={false}
            disabled={busy}
            onValuesChange={(_, values) =>
              setDirty(Object.values(values).some(Boolean))
            }
            onFinish={async (values: {
              current_password: string;
              new_password: string;
            }) => {
              setBusy(true);
              setError("");
              try {
                const result = await api("/auth/password", messageSchema, {
                  method: "PUT",
                  body: JSON.stringify({
                    current_password: values.current_password,
                    new_password: values.new_password,
                  }),
                });
                setDirty(false);
                form.resetFields();
                message.success(result.message);
                clear();
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Form.Item
              label="目前密碼"
              name="current_password"
              rules={[{ required: true, message: "請輸入目前密碼" }]}
            >
              <Input.Password autoComplete="current-password" />
            </Form.Item>
            <Form.Item
              extra="請使用 8 至 128 個字元。"
              label="新密碼"
              name="new_password"
              rules={[
                { required: true, message: "請輸入新密碼" },
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
            <p className="personal-login-notice">
              更新密碼後，所有裝置（包含目前裝置）都需要重新登入。
            </p>
            <div className="personal-password-actions">
              <Button
                disabled={!dirty || busy}
                onClick={() => {
                  form.resetFields();
                  setDirty(false);
                  setError("");
                }}
              >
                清除輸入
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={busy}
                disabled={!complete || busy}
              >
                更新密碼
              </Button>
            </div>
          </Form>
        </SettingsSection>
        <SettingsSection title="登入說明" description="密碼更新後的登入方式。">
          <p>更新完成後會返回登入頁，請使用新密碼重新登入。</p>
        </SettingsSection>
      </div>
      {guard}
    </section>
  );
}
