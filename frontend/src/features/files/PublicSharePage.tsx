import { useEffect, useState } from "react";
import { Alert, Button, Form, Input, Spin, Typography } from "antd";
import { formatSize } from "../../lib/api";
import { downloadUrl } from "./download";

type Information = {
  needs_password: boolean;
  name?: string;
  size?: number;
  expires_at?: number;
  download_url?: string;
};
export default function PublicSharePage() {
  const [info, setInfo] = useState<Information | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const token = location.hash.slice(1);
  async function unlock(password?: string, signal?: AbortSignal) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/v1/public-shares/open", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "Files-App",
        },
        body: JSON.stringify({ token, password }),
        signal,
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error?.message || "無法開啟分享。");
      if (!signal?.aborted) setInfo(body);
    } catch (e) {
      if (!signal?.aborted)
        setError(e instanceof Error ? e.message : "無法開啟分享。");
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    void unlock(undefined, controller.signal);
    return () => controller.abort();
  }, [token]);
  return (
    <main style={{ maxWidth: 600, margin: "64px auto", padding: 24 }}>
      <Typography.Title>檔案分享</Typography.Title>
      {error && <Alert type="error" title={error} />}
      {busy && <Spin />}
      {info?.needs_password ? (
        <Form onFinish={(values) => unlock(values.password)} layout="vertical">
          <Form.Item
            label="分享密碼"
            name="password"
            rules={[{ required: true }]}
          >
            <Input.Password autoComplete="off" />
          </Form.Item>
          <Button htmlType="submit" type="primary" loading={busy}>
            開啟分享
          </Button>
        </Form>
      ) : info?.download_url ? (
        <>
          <Typography.Title level={2}>{info.name}</Typography.Title>
          <p>{formatSize(info.size ?? 0)}</p>
          <p>
            到期：
            {new Date((info.expires_at ?? 0) * 1000).toLocaleString("zh-TW")}
          </p>
          <Button
            type="primary"
            onClick={() =>
              downloadUrl(info.download_url!).catch((e) => setError(e.message))
            }
          >
            下載檔案
          </Button>
          <p>若停留超過五分鐘，請重新整理並驗證分享。</p>
        </>
      ) : (
        !busy && <Button onClick={() => unlock()}>重試</Button>
      )}
    </main>
  );
}
