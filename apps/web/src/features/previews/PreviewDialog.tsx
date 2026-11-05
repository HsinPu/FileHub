import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Modal, Spin } from 'antd';
import { PreviewResponseSchema, type ResourceMetadata } from '@filehub/contracts';
import { useResource } from '../../lib/useResource.js';
import { errorText } from '../../lib/client.js';
import { ApiClientError } from '../../lib/api.js';
import { previewBytes } from './binary.js';
import { ToolIcon } from '../../app/ToolIcon.js';
import { drawPdf } from './pdf.js';

export function PreviewDialog({ entry, resource, onExpired, onCancel }: { entry: string; resource: ResourceMetadata; onExpired(): void; onCancel(): void }) {
  const [open, setOpen] = useState(true), [attempt, setAttempt] = useState(0), [details,setDetails]=useState(false);
  const query = new URLSearchParams({ path: resource.path, version: resource.version });
  const base = `/api/entries/${entry}/preview`, info = useResource(open ? `${base}?${query}` : null, PreviewResponseSchema, onExpired);
  const close = () => { setOpen(false); };
  return <Modal open={open} title={<span title={resource.name}>預覽 {resource.name}</span>} rootClassName="preview-root" className={`preview-dialog${info.value?.kind==='text'?' text-preview':''}`} width="100%" closable={false} onCancel={close} afterClose={onCancel} destroyOnHidden footer={null}>
    <div className="preview-tools" role="group" aria-label="預覽工具列"><Button type="text" aria-label="關閉預覽" title="關閉預覽" onClick={close}><ToolIcon name="close"/></Button><div className="preview-actions"><Button type="text" aria-label="重試預覽" title="重試預覽" onClick={()=>{setAttempt(value=>value+1);info.reload();}}><ToolIcon name="refresh"/></Button><Button type="text" aria-label="下載原檔" title="下載原檔" href={`/api/entries/${entry}/download?${query}`}><ToolIcon name="download"/></Button><Button type="text" aria-label="預覽資訊" title="預覽資訊" aria-expanded={details} aria-controls="preview-details" onClick={()=>setDetails(!details)}><ToolIcon name="info"/></Button></div></div>
    <div id="preview-details" className="preview-details" hidden={!details}><p className="preview-path" tabIndex={0} aria-label="預覽相對路徑">{resource.path}</p><p>安全預覽；文字唯讀，PDF 僅第一頁。完整內容請下載原檔。</p></div>
    {info.loading && <p role="status"><Spin size="small"/> 正在檢查預覽。</p>}
    {!!info.error && <Alert type="error" title={errorText(info.error)}/>}
    {info.value?.kind === 'unsupported' && <Alert type="info" title={info.value.reason === 'size' ? '檔案超過預覽上限，請下載原檔。' : '目前無法預覽此格式或內容，請下載原檔。'}/>}
    {open && info.value && info.value.kind !== 'unsupported' && <PreviewContent key={`${resource.version}:${attempt}`} url={`${base}/content?${query}`} kind={info.value.kind} name={resource.name} onExpired={onExpired}/>}
  </Modal>;
}
function PreviewContent({ url, kind, name, onExpired }: { url: string; kind: 'image' | 'text' | 'pdf'; name: string; onExpired(): void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<{ text?: string; image?: string; ready?: boolean; error?: string }>({});
  useEffect(() => {
    const controller = new AbortController(); let objectUrl: string | undefined;
    void (async () => {
      const { bytes, mime } = await previewBytes(url, controller.signal);
      if (controller.signal.aborted) return;
      if (kind === 'text' && mime === 'text/plain') setState({ text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), ready: true });
      else if (kind === 'image' && mime === 'image/jpeg') { objectUrl = URL.createObjectURL(new Blob([bytes], { type: mime })); setState({ image: objectUrl }); }
      else if (kind === 'pdf' && mime === 'application/pdf' && canvas.current) { await drawPdf(bytes, canvas.current, controller.signal); if (!controller.signal.aborted) setState({ ready: true }); }
      else throw new Error();
    })().catch((error: unknown) => {
      if (controller.signal.aborted) return;
      if (error instanceof ApiClientError && error.status === 401) onExpired();
      else setState({ error: '預覽載入失敗或內容不支援。可重試預覽或下載原檔。' });
    });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url, kind, onExpired]);
  return <div className={`preview-content kind-${kind}`}>
    {!state.ready && !state.error && <p role="status"><Spin size="small"/> 正在載入預覽。</p>}
    {state.error && <Alert type="warning" title={state.error}/>}
    {state.text !== undefined && <pre tabIndex={0} aria-label="純文字預覽">{state.text}</pre>}
    {state.image && <img src={state.image} alt={name} onLoad={() => { setState((value) => ({ ...value, ready: true })); }} onError={() => { setState({ error: '圖片無法顯示，可重試或下載原檔。' }); }}/>}
    {kind === 'pdf' && <><p className="subtle">僅預覽第一頁；完整內容請下載原檔。</p><canvas ref={canvas} aria-label="PDF 第一頁預覽" role="img" hidden={!!state.error}/></>}
  </div>;
}
