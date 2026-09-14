import { useEffect, useRef, useState } from "react";
import { Alert, Button, Space, Spin } from "antd";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

function Page({
  document,
  number,
}: {
  document: PDFDocumentProxy;
  number: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let task:
      | ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]>
      | undefined;
    document
      .getPage(number)
      .then(async (page) => {
        if (cancelled || !host.current) return;
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(
          1600 / base.width,
          Math.sqrt(8_000_000 / (base.width * base.height)),
        );
        const viewport = page.getViewport({ scale });
        const canvas = window.document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.setAttribute("aria-label", `PDF 第 ${number} 頁`);
        canvas.setAttribute("role", "img");
        host.current.replaceChildren(canvas);
        task = page.render({ canvas, viewport });
        await task.promise;
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [document, number]);
  return (
    <div className="pdf-page">
      {error ? (
        <Alert type="error" title="此頁無法繪製，請下載原檔查看。" />
      ) : (
        !ready && <Spin />
      )}
      <div ref={host} data-rendered={ready} />
    </div>
  );
}

export default function PdfPreview({ path }: { path: string }) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [number, setNumber] = useState(1);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setDocument(null);
    setNumber(1);
    setError(false);
    const task = getDocument({
      url: `/api/v1/files/pdf?path=${encodeURIComponent(path)}`,
      withCredentials: true,
      useWasm: false,
      cMapUrl: "/pdfjs/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "/pdfjs/standard_fonts/",
    });
    task.promise
      .then((pdf) => {
        if (cancelled) return;
        if (pdf.numPages > 200) {
          setError(true);
          void task.destroy();
          return;
        }
        setDocument(pdf);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [path, retry]);
  if (error)
    return (
      <Alert
        type="error"
        title="無法預覽 PDF"
        description="支援未加密、50 MB 以內且不超過 200 頁的 PDF；也可以下載原檔查看。"
        action={<Button onClick={() => setRetry((v) => v + 1)}>重試</Button>}
      />
    );
  if (!document) return <Spin />;
  return (
    <div>
      <Space className="preview-navigation">
        <Button
          aria-label="PDF 上一頁"
          disabled={number === 1}
          onClick={() => setNumber((v) => v - 1)}
        >
          上一頁
        </Button>
        <span>
          第 {number} / {document.numPages} 頁
        </span>
        <Button
          aria-label="PDF 下一頁"
          disabled={number === document.numPages}
          onClick={() => setNumber((v) => v + 1)}
        >
          下一頁
        </Button>
      </Space>
      <Page key={`${retry}-${number}`} document={document} number={number} />
    </div>
  );
}
