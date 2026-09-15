import { useEffect, useState } from "react";
import { Alert, Button, Table, Tag, Typography } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { z } from "zod";
import { api, errorMessage } from "../../lib/api";
import { formatDate } from "../../lib/date";

export const directoryStatusSchema = z.object({
  path: z.string(),
  status: z.enum(["readable", "missing", "not_directory", "unavailable"]),
  writable: z.boolean(),
  cross_device: z.boolean().nullable(),
});
export const directoryStatusLabels = {
  readable: "可讀取",
  missing: "目錄不存在",
  not_directory: "不是資料夾",
  unavailable: "無法存取",
};
const inventorySchema = z.object({
  root: z.string(),
  checked_at: z.string(),
  items: z.array(
    directoryStatusSchema.extend({ id: z.string(), name: z.string() }),
  ),
});

export default function DirectoriesPage() {
  const [data, setData] = useState<z.infer<typeof inventorySchema>>();
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api("/admin/directories", inventorySchema, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) {
          setData(undefined);
          setError(errorMessage(reason));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision]);
  return (
    <section className="management-page" aria-label="目錄管理">
      <header className="management-heading">
        <div>
          <Typography.Title level={1}>目錄管理</Typography.Title>
          <p className="muted">
            查看部署目錄的可用狀態；使用者存取範圍請至帳號管理設定。
          </p>
        </div>
        <Button
          icon={<ReloadOutlined />}
          loading={loading}
          onClick={() => setRevision((value) => value + 1)}
        >
          重新檢查
        </Button>
      </header>
      {error && (
        <Alert
          type="error"
          showIcon
          title="無法載入目錄狀態"
          description={error}
        />
      )}
      {data && (
        <p className="muted">
          檔案根目錄：{data.root} · 檢查時間：{formatDate(data.checked_at)}
        </p>
      )}
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={data?.items ?? []}
        pagination={false}
        scroll={{ x: 700 }}
        columns={[
          { title: "名稱", dataIndex: "name", width: 140, ellipsis: true },
          {
            title: "相對目錄",
            dataIndex: "path",
            width: 180,
            ellipsis: true,
            render: (path: string) => path || "/（根目錄）",
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
            key: "write",
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
            key: "trash",
            width: 200,
            render: (_, row) =>
              row.cross_device === null
                ? "無法判斷"
                : row.cross_device
                  ? "跨檔案系統，不支援"
                  : "同檔案系統，仍需驗證",
          },
        ]}
      />
      <p className="muted">
        檢查不會建立或修改檔案。寫入仍可能受唯讀掛載、ACL 或磁碟空間限制。
      </p>
      <p className="muted">
        清單包含根目錄及部署者宣告的目錄，不會自動授予帳號權限。新增掛載需由部署者調整設定。
      </p>
    </section>
  );
}
