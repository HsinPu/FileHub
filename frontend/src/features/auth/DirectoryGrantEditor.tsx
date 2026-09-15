import { useEffect, useState } from "react";
import { Alert, Button, Select } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import { z } from "zod";
import { api, errorMessage } from "../../lib/api";
import PermissionPicker from "./PermissionPicker";

type Grant = { directory_id: string; permissions: string[] };
const catalogSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      path: z.string(),
      status: z.string(),
    }),
  ),
});
export default function DirectoryGrantEditor({
  value = [],
  onChange,
}: {
  value?: Grant[];
  onChange?: (value: Grant[]) => void;
}) {
  const [catalog, setCatalog] = useState<
    z.infer<typeof catalogSchema>["items"]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api("/admin/directories", catalogSchema, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted)
          setCatalog(data.items.filter((item) => item.id !== "root"));
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(errorMessage(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision]);
  const change = (index: number, grant: Grant) =>
    onChange?.(
      value.map((item, position) => (position === index ? grant : item)),
    );
  return (
    <div className="directory-grants">
      {error && (
        <Alert
          type="error"
          title={error}
          action={
            <Button onClick={() => setRevision((n) => n + 1)}>重試</Button>
          }
        />
      )}
      {!loading && !error && !catalog.length && (
        <Alert
          type="info"
          title="尚未宣告共享目錄"
          description="請由部署者設定共享目錄，再於此處授權。"
        />
      )}
      {value.map((grant, index) => (
        <div
          className="directory-grant-row"
          key={index}
          data-testid={`directory-grant-${index}`}
        >
          <div className="directory-grant-heading">
            <Select
              aria-label={`授權目錄 ${index + 1}`}
              placeholder="選擇共享目錄"
              loading={loading}
              value={grant.directory_id || undefined}
              options={catalog.map((item) => ({
                value: item.id,
                label: `${item.name}（${item.path}）${item.status !== "readable" ? " · 無法使用" : ""}`,
                disabled:
                  item.status !== "readable" ||
                  value.some(
                    (other, otherIndex) =>
                      otherIndex !== index && other.directory_id === item.id,
                  ),
              }))}
              onChange={(directory_id) =>
                change(index, { ...grant, directory_id })
              }
            />
            <Button
              aria-label={`移除目錄授權 ${index + 1}`}
              icon={<DeleteOutlined />}
              onClick={() =>
                onChange?.(value.filter((_, position) => position !== index))
              }
            />
          </div>
          <PermissionPicker
            value={grant.permissions}
            onChange={(permissions) => change(index, { ...grant, permissions })}
          />
        </div>
      ))}
      <Button
        icon={<PlusOutlined />}
        disabled={loading || !!error || value.length >= catalog.length}
        onClick={() =>
          onChange?.([
            ...value,
            { directory_id: "", permissions: ["browse", "read"] },
          ])
        }
      >
        新增目錄授權
      </Button>
      <p className="muted">
        未授權的目錄不會顯示；每個目錄的操作權限獨立設定。
      </p>
    </div>
  );
}
