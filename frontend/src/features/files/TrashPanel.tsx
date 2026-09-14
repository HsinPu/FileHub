import { PanelSurface } from "../../app/PanelSurface";
import { formatDate } from "../../lib/date";
import { useEffect, useState } from "react";
import { Alert, Button, Empty, Space, Tag, Table } from "antd";
import { z } from "zod";
import { api, errorMessage } from "../../lib/api";

const trashSchema = z.array(
  z.object({
    id: z.string(),
    original_path: z.string(),
    kind: z.enum(["directory", "file"]),
    deleted_by: z.string(),
    deleted_at: z.number(),
    status: z.string(),
  }),
);
type TrashItem = z.infer<typeof trashSchema>[number];

export function TrashPanel({
  open,
  onClose,
  onRestore,
  revision,
  mode = "drawer",
  canRestore = true,
}: {
  open: boolean;
  onClose: () => void;
  onRestore: (items: TrashItem[]) => void;
  revision: number;
  mode?: "drawer" | "page";
  canRestore?: boolean;
}) {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setSelected([]);
    setError(null);
    api(`/trash?offset=${page * 50}`, trashSchema, {
      signal: controller.signal,
    })
      .then((value) => {
        if (!controller.signal.aborted) setItems(value);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(errorMessage(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open, page, revision, retry]);
  return (
    <PanelSurface title="資源回收筒" open={open} onClose={onClose} mode={mode}>
      <p>
        只顯示目前帳號可存取的回收項目。還原需要上傳權限，內容仍占用磁碟空間。
      </p>
      <Space wrap>
        <Button onClick={() => setRetry((v) => v + 1)} loading={loading}>
          重新整理垃圾桶
        </Button>
        <Button
          disabled={!canRestore || !selected.length || loading || !!error}
          onClick={() =>
            onRestore(
              items.filter(
                (item) =>
                  selected.includes(item.id) && item.status === "available",
              ),
            )
          }
        >
          還原選取項目
        </Button>
      </Space>
      {error && <Alert type="error" title={error} />}
      <Table<TrashItem>
        rowKey="id"
        size="middle"
        loading={loading}
        dataSource={items}
        pagination={false}
        rowSelection={{
          selectedRowKeys: selected,
          onChange: (keys) => setSelected(keys.map(String)),
          getCheckboxProps: (item) => ({
            disabled:
              !canRestore || item.status !== "available" || loading || !!error,
          }),
        }}
        columns={[
          {
            title: "名稱",
            key: "name",
            ellipsis: true,
            render: (_, item) => (
              <span title={item.original_path}>
                {item.original_path.split("/").at(-1)}
              </span>
            ),
          },
          {
            title: "原始位置",
            dataIndex: "original_path",
            ellipsis: true,
            responsive: ["md"],
          },
          {
            title: "刪除時間",
            key: "date",
            responsive: ["lg"],
            render: (_, item) => formatDate(item.deleted_at),
          },
          {
            title: "狀態",
            key: "status",
            responsive: ["sm"],
            render: (_, item) => (
              <Tag>{item.status === "available" ? "可還原" : "需檢查"}</Tag>
            ),
          },
          {
            title: "操作",
            key: "action",
            width: 130,
            render: (_, item) => (
              <Button
                disabled={
                  !canRestore ||
                  item.status !== "available" ||
                  loading ||
                  !!error
                }
                onClick={() => onRestore([item])}
              >
                還原此項目
              </Button>
            ),
          },
        ]}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={error ? "無法載入，請重試" : "資源回收筒是空的"}
            />
          ),
        }}
      />
      <Space>
        <Button disabled={!page} onClick={() => setPage((v) => v - 1)}>
          上一頁
        </Button>
        <Button
          disabled={items.length < 50}
          onClick={() => setPage((v) => v + 1)}
        >
          下一頁
        </Button>
      </Space>
    </PanelSurface>
  );
}
