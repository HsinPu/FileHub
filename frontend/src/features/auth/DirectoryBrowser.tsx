import { useEffect, useState } from "react";
import { Alert, Button, Empty, List, Space, Spin } from "antd";
import { FolderOutlined } from "@ant-design/icons";
import { z } from "zod";
import { api, errorMessage } from "../../lib/api";

const browserSchema = z.object({
  path: z.string(),
  items: z.array(z.object({ name: z.string(), path: z.string() })),
  truncated: z.boolean(),
});

export default function DirectoryBrowser({
  onSelect,
}: {
  onSelect: (path: string) => void;
}) {
  const [path, setPath] = useState("");
  const [data, setData] = useState<z.infer<typeof browserSchema>>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setData(undefined);
    api(
      `/admin/directory-browser?path=${encodeURIComponent(path)}`,
      browserSchema,
      { signal: controller.signal },
    )
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(errorMessage(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, revision]);
  return (
    <section aria-label="選擇登錄資料夾">
      <Space wrap>
        <Button
          disabled={!path || loading}
          onClick={() => setPath(path.split("/").slice(0, -1).join("/"))}
        >
          上一層
        </Button>
        <Button
          disabled={!path || loading || !!error}
          onClick={() => onSelect(path)}
        >
          使用此資料夾
        </Button>
      </Space>
      <p className="muted" style={{ overflowWrap: "anywhere" }}>
        目前位置：{path || "/（根目錄）"}
      </p>
      {error && (
        <Alert
          type="error"
          title={error}
          action={
            <Button onClick={() => setRevision((n) => n + 1)}>重試</Button>
          }
        />
      )}
      {loading ? (
        <Spin />
      ) : (
        data && (
          <>
            {data.truncated && (
              <Alert
                type="info"
                title="僅顯示目前目錄前 200 個項目中的資料夾"
                description="若找不到目標，可在上方直接輸入相對目錄再檢查。"
              />
            )}
            <List
              size="small"
              dataSource={data.items}
              locale={{
                emptyText: (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="沒有可選子資料夾"
                  />
                ),
              }}
              renderItem={(item) => (
                <List.Item>
                  <Button
                    type="text"
                    icon={<FolderOutlined aria-hidden />}
                    onClick={() => setPath(item.path)}
                    style={{
                      maxWidth: "100%",
                      height: "auto",
                      whiteSpace: "normal",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {item.name}
                  </Button>
                </List.Item>
              )}
            />
          </>
        )
      )}
    </section>
  );
}
