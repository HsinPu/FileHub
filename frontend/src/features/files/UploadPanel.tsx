import { PanelSurface } from "../../app/PanelSurface";
import { useEffect, useRef, useState } from "react";
import { Alert, Button, Empty, Progress, Space, Tag } from "antd";
import { entrySchema, formatSize } from "../../lib/api";

export type UploadItem = {
  id: string;
  file: File;
  name?: string;
  path: string;
  status: "queued" | "uploading" | "done" | "error" | "cancelled" | "skipped";
  progress: number;
  error?: string;
};

export function useUploads(onComplete: () => void, embedded = false) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const requests = useRef(new Map<string, XMLHttpRequest>());
  const callback = useRef(onComplete);
  callback.current = onComplete;
  const mounted = useRef(true);
  const update = (id: string, values: Partial<UploadItem>) => {
    if (mounted.current)
      setItems((items) =>
        items.map((item) => (item.id === id ? { ...item, ...values } : item)),
      );
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const xhr of requests.current.values()) xhr.abort();
      requests.current.clear();
    };
  }, []);
  useEffect(() => {
    if (
      !items.some(
        (item) => item.status === "queued" || item.status === "uploading",
      )
    )
      return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [items]);
  useEffect(() => {
    for (const item of items.filter((item) => item.status === "queued")) {
      if (requests.current.size >= 2) break;
      if (requests.current.has(item.id)) continue;
      const xhr = new XMLHttpRequest();
      requests.current.set(item.id, xhr);
      update(item.id, { status: "uploading", progress: 0, error: undefined });
      xhr.open(
        "POST",
        `/api/v1/files/upload?path=${encodeURIComponent(item.path)}&name=${encodeURIComponent(item.name || item.file.name)}`,
      );
      xhr.setRequestHeader("Content-Type", "application/octet-stream");
      xhr.setRequestHeader("X-Requested-With", "Files-App");
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable)
          update(item.id, {
            progress: Math.min(
              99,
              Math.round((event.loaded / event.total) * 100),
            ),
          });
      };
      const finish = (values: Partial<UploadItem>) => {
        requests.current.delete(item.id);
        update(item.id, values);
      };
      xhr.onload = () => {
        let body;
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          body = null;
        }
        if (xhr.status === 201 && entrySchema.safeParse(body).success) {
          finish({ status: "done", progress: 100 });
          callback.current();
        } else {
          if (xhr.status === 401)
            window.dispatchEvent(new Event("session-expired"));
          finish({
            status: "error",
            error: body?.error?.message || "上傳失敗，請重試。",
          });
        }
      };
      xhr.onerror = () =>
        finish({ status: "error", error: "連線中斷，請確認網路後重試。" });
      xhr.onabort = () => {
        finish({
          status: "cancelled",
          error: "已停止傳輸；若已傳送完成，請重新整理確認檔案狀態。",
        });
        callback.current();
      };
      xhr.send(item.file);
    }
  }, [items]);
  function add(files: File[], path: string) {
    setOpen(true);
    if (files.length > 100) {
      setNotice("一次最多加入 100 個檔案，請分批上傳。");
      return;
    }
    setNotice(null);
    setItems((items) => [
      ...items,
      ...files.map((file) => ({
        id: crypto.randomUUID(),
        file,
        path,
        status:
          file.size > 512 * 1024 * 1024
            ? ("error" as const)
            : ("queued" as const),
        progress: 0,
        error:
          file.size > 512 * 1024 * 1024 ? "單檔上限為 512 MB。" : undefined,
      })),
    ]);
  }
  function cancel(item: UploadItem) {
    const xhr = requests.current.get(item.id);
    if (xhr) xhr.abort();
    else update(item.id, { status: "cancelled" });
  }
  function addPrepared(
    values: { file: File; path: string; name: string; skipped: boolean }[],
  ) {
    setOpen(true);
    setNotice(null);
    setItems((items) => [
      ...items,
      ...values.map(({ file, path, name, skipped }) => ({
        id: crypto.randomUUID(),
        file,
        path,
        name,
        status: skipped ? ("skipped" as const) : ("queued" as const),
        progress: 0,
        error: skipped ? "同名根目錄已略過，原有內容保持不變。" : undefined,
      })),
    ]);
    callback.current();
  }
  return {
    add,
    addPrepared,
    setOpen,
    open,
    active: items.filter(
      (item) => item.status === "uploading" || item.status === "queued",
    ).length,
    panel: (
      <PanelSurface
        title="檔案傳輸"
        open={open}
        onClose={() => setOpen(false)}
        mode={embedded ? "inline" : "drawer"}
      >
        <p className="muted">
          單檔上限 512 MB，同時傳輸 2 個檔案。同名項目不會被覆寫。
        </p>
        {notice && <Alert title={notice} type="warning" />}
        <Button
          onClick={() =>
            setItems((items) =>
              items.filter(
                (item) =>
                  item.status === "queued" || item.status === "uploading",
              ),
            )
          }
        >
          清除已結束項目
        </Button>
        {!items.length && <Empty description="尚無上傳紀錄" />}
        {items.map((item) => (
          <section
            key={item.id}
            className="transfer-item"
            aria-label={`上傳 ${item.file.name}`}
          >
            <strong>{item.file.name}</strong>
            <p className="muted">
              {item.path || "所有檔案"} · {formatSize(item.file.size)}
            </p>
            <Progress
              percent={item.progress}
              status={
                item.status === "error"
                  ? "exception"
                  : item.status === "done"
                    ? "success"
                    : "normal"
              }
            />
            <Space>
              <Tag>
                {
                  {
                    queued: "等待中",
                    uploading: item.progress === 99 ? "正在儲存" : "上傳中",
                    done: "完成",
                    error: "失敗",
                    cancelled: "已停止",
                    skipped: "已略過",
                  }[item.status]
                }
              </Tag>
              {(item.status === "uploading" || item.status === "queued") && (
                <Button aria-label="取消" onClick={() => cancel(item)}>
                  取消
                </Button>
              )}
              {(item.status === "error" || item.status === "cancelled") &&
                item.file.size <= 512 * 1024 * 1024 && (
                  <Button
                    aria-label="重試"
                    onClick={() =>
                      update(item.id, {
                        status: "queued",
                        progress: 0,
                        error: undefined,
                      })
                    }
                  >
                    重試
                  </Button>
                )}
            </Space>
            {item.error && <p role="alert">{item.error}</p>}
          </section>
        ))}
      </PanelSurface>
    ),
  };
}
