import { lazy, Suspense, useEffect, useState } from "react";
import { Alert, Modal, Spin, Button } from "antd";
import {
  api,
  previewSchema,
  errorMessage,
  formatSize,
  type FileEntry,
  type FilePreview,
} from "../../lib/api";
import { downloadFile } from "./download";
const PdfPreview = lazy(() => import("./PdfPreview"));
export const isImage = (entry: FileEntry) =>
  entry.type === "file" &&
  /\.(png|jpe?g|gif|webp|svg|bmp|ico|tiff?|heic|heif)$/i.test(entry.name);

export function PreviewModal({
  entry,
  onClose,
  images = [],
  onNavigate,
}: {
  entry: FileEntry | null;
  onClose: () => void;
  images?: FileEntry[];
  onNavigate?: (entry: FileEntry) => void;
}) {
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    setPreview(null);
    setError(null);
    if (!entry || /\.pdf$/i.test(entry.name)) return;
    const controller = new AbortController();
    api(
      `/files/content?path=${encodeURIComponent(entry.path)}`,
      previewSchema,
      { signal: controller.signal },
    )
      .then((value) => {
        if (!controller.signal.aborted) setPreview(value);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(errorMessage(error));
      });
    return () => controller.abort();
  }, [entry, retry]);
  const imageIndex = images.findIndex((image) => image.path === entry?.path);
  return (
    <Modal
      title={entry?.name || "檔案預覽"}
      open={!!entry}
      onCancel={onClose}
      footer={
        <>
          <Button
            onClick={() =>
              entry &&
              downloadFile(entry.path).catch((e) => setError(errorMessage(e)))
            }
          >
            下載原檔
          </Button>
          <Button aria-label="結束預覽" onClick={onClose}>
            關閉
          </Button>
        </>
      }
      width={900}
      destroyOnHidden
    >
      <div className="preview-meta">
        {entry?.path} · {formatSize(entry?.size ?? null)}
      </div>
      {imageIndex >= 0 && (
        <div className="preview-navigation">
          <Button
            aria-label="上一張圖片"
            disabled={imageIndex === 0}
            onClick={() => onNavigate?.(images[imageIndex - 1])}
          >
            上一張
          </Button>
          <span>
            {imageIndex + 1} / {images.length}
          </span>
          <Button
            aria-label="下一張圖片"
            disabled={imageIndex === images.length - 1}
            onClick={() => onNavigate?.(images[imageIndex + 1])}
          >
            下一張
          </Button>
        </div>
      )}
      {entry && /\.pdf$/i.test(entry.name) ? (
        <Suspense fallback={<Spin />}>
          <PdfPreview key={entry.path} path={entry.path} />
        </Suspense>
      ) : error ? (
        <Alert
          type="error"
          title="無法預覽"
          description={error}
          showIcon
          action={<Button onClick={() => setRetry((v) => v + 1)}>重試</Button>}
        />
      ) : !preview ? (
        <div className="preview-loading">
          <Spin />
        </div>
      ) : preview.type === "text" ? (
        <pre className="text-preview">{preview.content}</pre>
      ) : (
        <img
          className="image-preview"
          alt={preview.name}
          src={`data:${preview.mime_type};base64,${preview.content}`}
          onError={() => setError("瀏覽器無法顯示此圖片格式。")}
        />
      )}
    </Modal>
  );
}
