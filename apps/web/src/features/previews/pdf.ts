import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

export async function drawPdf(bytes: Uint8Array<ArrayBuffer>, canvas: HTMLCanvasElement, signal: AbortSignal): Promise<void> {
  const pdf = await import('pdfjs-dist');
  if (signal.aborted) return;
  pdf.GlobalWorkerOptions.workerSrc = workerUrl;
  const worker = new pdf.PDFWorker();
  const task = pdf.getDocument({ data: bytes, worker, enableXfa: false, disableFontFace: true, useSystemFonts: false, useWasm: false, useWorkerFetch: false, stopAtErrors: true, maxImageSize: 4000000, canvasMaxAreaInBytes: 16000000, isOffscreenCanvasSupported: false, isImageDecoderSupported: false, verbosity: 0 });
  let render: ReturnType<Awaited<ReturnType<Awaited<typeof task.promise>['getPage']>>['render']> | undefined;
  let timedOut = false;
  const stop = () => { render?.cancel(); worker.destroy(); void task.destroy().catch(() => undefined); };
  const timer = setTimeout(() => { timedOut = true; stop(); }, 5000);
  signal.addEventListener('abort', stop, { once: true });
  try {
    const document = await task.promise;
    if (signal.aborted || timedOut) throw new Error();
    const page = await document.getPage(1), base = page.getViewport({ scale: 1 });
    if (!Number.isFinite(base.width * base.height) || base.width <= 0 || base.height <= 0) throw new Error();
    const scale = Math.min(1.5, Math.sqrt(4000000 / (base.width * base.height)), 1600 / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });
    canvas.width = Math.max(1, Math.floor(viewport.width)); canvas.height = Math.max(1, Math.floor(viewport.height));
    render = page.render({ canvas, viewport, annotationMode: pdf.AnnotationMode.DISABLE });
    await render.promise;
    if (signal.aborted || timedOut) throw new Error();
  } finally { clearTimeout(timer); signal.removeEventListener('abort', stop); stop(); }
}
